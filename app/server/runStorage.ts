import * as fs from "fs";
import * as path from "path";
import type { SensorDataPointDTO } from "@shared/schema";

export interface StoredRun {
  experiment_id: string;
  run_id: string;
  device_id: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  processing_status?: "unprocessed" | "processing" | "processed" | "failed";
  run_metadata?: {
    location?: string;
    notes?: string;
  };
  experiment_metadata?: {
    location?: string;
    operator?: string;
    description?: string;
    grid_spacing?: string;
    sensor_configuration?: string;
    notes?: string;
  };
  points: SensorDataPointDTO[];
}

const RUNS_DIR = path.join(process.cwd(), "data", "runs");

function safeSegment(value: string | undefined, fallback: string): string {
  const cleaned = (value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "_");
  return cleaned || fallback;
}

function runKey(experimentId: string, runId: string): string {
  return `${experimentId}/${runId}`;
}

function timestampToIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

class JsonRunStorage {
  private runs = new Map<string, StoredRun>();
  private writeQueues = new Map<string, Promise<void>>();

  constructor() {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    this.loadFromDisk();
  }

  listRuns(): StoredRun[] {
    return Array.from(this.runs.values())
      .map((run) => ({
        ...run,
        points: [...run.points],
      }))
      .sort((a, b) => b.start_time.localeCompare(a.start_time));
  }

  async appendTelemetryPoint(point: SensorDataPointDTO): Promise<void> {
    const experimentId = safeSegment(point.experiment_id, "unassigned");
    const runId = safeSegment(point.run_id, "live");
    const deviceId = point.device_id || "unknown";
    const key = runKey(experimentId, runId);

    const existing = this.runs.get(key);
    const run: StoredRun = existing ?? {
      experiment_id: experimentId,
      run_id: runId,
      device_id: deviceId,
      start_time: timestampToIso(point.timestamp),
      processing_status: "unprocessed",
      run_metadata: {
        location: deviceId,
        notes: "",
      },
      experiment_metadata: {},
      points: [],
    };

    run.device_id = run.device_id || deviceId;
    run.points.push(point);
    run.end_time = timestampToIso(point.timestamp);
    run.duration = Math.max(0, (new Date(run.end_time).getTime() - new Date(run.start_time).getTime()) / 1000);
    this.runs.set(key, run);

    const previousWrite = this.writeQueues.get(key) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(() => this.writeRunFile(run));
    this.writeQueues.set(key, nextWrite);
    await nextWrite;
  }

  private loadFromDisk(): void {
    if (!fs.existsSync(RUNS_DIR)) return;

    const experimentDirs = fs.readdirSync(RUNS_DIR, { withFileTypes: true });
    for (const experimentDir of experimentDirs) {
      if (!experimentDir.isDirectory()) continue;

      const experimentPath = path.join(RUNS_DIR, experimentDir.name);
      const files = fs.readdirSync(experimentPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".json")) continue;

        const filePath = path.join(experimentPath, file.name);
        try {
          const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as StoredRun;
          if (!parsed.experiment_id || !parsed.run_id || !Array.isArray(parsed.points)) {
            console.warn("[runs] ignored malformed run file:", filePath);
            continue;
          }

          const experimentId = safeSegment(parsed.experiment_id, "unassigned");
          const runId = safeSegment(parsed.run_id, "live");
          this.runs.set(runKey(experimentId, runId), {
            experiment_id: experimentId,
            run_id: runId,
            device_id: parsed.device_id || "unknown",
            start_time: parsed.start_time || timestampToIso(parsed.points[0]?.timestamp),
            end_time: parsed.end_time || timestampToIso(parsed.points[parsed.points.length - 1]?.timestamp),
            duration: parsed.duration,
            processing_status: parsed.processing_status || "unprocessed",
            run_metadata: parsed.run_metadata || {
              location: parsed.device_id || "unknown",
              notes: "",
            },
            experiment_metadata: parsed.experiment_metadata || {},
            points: parsed.points,
          });
        } catch (err: any) {
          console.warn("[runs] failed to load run file:", filePath, err?.message ?? err);
        }
      }
    }

    console.log(`[runs] loaded ${this.runs.size} saved run(s) from ${RUNS_DIR}`);
  }

  private async writeRunFile(run: StoredRun): Promise<void> {
    const experimentId = safeSegment(run.experiment_id, "unassigned");
    const runId = safeSegment(run.run_id, "live");
    const dir = path.join(RUNS_DIR, experimentId);
    const filePath = path.join(dir, `${runId}.json`);
    const tmpPath = `${filePath}.tmp`;

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(tmpPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    await fs.promises.rename(tmpPath, filePath);
  }

  async updateRunMetadata(
    experimentId: string,
    runId: string,
    metadata: Partial<NonNullable<StoredRun["run_metadata"]>> & {
      start_time?: string;
      end_time?: string;
      duration?: number;
      processing_status?: StoredRun["processing_status"];
    },
  ): Promise<StoredRun> {
    const safeExperiment = safeSegment(experimentId, "unassigned");
    const safeRun = safeSegment(runId, "live");
    const key = runKey(safeExperiment, safeRun);
    const run = this.runs.get(key);
    if (!run) throw new Error(`Stored run not found: ${safeExperiment}/${safeRun}`);

    run.run_metadata = {
      ...(run.run_metadata || {}),
      location: metadata.location ?? run.run_metadata?.location,
      notes: metadata.notes ?? run.run_metadata?.notes,
    };
    if (metadata.start_time) run.start_time = timestampToIso(metadata.start_time);
    if (metadata.end_time) run.end_time = timestampToIso(metadata.end_time);
    if (typeof metadata.duration === "number" && Number.isFinite(metadata.duration)) run.duration = metadata.duration;
    if (metadata.processing_status) run.processing_status = metadata.processing_status;

    await this.writeRunFile(run);
    return { ...run, points: [...run.points] };
  }

  async updateExperimentMetadata(
    experimentId: string,
    metadata: NonNullable<StoredRun["experiment_metadata"]>,
  ): Promise<StoredRun[]> {
    const safeExperiment = safeSegment(experimentId, "unassigned");
    const updated: StoredRun[] = [];

    for (const run of Array.from(this.runs.values())) {
      if (safeSegment(run.experiment_id, "unassigned") !== safeExperiment) continue;
      run.experiment_metadata = {
        ...(run.experiment_metadata || {}),
        ...metadata,
      };
      await this.writeRunFile(run);
      updated.push({ ...run, points: [...run.points] });
    }

    return updated;
  }
}

export const runStorage = new JsonRunStorage();
