import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = process.cwd();
const PROC_DIR        = path.join(WORKSPACE_ROOT, "data", "processed");
const PIPELINE_SCRIPT = path.join(WORKSPACE_ROOT, "analysis", "scripts", "gravity_pipeline.py");

// ── Column-name helpers ───────────────────────────────────────────────────────

function norm(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, "_");
}

// Markers that only appear in processed (post-pipeline) CSVs
const PROCESSED_MARKERS = new Set([
  "anomaly_final_mgal",
  "anomaly_smoothed_mgal",
  "outlier_flag",
  "pitch_deg",
  "g_wgs84_mgal",
  "anomaly_static_mgal",
]);

// Map normalised column name → SensorDataPoint field
// For anomaly resolution we use internal sentinel names and resolve priority afterwards
const COL_MAP: Record<string, string> = {
  // timestamps
  timestamp_utc: "timestamp",
  timestamp:     "timestamp",
  // position
  gps_lat: "latitude",  latitude: "latitude",  lat: "latitude",
  gps_lon: "longitude", longitude: "longitude", lon: "longitude", lng: "longitude",
  // anomaly — priority resolved below: final > best > raw
  anomaly_final_mgal:  "__prio_final",
  anomaly_best_mgal:   "__prio_best",
  anomaly_value_mgal:  "__prio_raw",
  anomalyvalue:        "__prio_raw",
  anomaly_value:       "__prio_raw",
  // smoothed
  anomaly_smoothed_mgal: "anomalySmoothed",
  anomalysmoothed:       "anomalySmoothed",
  // accel
  ax_raw: "ax", ax: "ax",
  ay_raw: "ay", ay: "ay",
  az_raw: "az", az: "az",
  // gyro
  gx_raw: "gx", gx: "gx",
  gy_raw: "gy", gy: "gy",
  gz_raw: "gz", gz: "gz",
  // environment
  pressure_hpa:    "pressure",    pressure: "pressure",
  temp_bmp:        "temperature", temp_mpu: "temperature",
  temperature:     "temperature", temp: "temperature",
  altitude_used_m: "altitude", altitude_baro_m: "altitude",
  gps_alt_m:       "altitude", altitude: "altitude",
  // GPS quality
  gps_hdop:        "hdop",       hdop: "hdop",
  gps_satellites:  "satellites", satellites: "satellites",
  gps_fix_quality: "fixQuality", fixquality: "fixQuality",
  // flags
  platform_stationary: "platformStationary", platformstationary: "platformStationary",
  outlier_flag:        "outlierFlag",        outlierflag: "outlierFlag",
};

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseNum(s: string): number | undefined {
  if (!s || s === "NaN" || s === "nan" || s === "NULL") return undefined;
  const v = parseFloat(s);
  return isNaN(v) ? undefined : v;
}

function parseBool(s: string): boolean | undefined {
  const t = s.trim();
  if (t === "1" || t.toLowerCase() === "true")  return true;
  if (t === "0" || t.toLowerCase() === "false") return false;
  return undefined;
}

export interface UploadResult {
  source: "raw" | "processed";
  runId: string;
  experimentId: string;
  location: string;
  notes: string;
  warnings: string[];
  points: Record<string, any>[];
}

