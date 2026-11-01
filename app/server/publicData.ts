import type { StoredRun } from "./runStorage";

// Public views expose normalized measurements, never arbitrary source columns.
const pointFields = [
  "timestamp", "latitude", "longitude", "anomalyValue", "anomalySmoothed",
  "ax", "ay", "az", "gx", "gy", "gz", "pressure", "temperature", "altitude",
  "speed", "hdop", "satellites", "fixQuality", "platformStationary", "outlierFlag",
  "experiment_id", "run_id", "runMode",
] as const;

export function publicTelemetryPoint(point: Record<string, any>) {
  return Object.fromEntries(pointFields.filter(key => point[key] !== undefined).map(key => [key, point[key]]));
}

export function publicExperiment(experiment: Record<string, any>) {
  return { experiment_id: experiment.experiment_id, name: experiment.name, experimentType: experiment.experimentType };
}

export function publicRun(run: StoredRun) {
  return {
    run_id: run.run_id, experiment_id: run.experiment_id, assigned_experiment_id: run.assigned_experiment_id,
    start_time: run.start_time, end_time: run.end_time, duration: run.duration,
    mode: run.mode, processing_source: run.processing_source, processing_status: run.processing_status,
    experiment_metadata: publicExperiment(run.experiment_metadata || {}),
    points: run.points.map(publicTelemetryPoint),
    ...(run.processed_points ? { processed_points: run.processed_points.map(publicTelemetryPoint) } : {}),
  };
}
