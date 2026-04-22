import { ExperimentRun, SensorDataPoint } from "./types";

/**
 * Resolve the best-available anomaly signal for a single sample.
 *
 * The server-side CSV processor already resolves the upstream priority
 *   anomaly_final_mgal → anomaly_best_mgal → anomaly_value_mgal
 * into `anomalyValue`. On the client we therefore only need to fall back to
 * `anomalySmoothed` when `anomalyValue` is missing/non-finite.
 */
export function getAnomalyValue(p: SensorDataPoint): number | null {
  if (p.anomalyValue != null && isFinite(p.anomalyValue)) return p.anomalyValue;
  if (p.anomalySmoothed != null && isFinite(p.anomalySmoothed)) return p.anomalySmoothed;
  return null;
}

/** Return the median of a numeric array (does NOT mutate input). */
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Min / max in O(n) without spreading (safe for very large arrays). */
function minMax(values: number[]): [number, number] {
  let lo =  Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

export interface RunStats {
  // Identity
  runId: string;
  experimentType: string;
  processingSource: 'raw' | 'processed' | 'live' | 'simulated';
  // Counts
  sampleCount: number;        // total samples (incl. ones missing anomaly)
  validCount: number;         // samples used for anomaly stats
  durationSec: number | null;
  // Anomaly stats (mGal)
  meanAnomaly:   number;
  medianAnomaly: number;
  stdAnomaly:    number;
  minAnomaly:    number;
  maxAnomaly:    number;
  // Quality flags
  pctStationary: number;      // 0–100
  pctOutliers:   number;      // 0–100
  // Geographic extent
  latRange: [number, number];
  lngRange: [number, number];
}

/**
 * Compute run-level statistics from a single ExperimentRun.
 *
 * This is a pure function: it never mutates `run` or `run.points`.
 * Returns `null` for completely empty runs (caller should handle).
 */
export function computeRunStats(run: ExperimentRun): RunStats | null {
  const points = run.points;
  if (!points || points.length === 0) return null;

  // Pull anomaly values via the resolution helper
  const anomalyVals: number[] = [];
  for (const p of points) {
    const v = getAnomalyValue(p);
    if (v != null) anomalyVals.push(v);
  }

  // If the run has no usable anomaly signal at all, still emit identity + extents
  const hasAnomaly = anomalyVals.length > 0;

  let meanAnomaly = NaN, medianAnomaly = NaN, stdAnomaly = NaN, minA = NaN, maxA = NaN;
  if (hasAnomaly) {
    const sum = anomalyVals.reduce((a, b) => a + b, 0);
    meanAnomaly   = sum / anomalyVals.length;
    medianAnomaly = median(anomalyVals);
    const variance = anomalyVals.reduce((a, b) => a + (b - meanAnomaly) ** 2, 0) / anomalyVals.length;
    stdAnomaly = Math.sqrt(variance);
    [minA, maxA] = minMax(anomalyVals);
  }

  // Geographic extent (uses every point, not just anomaly-valid ones)
  const lats = points.map(p => p.latitude).filter(v => isFinite(v));
  const lngs = points.map(p => p.longitude).filter(v => isFinite(v));
  const latRange: [number, number] = lats.length ? minMax(lats) : [NaN, NaN];
  const lngRange: [number, number] = lngs.length ? minMax(lngs) : [NaN, NaN];

  // Duration
  const tsFirst = points[0]?.timestamp;
  const tsLast  = points[points.length - 1]?.timestamp;
  const durationSec = (tsFirst && tsLast)
    ? (tsLast.getTime() - tsFirst.getTime()) / 1000
    : null;

  // Quality flags (over total sample count — denominator-aware)
  const nStationary = points.filter(p => p.platformStationary === true).length;
  const nOutliers   = points.filter(p => p.outlierFlag === true).length;
  const denom = points.length;
  const pctStationary = denom > 0 ? (nStationary / denom) * 100 : 0;
  const pctOutliers   = denom > 0 ? (nOutliers   / denom) * 100 : 0;

  // processingSource: prefer the explicit field; else map from run.mode
  let processingSource: RunStats['processingSource'];
  if (run.processingSource) {
    processingSource = run.processingSource;
  } else if (run.mode === 'live') {
    processingSource = 'live';
  } else if (run.mode === 'simulated') {
    processingSource = 'simulated';
  } else {
    processingSource = 'processed';
  }

  return {
    runId: run.runId,
    experimentType: run.experimentId,
    processingSource,
    sampleCount: points.length,
    validCount: anomalyVals.length,
    durationSec,
    meanAnomaly,
    medianAnomaly,
    stdAnomaly,
    minAnomaly: minA,
    maxAnomaly: maxA,
    pctStationary,
    pctOutliers,
    latRange,
    lngRange,
  };
}

/** Format a duration in seconds into a compact human string. */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '—';
  if (sec < 60) return `${sec.toFixed(1)} s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(2)} h`;
}

/** Compact number formatter that returns an em-dash for non-finite input. */
export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(digits);
}
