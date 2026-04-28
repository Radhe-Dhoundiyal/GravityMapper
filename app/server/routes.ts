import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { storage } from "./storage";
import { runStorage } from "./runStorage";
import { insertAnomalyPointSchema, sensorDataPointSchema } from "@shared/schema";
import { processUploadedFile, NoPythonError } from "./csvProcessor";
import { processStoredRun } from "./runProcessor";
import { z } from "zod";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer: disk storage in uploads/, 50 MB limit, CSV only
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cb(null, `${uid}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only .csv files are accepted"));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // ── Shared broadcaster ────────────────────────────────────────────────────
  // Lifted out of the connection handler so the HTTP telemetry fallback
  // (POST /api/telemetry, used by Wokwi/ESP32 when WebSocket isn't an option)
  // can push to every connected dashboard client through the same fan-out.
  function broadcastToAll(data: unknown) {
    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    storage.getAllAnomalyPoints().then((points) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "initialData", data: points }));
      }
    });

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case "newAnomalyPoint": {
            try {
              // ── Validate against the RICH packet schema (sim + ESP32 use this same shape).
              //    Timestamp is coerced to Date inside the schema so JSON-string wire
              //    payloads round-trip cleanly.
              const rich = sensorDataPointSchema.parse(data.data);

              // ── Best-effort legacy persistence: project to the 4-field anomaly_points
              //    table so /api/anomaly-points + initialData replay keep working.
              //    Failure here must NOT block live broadcast (a transient DB error
              //    must never starve the live UI).
              storage.createAnomalyPoint({
                latitude:     String(rich.latitude),
                longitude:    String(rich.longitude),
                anomalyValue: String(rich.anomalyValue),
                timestamp:    rich.timestamp,
              }).catch((e) => console.warn("[ws] legacy persist failed:", e?.message ?? e));
              await runStorage.appendTelemetryPoint(rich)
                .catch((e) => console.warn("[ws] run persist failed:", e?.message ?? e));

              // ── Broadcast the FULL rich point to every client unchanged.
              //    This is the same path future ESP32 packets will follow.
              broadcastToAll({ type: "newAnomalyPoint", data: rich });
            } catch (err) {
              if (err instanceof z.ZodError) {
                console.warn("[ws] rejected packet:", err.errors);
                ws.send(JSON.stringify({ type: "error", message: "Invalid data", details: err.errors }));
              } else {
                ws.send(JSON.stringify({ type: "error", message: "Failed to broadcast point" }));
              }
            }
            break;
          }

          case "clearData": {
            await storage.clearAllAnomalyPoints();
            broadcastToAll({ type: "dataCleared" });
            break;
          }

          default:
            ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    ws.on("close", () => console.log("WebSocket client disconnected"));
  });

  // ── REST: health probe ────────────────────────────────────────────────────
  // Cheap liveness check — used by Render, uptime monitors, and the Wokwi
  // sketch to confirm the service is reachable before opening a WebSocket
  // or POSTing telemetry. Always JSON, never blocked by storage state.
  app.get("/api/health", (_req, res) => {
    res.json({
      ok:      true,
      service: "gadv",
      time:    new Date().toISOString(),
    });
  });

  // ── REST: telemetry HTTP fallback ─────────────────────────────────────────
  // Same payload shape as the WebSocket "newAnomalyPoint" message:
  //   { "type": "newAnomalyPoint", "data": { ...sensor fields... } }
  // Validated with the same `sensorDataPointSchema`, persisted with the same
  // legacy 4-field projection, and broadcast through the same `broadcastToAll`
  // fan-out — so HTTP-posted points are indistinguishable from WS-posted ones
  // on the dashboard side.
  // Intended only as a fallback for environments (e.g. Wokwi) where the
  // ESP32 sketch can't easily hold an outgoing WebSocket open.
  app.post("/api/telemetry", async (req, res) => {
    try {
      const body = req.body ?? {};
      // Accept both wrapped { type, data } and bare sensor payloads for convenience.
      const raw = body.type === "newAnomalyPoint" ? body.data : body;
      const rich = sensorDataPointSchema.parse(raw);

      storage.createAnomalyPoint({
        latitude:     String(rich.latitude),
        longitude:    String(rich.longitude),
        anomalyValue: String(rich.anomalyValue),
        timestamp:    rich.timestamp,
      }).catch((e) => console.warn("[http] legacy persist failed:", e?.message ?? e));
      await runStorage.appendTelemetryPoint(rich)
        .catch((e) => console.warn("[http] run persist failed:", e?.message ?? e));

      broadcastToAll({ type: "newAnomalyPoint", data: rich });

      res.json({ ok: true, broadcast: wss.clients.size });
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.warn("[http] rejected telemetry packet:", err.errors);
        res.status(400).json({ ok: false, message: "Invalid data", details: err.errors });
      } else {
        console.error("[http] telemetry error:", err);
        res.status(500).json({ ok: false, message: "Failed to broadcast point" });
      }
    }
  });

  // ── REST: anomaly points (legacy) ─────────────────────────────────────────
  app.get("/api/runs", (_req, res) => {
    res.json(runStorage.listRuns());
  });

  app.patch("/api/runs/:experimentId/:runId/metadata", async (req, res) => {
    try {
      const schema = z.object({
        location: z.string().optional(),
        notes: z.string().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
        duration: z.number().optional(),
        processing_status: z.enum(["unprocessed", "processing", "processed", "failed"]).optional(),
      });
      const run = await runStorage.updateRunMetadata(
        req.params.experimentId,
        req.params.runId,
        schema.parse(req.body ?? {}),
      );
      res.json(run);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid request", details: err.errors });
      } else {
        res.status(404).json({ message: err?.message ?? "Stored run not found" });
      }
    }
  });

  app.patch("/api/experiments/:experimentId/metadata", async (req, res) => {
    try {
      const schema = z.object({
        location: z.string().optional(),
        operator: z.string().optional(),
        description: z.string().optional(),
        grid_spacing: z.string().optional(),
        sensor_configuration: z.string().optional(),
        notes: z.string().optional(),
      });
      const runs = await runStorage.updateExperimentMetadata(
        req.params.experimentId,
        schema.parse(req.body ?? {}),
      );
      res.json({ updated_runs: runs.length, runs });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid request", details: err.errors });
      } else {
        res.status(500).json({ message: err?.message ?? "Failed to update experiment metadata" });
      }
    }
  });

  app.post("/api/process-run", async (req, res) => {
    try {
      const schema = z.object({
        experiment_id: z.string().min(1),
        run_id: z.string().min(1),
      });
      const { experiment_id, run_id } = schema.parse(req.body ?? {});
      const result = await processStoredRun(experiment_id, run_id);
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid request", details: err.errors });
      } else {
        console.error("[process-run] error:", err);
        res.status(500).json({ message: err?.message ?? "Failed to process run" });
      }
    }
  });

  app.get("/api/anomaly-points", async (_req, res) => {
    try {
      res.json(await storage.getAllAnomalyPoints());
    } catch {
      res.status(500).json({ message: "Failed to fetch anomaly points" });
    }
  });

  app.post("/api/anomaly-points", async (req, res) => {
    try {
      const validated = insertAnomalyPointSchema.parse(req.body);
      res.status(201).json(await storage.createAnomalyPoint(validated));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", details: err.errors });
      } else {
        res.status(500).json({ message: "Failed to create anomaly point" });
      }
    }
  });

  app.delete("/api/anomaly-points", async (_req, res) => {
    try {
      await storage.clearAllAnomalyPoints();
      res.status(200).json({ message: "Cleared" });
    } catch {
      res.status(500).json({ message: "Failed to clear anomaly points" });
    }
  });

  // ── REST: CSV upload + processing ─────────────────────────────────────────
  app.post(
    "/api/upload-csv",
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const filePath     = req.file.path;
      const originalName = req.file.originalname;

      try {
        const result = await processUploadedFile(filePath, originalName);
        res.json(result);
      } catch (err: any) {
        if (err instanceof NoPythonError || err?.name === "NoPythonError") {
          res.status(422).json({
            error:    "no_python",
            message:  err.message,
          });
        } else {
          console.error("CSV upload error:", err);
          res.status(500).json({
            error:   "processing_failed",
            message: err?.message ?? "Unknown error during CSV processing",
          });
        }
      } finally {
        // Clean up the temp upload regardless of outcome
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
  );

  return httpServer;
}
