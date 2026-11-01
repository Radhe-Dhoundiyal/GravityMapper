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
  speed_mps: "speed", speed: "speed",
  // flags
  platform_stationary: "platformStationary", platformstationary: "platformStationary",
  outlier_flag:        "outlierFlag",        outlierflag: "outlierFlag",
};

// ── CSV parsing ───────────────────────────────────────────────────────────────

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
  deviceId: string;
  location: string;
  notes: string;
  warnings: string[];
  points: Record<string, any>[];
}

export function parseCsvRows(content: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const text = content.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && cell !== "") throw new Error("Invalid CSV quoting");
      else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(cell); cell = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some(value => value !== "")) records.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(cell); if (row.some(value => value !== "")) records.push(row);
  const headers = records.shift()?.map(header => header.trim()) ?? [];
  if (headers.length === 0 || new Set(headers.map(norm)).size !== headers.length) throw new Error("Missing or duplicate CSV headers");
  if (records.length === 0 || records.length > 100000) throw new Error("CSV must contain between 1 and 100000 observations");
  return records.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has an incorrect column count`);
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

export function parseCsvContent(content: string, originalName: string): UploadResult {
  const records = parseCsvRows(content);
  const rows = records.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [norm(key), value])));
  const first = rows[0];
  const runId = first.run_id || first.runid || path.basename(originalName, ".csv");
  const experimentId = first.experiment_id || first.experimentid || "CAL";
  for (const row of rows) {
    if ((row.run_id || row.runid || runId) !== runId || (row.experiment_id || row.experimentid || experimentId) !== experimentId) {
      throw new Error("A CSV upload must contain exactly one run and experiment");
    }
  }
  const points = rows.map((row, index) => {
    const point: Record<string, any> = { source_fields: records[index] };
    for (const [column, text] of Object.entries(row)) {
      const field = COL_MAP[column];
      if (!field || text.trim() === "") continue;
      if (field === "timestamp") point.timestamp = text;
      else if (field === "platformStationary" || field === "outlierFlag") {
        const flag = parseBool(text);
        if (flag === undefined) throw new Error(`Invalid flag on CSV row ${index + 2}`);
        point[field] = flag;
      } else {
        const value = Number(text);
        if (Number.isFinite(value)) point[field] = value;
      }
    }
    point.anomalyValue = point.__prio_final ?? point.__prio_best ?? point.__prio_raw;
    delete point.__prio_final; delete point.__prio_best; delete point.__prio_raw;
    if (!Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
        !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 ||
        !Number.isFinite(point.anomalyValue) || !point.timestamp || !Number.isFinite(Date.parse(point.timestamp))) {
      throw new Error(`CSV row ${index + 2} needs valid coordinates, timestamp, and anomaly value; no rows were saved`);
    }
    point.device_id = row.device_id || "unknown";
    point.experiment_id = experimentId;
    point.run_id = runId;
    return point;
  });
  const isProcessed = Object.keys(first).some(header => PROCESSED_MARKERS.has(header));
  return {
    source: isProcessed ? "processed" : "raw", runId, experimentId,
    deviceId: first.device_id || "unknown",
    location: first.location || "unknown",
    notes: first.notes || first.quality_note || "",
    warnings: [], points,
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
