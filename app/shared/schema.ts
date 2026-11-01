import { pgTable, text, serial, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const persistedExperiments = pgTable("gm_experiments", {
  id: text("id").primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, any>>().notNull(),
});

export const persistedRuns = pgTable("gm_runs", {
  id: text("id").primaryKey(),
  experimentId: text("experiment_id").references(() => persistedExperiments.id),
  fingerprint: text("fingerprint"),
  document: jsonb("document").$type<Record<string, any>>().notNull(),
});

export const persistedUploads = pgTable("gm_uploads", {
  sha256: text("sha256").primaryKey(),
  runId: text("run_id").notNull().references(() => persistedRuns.id),
  filename: text("filename").notNull(),
  originalBase64: text("original_base64").notNull(),
});

// Keep the users table as it might be needed for authentication later
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Anomaly data points table
export const anomalyPoints = pgTable("anomaly_points", {
  id: serial("id").primaryKey(),
  latitude: numeric("latitude", { precision: 10, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 6 }).notNull(),
  anomalyValue: numeric("anomaly_value", { precision: 10, scale: 6 }).notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertAnomalyPointSchema = createInsertSchema(anomalyPoints).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertAnomalyPoint = z.infer<typeof insertAnomalyPointSchema>;
export type AnomalyPoint = typeof anomalyPoints.$inferSelect;

// WebSocket message types
export interface AnomalyDataPoint {
  latitude: number;
  longitude: number;
  anomalyValue: number;
  timestamp: Date;
}

export interface AnomalyStatistics {
  totalAnomalies: number;
  lowAnomalies: number;
  mediumAnomalies: number;
  highAnomalies: number;
  maxAnomaly: number;
  avgAnomaly: number;
}

export interface ConnectionSettings {
  connectionType: 'bluetooth' | 'wifi' | 'simulate';
  deviceId?: string;
  port?: number;
}

export interface AnomalyThresholds {
  medium: number;
  high: number;
}

export interface AppSettings {
  mapStyle: 'standard' | 'satellite' | 'terrain';
  defaultLat: number;
  defaultLng: number;
  thresholds: AnomalyThresholds;
  darkMode: boolean;
}

export interface AnomalyFilters {
  minAnomaly: number;
  timeRange: 'all' | 'hour' | 'today' | 'week';
}

// ─── Rich live-telemetry packet (used by the WS bridge for both simulation
//     and future ESP32 firmware). Timestamp is coerced from string|Date so
//     a JSON round-trip through the server doesn't break validation. All
//     IMU/baro/GPS fields are optional so older firmware revisions still
//     pass validation. ───────────────────────────────────────────────────
export const sensorDataPointSchema = z.object({
  device_id:      z.string().optional(),
  experiment_id:  z.string().optional(),
  run_id:         z.string().optional(),
  runMode:        z.enum(["live", "simulated"]).optional(),
  // Required — every packet must locate itself + report the headline value
  latitude:       z.number().finite().min(-90).max(90),
  longitude:      z.number().finite().min(-180).max(180),
  anomalyValue:   z.number().finite(),
  timestamp:      z.union([z.string(), z.date()]).transform(v => v instanceof Date ? v : new Date(v)).refine(v => Number.isFinite(v.getTime()), "Invalid timestamp"),
  // IMU
  ax:             z.number().optional(),
  ay:             z.number().optional(),
  az:             z.number().optional(),
  gx:             z.number().optional(),
  gy:             z.number().optional(),
  gz:             z.number().optional(),
  // Baro / env
  pressure:       z.number().optional(),
  temperature:    z.number().optional(),
  altitude:       z.number().optional(),
  // GPS quality
  speed:          z.number().optional(),
  hdop:           z.number().optional(),
  satellites:     z.number().optional(),
  fixQuality:     z.number().optional(),
  // Derived
  anomalySmoothed:    z.number().optional(),
  platformStationary: z.boolean().optional(),
}).passthrough();

export type SensorDataPointDTO = z.infer<typeof sensorDataPointSchema>;
