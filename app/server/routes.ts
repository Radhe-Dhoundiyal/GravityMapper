import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertAnomalyPointSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);

  // Create WebSocket server for real-time data
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket connection handler
  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    // Send existing data points to the client
    storage.getAllAnomalyPoints().then((points) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "initialData",
          data: points
        }));
      }
    });

    // Handle messages from clients
    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle different message types
        switch (data.type) {
          case "newAnomalyPoint":
            try {
              // Validate the data
              const validatedData = insertAnomalyPointSchema.parse(data.data);
              
              // Store the point
              const newPoint = await storage.createAnomalyPoint(validatedData);
              
              // Broadcast to all clients
              broadcastToAll({
                type: "newAnomalyPoint",
                data: newPoint
              });
            } catch (error) {
              if (error instanceof z.ZodError) {
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Invalid anomaly point data",
                  details: error.errors
                }));
              } else {
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Failed to store anomaly point"
                }));
              }
            }
            break;
            
          case "clearData":
            await storage.clearAllAnomalyPoints();
            broadcastToAll({
              type: "dataCleared"
            });
            break;
            
          default:
            ws.send(JSON.stringify({
              type: "error",
              message: "Unknown message type"
            }));
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Invalid message format"
        }));
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
    
    // Broadcast to all connected clients
    function broadcastToAll(data: any) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  // REST API endpoints
  app.get("/api/anomaly-points", async (req, res) => {
    try {
      const points = await storage.getAllAnomalyPoints();
      res.json(points);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch anomaly points" });
    }
  });

  app.post("/api/anomaly-points", async (req, res) => {
    try {
      const validatedData = insertAnomalyPointSchema.parse(req.body);
      const newPoint = await storage.createAnomalyPoint(validatedData);
      res.status(201).json(newPoint);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid anomaly point data", details: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create anomaly point" });
      }
    }
  });

  app.delete("/api/anomaly-points", async (req, res) => {
    try {
      await storage.clearAllAnomalyPoints();
      res.status(200).json({ message: "All anomaly points cleared" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear anomaly points" });
    }
  });

  return httpServer;
}
