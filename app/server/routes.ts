import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { storage } from "./storage";
import { insertAnomalyPointSchema } from "@shared/schema";
import { processUploadedFile, NoPythonError } from "./csvProcessor";
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
              const validated = insertAnomalyPointSchema.parse(data.data);
              const newPoint  = await storage.createAnomalyPoint(validated);
              broadcastToAll({ type: "newAnomalyPoint", data: newPoint });
            } catch (err) {
              if (err instanceof z.ZodError) {
                ws.send(JSON.stringify({ type: "error", message: "Invalid data", details: err.errors }));
              } else {
                ws.send(JSON.stringify({ type: "error", message: "Failed to store point" }));
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

    function broadcastToAll(data: unknown) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  // ── REST: anomaly points (legacy) ─────────────────────────────────────────
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
