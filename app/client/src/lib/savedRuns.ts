import type { ExperimentRun } from "./types";

export function savedRunToClient(run: any): ExperimentRun {
  const points = (run.processed_points ?? run.points).map((point: any) => ({ ...point, timestamp: new Date(point.timestamp) }));
  const assignment = run.assigned_experiment_id === undefined ? run.experiment_id : run.assigned_experiment_id;
  return {
    id: `saved-${run.run_id}`, runId: run.run_id, experimentId: run.experiment_id,
    mode: run.mode || "live", persisted: true,
    startTime: new Date(run.start_time), endTime: run.end_time ? new Date(run.end_time) : undefined,
    duration: run.duration, processing_status: run.processing_status || "unprocessed",
    processingSource: run.processing_source, location: run.run_metadata?.location || run.device_id || "unknown",
    notes: run.run_metadata?.notes || "", points, visible: true, color: "#3B82F6",
    parentExperimentId: assignment ? `saved-exp-${assignment}` : undefined,
  };
}