export function parseCsvContent(content: string, originalName: string): UploadResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const rawHeaders  = lines[0].split(",").map((h) => h.trim());
  const normHeaders = rawHeaders.map(norm);
  const isProcessed = normHeaders.some((h) => PROCESSED_MARKERS.has(h));

  // Build column-index lookup
  const colIdx: Record<string, number> = {};
  normHeaders.forEach((h, i) => { colIdx[h] = i; });

  // Pull run metadata from the first data row
  const firstCells = lines[1].split(",");
  const getMeta = (...names: string[]): string => {
    for (const n of names) {
      const idx = colIdx[norm(n)] ?? colIdx[n];
      if (idx !== undefined && firstCells[idx]?.trim()) return firstCells[idx].trim();
    }
    return "";
  };

  const runId       = getMeta("run_id", "runId")             || originalName.replace(".csv", "");
  const experimentId = getMeta("experiment_id", "experimentId") || "CAL";
  const location    = runId.split("_").slice(2, -1).join("-") || "unknown";

  const warnings: string[] = [];
  const points: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const raw: Record<string, any> = {};

    normHeaders.forEach((nh, ci) => {
      const cellVal = cells[ci]?.trim() ?? "";
      if (!cellVal || cellVal === "NaN" || cellVal === "nan") return;
      const field = COL_MAP[nh];
      if (!field) return;

      if (field === "timestamp") {
        raw.timestamp = cellVal;
      } else if (field === "platformStationary" || field === "outlierFlag") {
        const b = parseBool(cellVal);
        if (b !== undefined) raw[field] = b;
      } else {
        const n = parseNum(cellVal);
        if (n !== undefined) raw[field] = n;
      }
    });

    if (raw.latitude == null || raw.longitude == null) {
      warnings.push(`Row ${i + 1}: missing lat/lon — skipped`);
      continue;
    }

    // Resolve anomaly value: priority final > best > raw
    const anomalyValue =
      raw.__prio_final ??
      raw.__prio_best  ??
      raw.__prio_raw   ??
      0;

    const point: Record<string, any> = {
      timestamp:    raw.timestamp ?? new Date().toISOString(),
      latitude:     raw.latitude,
      longitude:    raw.longitude,
      anomalyValue,
    };

    // Copy optional fields
    const optional = [
      "anomalySmoothed",
      "ax", "ay", "az",
      "gx", "gy", "gz",
      "pressure", "temperature", "altitude",
      "hdop", "satellites", "fixQuality",
      "platformStationary", "outlierFlag",
    ];
    for (const f of optional) {
      if (raw[f] != null) point[f] = raw[f];
    }

    points.push(point);
  }

  if (warnings.length > 8) {
    const extra = warnings.splice(8);
    warnings.push(`…and ${extra.length} more row(s) skipped`);
  }

  return {
    source: isProcessed ? "processed" : "raw",
    runId,
    experimentId,
    location,
    notes: isProcessed ? "Loaded from processed CSV" : "Loaded from raw CSV",
    warnings,
    points,
  };
}

// ── Python environment detection ──────────────────────────────────────────────

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

// ── Pipeline execution ────────────────────────────────────────────────────────

async function runPipeline(
  python: string,
  inputPath: string
): Promise<{ outputPath: string; pipelineWarnings: string[] }> {
  const pipelineWarnings: string[] = [];

  return new Promise((resolve, reject) => {
    execFile(
      python,
      [PIPELINE_SCRIPT, inputPath],
      { timeout: 90_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Pipeline error: ${stderr?.trim() || error.message}`));
          return;
        }
        if (stderr) {
          stderr
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .forEach((l) => pipelineWarnings.push(l));
        }

        const stem       = path.basename(inputPath, ".csv");
        const outputPath = path.join(PROC_DIR, `${stem}_processed.csv`);

        if (!fs.existsSync(outputPath)) {
          reject(
            new Error(
              `Pipeline completed but output file not found: ${outputPath}`
            )
          );
          return;
        }

        resolve({ outputPath, pipelineWarnings });
      }
    );
  });
}

// ── Public entry point ────────────────────────────────────────────────────────

export class NoPythonError extends Error {
  constructor() {
    super(
      "Raw CSV processing requires the Python pipeline. " +
      "Please upload a pre-processed CSV (one that contains anomaly_final_mgal) " +
      "or process the file locally with: python3 analysis/scripts/gravity_pipeline.py <file>"
    );
    this.name = "NoPythonError";
  }
}

export async function processUploadedFile(
  filePath: string,
  originalName: string
): Promise<UploadResult> {
  const content     = fs.readFileSync(filePath, "utf-8");
  const firstLine   = content.split("\n")[0];
  const normHeaders = firstLine.split(",").map(norm);
  const isProcessed = normHeaders.some((h) => PROCESSED_MARKERS.has(h));

  if (isProcessed) {
    // Already processed — parse directly
    return parseCsvContent(content, originalName);
  }

  // Raw CSV: need Python pipeline
  const python = await findPython();
  if (!python) throw new NoPythonError();

  if (!fs.existsSync(PIPELINE_SCRIPT)) {
    throw new Error(`Pipeline script not found: ${PIPELINE_SCRIPT}`);
  }

  const { outputPath, pipelineWarnings } = await runPipeline(python, filePath);
  const processedContent = fs.readFileSync(outputPath, "utf-8");
  const result = parseCsvContent(processedContent, originalName);

  result.source = "raw";
  result.notes  = "Processed by GADV Python pipeline (server-side)";
  result.warnings = [...pipelineWarnings, ...result.warnings];

  return result;
}
