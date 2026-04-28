import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { parseCsvContent } from "./csvProcessor";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = process.cwd();
const RUNS_DIR = path.join(WORKSPACE_ROOT, "data", "runs");
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

function boolInt(value: unknown, fallback = true): 0 | 1 {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === 0 || value === "0" || value === "false") return 0;
  if (value === 1 || value === "1" || value === "true") return 1;
  return fallback ? 1 : 0;
}

function isoTimestamp(value: unknown, fallbackMs: number): string {
  const date = value ? new Date(String(value)) : new Date(fallbackMs);
  return Number.isNaN(date.getTime()) ? new Date(fallbackMs).toISOString() : date.toISOString();
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

function runToRawCsv(run: StoredRunFile): string {
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
    const timestamp = isoTimestamp(point.timestamp, Date.now() + index);
    const hasGps = Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
    const temperature = numberOr(point.temperature, 0);

    return [
      timestamp,
      run.run_id,
      run.experiment_id,
      index,
      numberOr(point.ax, 0),
      numberOr(point.ay, 0),
      numberOr(point.az, 1),
      numberOr(point.gx, 0),
      numberOr(point.gy, 0),
      numberOr(point.gz, 0),
      temperature,
      numberOr(point.pressure, 1013.25),
      temperature,
      numberOr(point.altitude, 0),
      numberOr(point.latitude, 0),
      numberOr(point.longitude, 0),
      numberOr(point.altitude, 0),
      numberOr(point.hdop, 0),
      hasGps ? numberOr(point.fixQuality, 1) : 0,
      numberOr(point.satellites, 0),
      boolInt(point.platformStationary, true),
      1,
      numberOr(point.anomalyValue, 0),
      "",
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
  const runPath = path.join(RUNS_DIR, safeExperiment, `${safeRun}.json`);

  if (!fs.existsSync(runPath)) {
    throw new Error(`Stored run not found: ${safeExperiment}/${safeRun}`);
  }

  const python = await findPython();
  if (!python) {
    throw new Error("Python is not available on this server.");
  }
  if (!fs.existsSync(PIPELINE_SCRIPT)) {
    throw new Error(`Pipeline script not found: ${PIPELINE_SCRIPT}`);
  }

  const run = JSON.parse(fs.readFileSync(runPath, "utf8")) as StoredRunFile;
  if (!Array.isArray(run.points) || run.points.length === 0) {
    throw new Error("Stored run has no points to process.");
  }

  await fs.promises.mkdir(path.join(RAW_RUN_DIR, safeExperiment), { recursive: true });
  const rawCsvPath = path.join(RAW_RUN_DIR, safeExperiment, `${safeRun}.csv`);
  await fs.promises.writeFile(rawCsvPath, runToRawCsv(run), "utf8");

  await execFileAsync(python, [PIPELINE_SCRIPT, rawCsvPath], { timeout: 120_000 });

  const defaultOutput = path.join(PROCESSED_DIR, `${safeRun}_processed.csv`);
  if (!fs.existsSync(defaultOutput)) {
    throw new Error(`Pipeline completed but output file was not found: ${defaultOutput}`);
  }

  const finalDir = path.join(PROCESSED_DIR, safeExperiment);
  await fs.promises.mkdir(finalDir, { recursive: true });
  const finalOutput = path.join(finalDir, `${safeRun}_processed.csv`);
  await fs.promises.copyFile(defaultOutput, finalOutput);

  const parsed = parseCsvContent(fs.readFileSync(finalOutput, "utf8"), `${safeRun}.csv`);
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
