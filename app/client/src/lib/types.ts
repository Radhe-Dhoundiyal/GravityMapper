// ─── Core sensor data point (backward-compatible superset of old AnomalyDataPoint) ───
export interface SensorDataPoint {
  id?: number;
  device_id?: string;
  experiment_id?: string;
  run_id?: string;
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
export type ProcessingStatus = 'unprocessed' | 'processing' | 'processed' | 'failed';

export interface ExperimentRun {
  id: string;           // internal UUID
  runId: string;        // human-readable, e.g. "2025-04-01_E1_lab-bench_run01"
  experimentId: ExperimentType | string;
  mode: RunMode;
  startTime: Date;
  endTime?: Date;
  start_time?: Date;
  end_time?: Date;
  duration?: number;
  processing_status?: ProcessingStatus;
  location: string;
  notes: string;
  points: SensorDataPoint[];
  visible: boolean;
  color: string;        // hex color for map / chart
  processingSource?: 'raw' | 'processed';  // how an uploaded run was loaded
  parentExperimentId?: string;             // FK → Experiment.id (optional)
}

// ─── Experiment (groups multiple runs) ─────────────────────────────────────────
export interface Experiment {
  id: string;                              // internal UUID
  experimentId: string;                    // human-readable code (e.g. "EXP-2025-001")
  name: string;                            // display name
  experimentType: ExperimentType | string; // E1–E6, CAL, or custom string
  description: string;
  location: string;
  operator: string;
  grid_spacing: string;
  sensor_configuration: string;
  notes: string;
  createdAt: Date;
  // NB: runs are NOT stored here. Membership is derived from
  // ExperimentRun.parentExperimentId — keeps a single source of truth.
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
export type WebSocketStatus = 'connected' | 'disconnected' | 'reconnecting';
export type MapColorMode = 'anomaly' | 'run';
export type MapViewMode = 'points' | 'heatmap' | 'gradient' | 'anomalies';

export interface AnomalyRegion {
  id: string;
  type: 'positive' | 'negative';
  centerLat: number;
  centerLng: number;
  peakAnomalyValue: number;
  areaSqMeters: number;
  pointDensity: number;
  confidence: number;
  cellCount: number;
}

export interface SurveyGridPoint {
  id: string;
  row: number;
  column: number;
  lat: number;
  lng: number;
}

export interface SurveyGrid {
  grid_id: string;
  origin: { lat: number; lng: number };
  rows: number;
  columns: number;
  spacing_meters: number;
  tolerance_meters: number;
  points: SurveyGridPoint[];
}

export interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
  details?: any;
}
