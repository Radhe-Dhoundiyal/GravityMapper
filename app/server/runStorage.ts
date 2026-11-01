import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { persistedExperiments as experiments, persistedRuns as runs, persistedUploads as uploads } from "@shared/schema";
import type { SensorDataPointDTO } from "@shared/schema";
import { requireDatabase, StorageError } from "./database";

export interface StoredRun {
  experiment_id: string;
  assigned_experiment_id?: string | null;
  run_id: string;
  device_id: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  mode?: "live" | "simulated" | "uploaded";
  processing_source?: "raw" | "processed";
  processing_status?: "unprocessed" | "processing" | "processed" | "failed";
  run_metadata?: { location?: string; notes?: string };
  experiment_metadata?: Record<string, any>;
  provenance?: { reported_origin: string; independently_verified: false; notes?: string };
  points: Array<Omit<SensorDataPointDTO, "timestamp"> & { timestamp: string | Date; source_fields?: Record<string, string> }>;
  processed_points?: Record<string, any>[];
  source_sha256?: string;
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export class PostgresRunStorage {
  async listRuns(): Promise<StoredRun[]> {
    const rows = await requireDatabase().select({ document: runs.document, assignment: runs.experimentId, metadata: experiments.metadata })
      .from(runs).leftJoin(experiments, eq(runs.experimentId, experiments.id));
    return rows.map(row => ({ ...row.document, assigned_experiment_id: row.assignment, experiment_metadata: row.metadata ?? {} }) as StoredRun)
      .sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time));
  }

  async getRun(experimentId: string, runId: string): Promise<StoredRun> {
    const [row] = await requireDatabase().select().from(runs).where(eq(runs.id, runId));
    if (!row || row.document.experiment_id !== experimentId) throw new StorageError("Stored run not found", 404);
    return row.document as StoredRun;
  }

  async listExperiments() {
    return (await requireDatabase().select().from(experiments)).map(row => ({ ...row.metadata, experiment_id: row.id }));
  }

  async updateExperimentMetadata(experimentId: string, metadata: Record<string, any>) {
    return requireDatabase().transaction(async tx => {
      await tx.insert(experiments).values({ id: experimentId, metadata: {} }).onConflictDoNothing();
      const [row] = await tx.select().from(experiments).where(eq(experiments.id, experimentId)).for("update");
      const updated = { ...row.metadata, ...metadata };
      await tx.update(experiments).set({ metadata: updated }).where(eq(experiments.id, experimentId));
      return { ...updated, experiment_id: experimentId };
    });
  }

  async importRun(run: StoredRun, original: Buffer, filename: string, fingerprint: string) {
    const hash = sha256(original);
    return requireDatabase().transaction(async tx => {
      await tx.insert(experiments).values({ id: run.experiment_id, metadata: run.experiment_metadata ?? {} }).onConflictDoNothing();
      const inserted = await tx.insert(runs).values({
        id: run.run_id, experimentId: run.experiment_id, fingerprint,
        document: { ...run, source_sha256: hash },
      }).onConflictDoNothing().returning({ id: runs.id });
      const [row] = await tx.select().from(runs).where(eq(runs.id, run.run_id)).for("update");
      if (!inserted.length && row.fingerprint !== fingerprint) {
        throw new StorageError("This run ID already exists with different data. The existing run was not changed.", 409);
      }
      await tx.insert(uploads).values({ sha256: hash, runId: run.run_id, filename, originalBase64: original.toString("base64") }).onConflictDoNothing();
      return { run: { ...row.document, assigned_experiment_id: row.experimentId } as StoredRun, duplicate: !inserted.length, saved: true };
    });
  }

  async originalUpload(runId: string) {
    const [row] = await requireDatabase().select().from(uploads).where(eq(uploads.runId, runId));
    if (!row) throw new StorageError("No original CSV available for this run", 404);
    return { filename: row.filename, bytes: Buffer.from(row.originalBase64, "base64"), sha256: row.sha256 };
  }

  async removeExperiment(experimentId: string) {
    return requireDatabase().transaction(async tx => {
      await tx.update(runs).set({ experimentId: null }).where(eq(runs.experimentId, experimentId));
      await tx.delete(experiments).where(eq(experiments.id, experimentId));
    });
  }

  async appendTelemetryPoint(point: SensorDataPointDTO, source: Record<string, any> = point) {
    const experimentId = point.experiment_id || "unassigned";
    const runId = point.run_id || "live";
    const timestamp = point.timestamp.toISOString();
    const observation = { ...point, timestamp, source_observation: source };
    return requireDatabase().transaction(async tx => {
      await tx.insert(experiments).values({ id: experimentId, metadata: {} }).onConflictDoNothing();
      await tx.insert(runs).values({ id: runId, experimentId, document: {
        experiment_id: experimentId, run_id: runId, device_id: point.device_id || "unknown",
        mode: point.runMode || "live", start_time: timestamp, points: [], processing_status: "unprocessed",
      } }).onConflictDoNothing();
      const [row] = await tx.select().from(runs).where(eq(runs.id, runId)).for("update");
      const run = row.document as StoredRun;
      if (row.fingerprint || run.experiment_id !== experimentId || run.device_id !== (point.device_id || "unknown")) {
        throw new StorageError("Run ID conflicts with an existing recording or import", 409);
      }
      const existing = run.points.find(p => new Date(p.timestamp).toISOString() === timestamp);
      if (existing) {
        if (canonicalJson(existing) !== canonicalJson(observation)) throw new StorageError("Different telemetry already exists at this timestamp", 409);
        return false;
      }
      run.points.push(observation);
      run.start_time = [run.start_time, timestamp].sort()[0];
      run.end_time = [run.end_time || timestamp, timestamp].sort().at(-1)!;
      run.duration = (Date.parse(run.end_time) - Date.parse(run.start_time)) / 1000;
      await tx.update(runs).set({ document: run }).where(eq(runs.id, runId));
      return true;
    });
  }

  async updateRunMetadata(experimentId: string, runId: string, metadata: Record<string, any>): Promise<StoredRun> {
    return requireDatabase().transaction(async tx => {
      const [row] = await tx.select().from(runs).where(eq(runs.id, runId)).for("update");
      if (!row || row.document.experiment_id !== experimentId) throw new StorageError("Stored run not found", 404);
      const run = row.document as StoredRun;
      const { assigned_experiment_id: assignment, location, notes, ...fields } = metadata;
      if (assignment !== undefined && assignment !== null) {
        const [experiment] = await tx.select().from(experiments).where(eq(experiments.id, assignment));
        if (!experiment) throw new StorageError("Assigned experiment not found", 404);
      }
      run.run_metadata = { ...run.run_metadata, ...(location !== undefined ? { location } : {}), ...(notes !== undefined ? { notes } : {}) };
      Object.assign(run, fields);
      await tx.update(runs).set({ document: run, ...(assignment !== undefined ? { experimentId: assignment } : {}) }).where(eq(runs.id, runId));
      return { ...run, assigned_experiment_id: assignment !== undefined ? assignment : row.experimentId };
    });
  }
}

export const runStorage = new PostgresRunStorage();
