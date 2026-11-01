import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";
import { parseCsvContent } from "./csvProcessor";
import { runStorage } from "./runStorage";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = process.cwd();
const RAW_RUN_DIR = path.join(WORKSPACE_ROOT, "data", "raw", "processed-runs");
const PROCESSED_DIR = path.join(WORKSPACE_ROOT, "data", "processed");
const PIPELINE_SCRIPT = path.join(WORKSPACE_ROOT, "analysis", "scripts", "gravity_pipeline.py");

interface StoredRunFile {
  experiment_id: string;
  run_id: string;
  device_id?: string;
  start_time?: string;
  points: Array<Record<string, any>>;
}

export interface ProcessRunResult {
  points_processed: number;
  mean_anomaly: number | null;
  std_anomaly: number | null;
  processed_path: string;
  points: Record<string, any>[];
  warnings: string[];
}

function safeSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "_");
  return cleaned || "unknown";
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// An empty CSV cell means "not measured". Never synthesize neutral sensor
// values: they can make an incomplete run look like a successful measurement.
function optionalNumber(value: unknown): number | "" {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return "";
  if (typeof value !== "number" && typeof value !== "string") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function optionalFlag(value: unknown): 0 | 1 | "" {
  if (value === true || value === 1 || value === "1" || value === "true") return 1;
  if (value === false || value === 0 || value === "0" || value === "false") return 0;
  return "";
}

function requiredTimestamp(value: unknown, row: number): string {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(`Cannot process run: sample ${row} has no timestamp.`);
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Cannot process run: sample ${row} has an invalid timestamp.`);
  }
  return date.toISOString();
}

function originalField(point: Record<string, any>, field: string): unknown {
  const source = point.source_fields;
  if (!source || typeof source !== "object") return undefined;
  const key = Object.keys(source).find(k => k.trim().toLowerCase() === field);
  return key ? source[key] : undefined;
}

async function findPython(): Promise<string | null> {
  const candidates = [
    "python3",
    path.join(WORKSPACE_ROOT, ".pythonlibs", "bin", "python3"),
    "/usr/bin/python3",
    "python",
  ];
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--version"], { timeout: 4000 });
      return cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function runToRawCsv(run: StoredRunFile): string {
  const headers = [
    "timestamp_utc", "run_id", "experiment_id", "sample_index",
    "ax_raw", "ay_raw", "az_raw",
    "gx_raw", "gy_raw", "gz_raw",
    "temp_mpu", "pressure_hpa", "temp_bmp", "altitude_baro_m",
    "gps_lat", "gps_lon", "gps_alt_m",
    "gps_hdop", "gps_fix_quality", "gps_satellites",
    "platform_stationary", "isolation_active",
    "anomaly_value_mgal", "notes",
  ];

  const rows = run.points.map((point, index) => {
    const timestamp = requiredTimestamp(point.timestamp, index + 1);

    // Keep sensor channels distinct. "temperature" or "altitude" alone
    // does not establish that both the IMU and barometer measured them.
    return [
      timestamp,
      run.run_id,
      run.experiment_id,
      index,
      optionalNumber(point.ax),
      optionalNumber(point.ay),
      optionalNumber(point.az),
      optionalNumber(point.gx),
      optionalNumber(point.gy),
      optionalNumber(point.gz),
      optionalNumber(originalField(point, "temp_mpu")),
      optionalNumber(point.pressure),
      optionalNumber(originalField(point, "temp_bmp")),
      optionalNumber(originalField(point, "altitude_baro_m")),
      optionalNumber(point.latitude),
      optionalNumber(point.longitude),
      optionalNumber(originalField(point, "gps_alt_m")),
      optionalNumber(point.hdop),
      optionalNumber(point.fixQuality),
      optionalNumber(point.satellites),
      optionalFlag(point.platformStationary),
      optionalFlag(originalField(point, "isolation_active")),
      optionalNumber(originalField(point, "anomaly_value_mgal") ?? point.anomalyValue),
      originalField(point, "notes") ?? "",
    ].map(csvEscape).join(",");
  });

  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

function std(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export async function processStoredRun(experimentId: string, runId: string): Promise<ProcessRunResult> {
  const safeExperiment = safeSegment(experimentId);
  const safeRun = safeSegment(runId);
  const run = await runStorage.getRun(experimentId, runId);

  const python = await findPython();
  if (!python) {
    throw new Error("Python is not available on this server.");
  }
  if (!fs.existsSync(PIPELINE_SCRIPT)) {
    throw new Error(`Pipeline script not found: ${PIPELINE_SCRIPT}`);
  }

  if (!Array.isArray(run.points) || run.points.length === 0) {
    throw new Error("Stored run has no points to process.");
  }

  // Validate before allocating temporary files or calling the pipeline.
  // Missing values remain empty in the CSV so the scientific calculation
  // rejects unusable samples rather than creating plausible defaults.
  const rawCsv = runToRawCsv(run);
  await fs.promises.mkdir(path.join(RAW_RUN_DIR, safeExperiment), { recursive: true });
  const jobName = `${safeRun}-${randomUUID()}`;
  const rawCsvPath = path.join(RAW_RUN_DIR, safeExperiment, `${jobName}.csv`);
  await fs.promises.writeFile(rawCsvPath, rawCsv, "utf8");

  await execFileAsync(python, [PIPELINE_SCRIPT, rawCsvPath], { timeout: 120_000 });

  const defaultOutput = path.join(PROCESSED_DIR, `${jobName}_processed.csv`);
  if (!fs.existsSync(defaultOutput)) {
    throw new Error(`Pipeline completed but output file was not found: ${defaultOutput}`);
  }

  const finalDir = path.join(PROCESSED_DIR, safeExperiment);
  await fs.promises.mkdir(finalDir, { recursive: true });
  const finalOutput = path.join(finalDir, `${jobName}_processed.csv`);
  await fs.promises.copyFile(defaultOutput, finalOutput);

  const parsed = parseCsvContent(fs.readFileSync(finalOutput, "utf8"), `${safeRun}.csv`);
  await runStorage.updateRunMetadata(experimentId, runId, { processing_status: "processed", processed_points: parsed.points });
  const anomalyValues = parsed.points
    .map((point) => numberOr(point.anomalyValue, NaN))
    .filter(Number.isFinite);
  const mean = anomalyValues.length > 0
    ? anomalyValues.reduce((sum, v) => sum + v, 0) / anomalyValues.length
    : null;

  return {
    points_processed: parsed.points.length,
    mean_anomaly: mean,
    std_anomaly: std(anomalyValues),
    processed_path: path.relative(WORKSPACE_ROOT, finalOutput),
    points: parsed.points,
    warnings: parsed.warnings,
  };
}
