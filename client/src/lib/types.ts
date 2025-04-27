export interface AnomalyDataPoint {
  id?: number;
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

export interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
  details?: any;
}
