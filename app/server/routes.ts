import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { storage } from "./storage";
import { runStorage, sha256, canonicalJson, type StoredRun } from "./runStorage";
import { StorageError, requireDatabase } from "./database";
import { requireWriteAccess, validWriteToken } from "./writeAccess";
import { insertAnomalyPointSchema, sensorDataPointSchema } from "@shared/schema";
import { processUploadedFile, parseCsvRows, NoPythonError } from "./csvProcessor";
import { processStoredRun } from "./runProcessor";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.csv`),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 3, fieldSize: 4096 },
  fileFilter: (_req, file, cb) => cb(null, file.originalname.toLowerCase().endsWith(".csv")),
});
const id = z.string().min(1).max(200);
const text = z.string().max(10000).optional();
let activeJobs = 0;
const limitJobs: RequestHandler = (_req, res, next) => {
  if (activeJobs >= 2) { res.status(429).json({ message: "Two import/processing jobs are already running. Try again shortly." }); return; }
  activeJobs++;
  res.once("finish", () => { activeJobs--; });
  next();
};
const route = (handler: (req: Request, res: Response) => Promise<any>): RequestHandler =>
  (req, res, next) => { handler(req, res).catch(next); };

export async function registerRoutes(app: Express): Promise<Server> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  // Bearer authentication runs before parsing or writing uploaded files.
  app.use("/api", (req, res, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) requireWriteAccess(req, res, next);
    else next();
  });
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 64 * 1024 });
  function broadcast(data: unknown) {
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); });
  }
  async function saveTelemetry(raw: any) {
    const rich = sensorDataPointSchema.parse(raw);
    const inserted = await runStorage.appendTelemetryPoint(rich, raw);
    if (!inserted) return;
    await storage.createAnomalyPoint({ latitude: String(rich.latitude), longitude: String(rich.longitude), anomalyValue: String(rich.anomalyValue), timestamp: rich.timestamp });
    broadcast({ type: "newAnomalyPoint", data: rich });
  }
  wss.on("connection", ws => {
    storage.getAllAnomalyPoints().then(points => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "initialData", data: points }));
    });
    ws.on("message", async message => {
      try {
        const packet = JSON.parse(message.toString());
        if (!validWriteToken(packet.token)) throw new StorageError("A valid write access token is required", 401);
        if (packet.type === "newAnomalyPoint") {
          await saveTelemetry(packet.data);
          ws.send(JSON.stringify({ type: "saved", run_id: packet.data.run_id }));
        } else if (packet.type === "clearData") {
          await storage.clearAllAnomalyPoints(); broadcast({ type: "dataCleared" });
        } else throw new StorageError("Unknown message type", 400);
      } catch (error) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "error", message: error instanceof StorageError ? error.message : "Telemetry was not saved" }));
      }
    });
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "gadv", time: new Date().toISOString() }));
  app.post("/api/telemetry", route(async (req, res) => {
    await saveTelemetry(req.body?.type === "newAnomalyPoint" ? req.body.data : req.body);
    res.json({ ok: true, saved: true, broadcast: wss.clients.size });
  }));
  app.get("/api/runs", route(async (_req, res) => res.json(await runStorage.listRuns())));
  app.get("/api/experiments", route(async (_req, res) => res.json(await runStorage.listExperiments())));
  app.delete("/api/experiments/:experimentId", route(async (req, res) => {
    await runStorage.removeExperiment(id.parse(req.params.experimentId));
    res.json({ ok: true, saved_runs_retained: true });
  }));
  app.patch("/api/experiments/:experimentId/metadata", route(async (req, res) => {
    const metadata = z.object({ name: text, experimentType: text, location: text, operator: text, description: text, grid_spacing: text, sensor_configuration: text, notes: text }).parse(req.body);
    res.json(await runStorage.updateExperimentMetadata(id.parse(req.params.experimentId), metadata));
  }));
  app.patch("/api/runs/:experimentId/:runId/metadata", route(async (req, res) => {
    const metadata = z.object({ location: text, notes: text, start_time: z.string().datetime().optional(), end_time: z.string().datetime().optional(), duration: z.number().finite().nonnegative().optional(), processing_status: z.enum(["unprocessed", "processing", "processed", "failed"]).optional(), assigned_experiment_id: id.nullable().optional() }).parse(req.body);
    res.json(await runStorage.updateRunMetadata(req.params.experimentId, req.params.runId, metadata));
  }));
  app.get("/api/runs/:runId/original.csv", route(async (req, res) => {
    const original = await runStorage.originalUpload(req.params.runId);
    res.attachment(path.basename(original.filename)).type("text/csv").send(original.bytes);
  }));
  app.post("/api/process-run", limitJobs, route(async (req, res) => {
    const body = z.object({ experiment_id: id, run_id: id }).parse(req.body);
    res.json(await processStoredRun(body.experiment_id, body.run_id));
  }));
  app.get("/api/anomaly-points", route(async (_req, res) => res.json(await storage.getAllAnomalyPoints())));
  app.post("/api/anomaly-points", route(async (req, res) => res.status(201).json(await storage.createAnomalyPoint(insertAnomalyPointSchema.parse(req.body)))));
  app.delete("/api/anomaly-points", route(async (_req, res) => { await storage.clearAllAnomalyPoints(); res.json({ message: "Cleared transient live history; saved runs retained" }); }));

  app.post("/api/upload-csv", limitJobs, upload.single("file"), route(async (req, res) => {
    if (!req.file) throw new StorageError("One .csv file is required", 400);
    try {
      requireDatabase();
      const original = await fs.readFile(req.file.path);
      const content = new TextDecoder("utf-8", { fatal: true }).decode(original);
      const originalRows = parseCsvRows(content);
      const result = await processUploadedFile(req.file.path, req.file.originalname);
      id.parse(result.runId); id.parse(result.experimentId);
      const provenance = z.object({ reported_origin: z.string().max(1000), notes: text }).parse({ reported_origin: req.body.reported_origin || "User-supplied data; origin unspecified", notes: req.body.provenance_notes });
      const warnings = [...result.warnings];
      if (originalRows.some(row => Object.values(row).some(value => /\b(?:SIM|simulated|synthetic)\b/i.test(value)))) warnings.push("Source contains simulation-related identifiers or labels; original data and user-reported provenance have both been preserved.");
      const times = result.points.map(point => point.timestamp).sort((a, b) => Date.parse(a) - Date.parse(b));
      const run: StoredRun = {
        run_id: result.runId, experiment_id: result.experimentId, device_id: result.deviceId,
        start_time: times[0], end_time: times[times.length - 1], duration: (Date.parse(times[times.length - 1]) - Date.parse(times[0])) / 1000,
        mode: "uploaded", processing_source: result.source, processing_status: "processed",
        run_metadata: { location: result.location, notes: result.notes },
        provenance: { ...provenance, independently_verified: false },
        points: result.points as StoredRun["points"],
      };
      const saved = await runStorage.importRun(run, original, path.basename(req.file.originalname), sha256(canonicalJson(originalRows)));
      res.json({ ...result, ...saved, warnings });
    } finally { await fs.unlink(req.file.path).catch(() => {}); }
  }));
  app.use("/api", (error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) res.status(400).json({ message: "Invalid request", details: error.errors });
    else if (error instanceof StorageError) res.status(error.status).json({ message: error.message });
    else if (error instanceof NoPythonError) res.status(422).json({ error: "no_python", message: error.message });
    else if (error instanceof multer.MulterError) res.status(400).json({ message: "Upload rejected: file/field limits exceeded" });
    else {
      console.error("[api] request failed", error?.code || error?.name);
      res.status(error?.code?.startsWith?.("ECONN") || error?.code === "42P01" ? 503 : 400).json({ message: error?.code ? "Database operation failed. Check database configuration and migrations; nothing was confirmed saved." : "CSV or processing request failed; nothing was confirmed saved." });
    }
  });
  return httpServer;
}
