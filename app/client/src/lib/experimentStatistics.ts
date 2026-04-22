import { Experiment, ExperimentRun } from "./types";
import { computeRunStats } from "./runStatistics";

export interface ExperimentSummary {
  // Identity
  id: string;
  experimentId: string;
  name: string;
  experimentType: string;
  // Aggregate counts
  numRuns: number;
  totalSamples: number;
  // Aggregate anomaly stats — averaged across constituent runs
  meanAnomaly: number;       // mean of per-run mean anomalies
  meanStd:     number;       // mean of per-run std deviations
  // Time span
  earliestTimestamp: Date | null;
  latestTimestamp:   Date | null;
}

/** Return all runs that belong to the given experiment. Pure. */
export function runsForExperiment(experiment: Experiment, runs: ExperimentRun[]): ExperimentRun[] {
  return runs.filter(r => r.parentExperimentId === experiment.id);
}

/**
 * Compute aggregate statistics for an experiment. Pure — never mutates inputs.
 * Returns a summary even when the experiment has zero runs (with NaN/null fields).
 */
export function computeExperimentSummary(
  experiment: Experiment,
  runs: ExperimentRun[],
): ExperimentSummary {
  const expRuns  = runsForExperiment(experiment, runs);
  const allStats = expRuns.map(r => computeRunStats(r)).filter((s): s is NonNullable<typeof s> => s !== null);

  const totalSamples = expRuns.reduce((acc, r) => acc + r.points.length, 0);

  // Average per-run statistics (treats every run equally regardless of length)
  const validForAnomaly = allStats.filter(s => isFinite(s.meanAnomaly));
  const meanAnomaly = validForAnomaly.length > 0
    ? validForAnomaly.reduce((a, s) => a + s.meanAnomaly, 0) / validForAnomaly.length
    : NaN;

  const validForStd = allStats.filter(s => isFinite(s.stdAnomaly));
  const meanStd = validForStd.length > 0
    ? validForStd.reduce((a, s) => a + s.stdAnomaly, 0) / validForStd.length
    : NaN;

  // Compute time span in O(n) without spreading large arrays into Math.min/max
  let earliestMs = Infinity;
  let latestMs   = -Infinity;
  for (const r of expRuns) {
    for (const p of r.points) {
      const t = p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime();
      if (!isFinite(t)) continue;
      if (t < earliestMs) earliestMs = t;
      if (t > latestMs)   latestMs   = t;
    }
  }
  const earliestTimestamp = isFinite(earliestMs) ? new Date(earliestMs) : null;
  const latestTimestamp   = isFinite(latestMs)   ? new Date(latestMs)   : null;

  return {
    id:             experiment.id,
    experimentId:   experiment.experimentId,
    name:           experiment.name,
    experimentType: experiment.experimentType,
    numRuns:        expRuns.length,
    totalSamples,
    meanAnomaly,
    meanStd,
    earliestTimestamp,
    latestTimestamp,
  };
}
