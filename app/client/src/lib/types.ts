// ─── Core sensor data point (backward-compatible superset of old AnomalyDataPoint) ───
export interface SensorDataPoint {
  id?: number;
  latitude: number;
  longitude: number;
  anomalyValue: number;
  timestamp: Date;
  // Optional extended sensor fields
  ax?: number;
  ay?: number;
  az?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  pressure?: number;
  temperature?: number;
  altitude?: number;
  speed?: number;
  hdop?: number;
  satellites?: number;
  fixQuality?: number;
  anomalySmoothed?: number;
  platformStationary?: boolean;
  outlierFlag?: boolean;
}

// Keep old name as alias so existing code compiles unchanged
export type AnomalyDataPoint = SensorDataPoint;

// ─── Experiment run ────────────────────────────────────────────────────────────
export type ExperimentType = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'CAL';
export type RunMode = 'live' | 'simulated' | 'uploaded';

export interface ExperimentRun {
  id: string;           // internal UUID
  runId: string;        // human-readable, e.g. "2025-04-01_E1_lab-bench_run01"
  experimentId: ExperimentType;
  mode: RunMode;
  startTime: Date;
  endTime?: Date;
  location: string;
  notes: string;
  points: SensorDataPoint[];
  visible: boolean;
  color: string;        // hex color for map / chart
}

// ─── Legacy types (unchanged) ──────────────────────────────────────────────────
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
  port?: string;
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

export type ConnectionStatus = 'disconnected' | 'connected' | 'simulation';
export type MapColorMode = 'anomaly' | 'run';

export interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
  details?: any;
}
