import { SensorDataPoint, ExperimentRun, ExperimentType, RunMode } from './types';
import { nextRunColor } from './runColors';

// Map CSV column names → SensorDataPoint field names
const COL_MAP: Record<string, keyof SensorDataPoint> = {
  // timestamps
  timestamp_utc: 'timestamp',
  timestamp: 'timestamp',
  // position
  gps_lat: 'latitude',
  latitude: 'latitude',
  lat: 'latitude',
  gps_lon: 'longitude',
  longitude: 'longitude',
  lon: 'longitude',
  lng: 'longitude',
  // anomaly
  anomaly_value_mgal: 'anomalyValue',
  anomaly_final_mgal: 'anomalyValue',
  anomalyvalue: 'anomalyValue',
  anomaly_value: 'anomalyValue',
  anomalyValue: 'anomalyValue',
  // smoothed
  anomaly_smoothed_mgal: 'anomalySmoothed',
  anomalysmoothed: 'anomalySmoothed',
  // accelerometer
  ax_raw: 'ax', ax: 'ax',
  ay_raw: 'ay', ay: 'ay',
  az_raw: 'az', az: 'az',
  // gyro
  gx_raw: 'gx', gx: 'gx',
  gy_raw: 'gy', gy: 'gy',
  gz_raw: 'gz', gz: 'gz',
  // environment
  pressure_hpa: 'pressure', pressure: 'pressure',
  temp_bmp: 'temperature', temperature: 'temperature', temp: 'temperature',
  altitude_baro_m: 'altitude', altitude_used_m: 'altitude', altitude: 'altitude',
  // GPS quality
  gps_hdop: 'hdop', hdop: 'hdop',
  gps_satellites: 'satellites', satellites: 'satellites',
  gps_fix_quality: 'fixQuality', fixquality: 'fixQuality',
  // flags
  platform_stationary: 'platformStationary', platformstationary: 'platformStationary',
  outlier_flag: 'outlierFlag', outlierflag: 'outlierFlag',
};

function normaliseKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseVal(raw: string): string | number | boolean | Date {
  const s = raw.trim();
  if (s === '' || s === 'NaN' || s === 'nan' || s === 'NULL') return NaN;
  if (s === '1' || s.toLowerCase() === 'true') return true;
  if (s === '0' || s.toLowerCase() === 'false') return false;
  const n = parseFloat(s);
  if (!isNaN(n)) return n;
  return s;
}

export interface ParseResult {
  run: ExperimentRun;
  warnings: string[];
}

export function parseGADVCsv(content: string, filename: string): ParseResult {
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim());
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    const norm = normaliseKey(h);
    colIndex[norm] = i;
    // Also store original casing
    colIndex[h.trim()] = i;
  });

  // Extract run metadata from the first data row
  const firstRow = lines[1].split(',');
  const getField = (names: string[]): string => {
    for (const n of names) {
      const idx = colIndex[n] ?? colIndex[normaliseKey(n)];
      if (idx !== undefined && firstRow[idx]) return firstRow[idx].trim();
    }
    return '';
  };

  const runId = getField(['run_id', 'runId', 'run_id']) || filename.replace('.csv', '');
  const rawExpId = getField(['experiment_id', 'experimentId', 'experiment_id']) || 'CAL';
  const experimentId = rawExpId as ExperimentType;

  // Detect mode from filename or mode column
  let mode: RunMode = 'uploaded';
  if (filename.includes('sim')) mode = 'simulated';

  // Parse rows into SensorDataPoints
  const points: SensorDataPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    if (cells.length < 3) continue;

    const point: Partial<SensorDataPoint> = {};

    for (const [norm, fieldIdx] of Object.entries(colIndex)) {
      const gadField = COL_MAP[norm] ?? COL_MAP[normaliseKey(norm)];
      if (!gadField) continue;
      const raw = cells[fieldIdx]?.trim() ?? '';
      if (!raw || raw === 'NaN') continue;

      if (gadField === 'timestamp') {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) (point as any).timestamp = d;
      } else {
        const val = parseVal(raw);
        if (val !== undefined && !Number.isNaN(val as any)) {
          (point as any)[gadField] = val;
        }
      }
    }

    if (point.latitude == null || point.longitude == null) {
      warnings.push(`Row ${i + 1}: missing lat/lon, skipped`);
      continue;
    }
    if (point.anomalyValue == null) {
      point.anomalyValue = 0;
    }
    if (!point.timestamp) {
      point.timestamp = new Date();
    }

    points.push(point as SensorDataPoint);
  }

  if (points.length === 0) throw new Error('No valid data rows found in CSV');
  if (warnings.length > 0 && warnings.length > 5) {
    warnings.splice(5, warnings.length - 5, `...and ${warnings.length - 5} more`);
  }

  const startTime = points[0].timestamp;
  const endTime = points[points.length - 1].timestamp;

  const run: ExperimentRun = {
    id: `upload-${Date.now()}`,
    runId,
    experimentId,
    mode,
    startTime,
    endTime,
    location: runId.split('_').slice(2, -1).join('-') || 'unknown',
    notes: `Uploaded from ${filename}`,
    points,
    visible: true,
    color: nextRunColor(),
  };

  return { run, warnings };
}
