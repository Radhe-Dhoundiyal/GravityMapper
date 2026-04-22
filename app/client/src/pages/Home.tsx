import React, { useState, useEffect, useCallback, useRef } from "react";
import AppHeader from "@/components/AppHeader";
import SidePanel from "@/components/SidePanel";
import MapView from "@/components/MapView";
import MapToolbar from "@/components/MapToolbar";
import DataStreamPanel from "@/components/DataStreamPanel";
import SettingsModal from "@/components/SettingsModal";
import AnomalyPlot from "@/components/AnomalyPlot";
import RunCompare from "@/components/RunCompare";
import { useWebSocket } from "@/lib/useWebSocket";
import { ToastContainer, Toast } from "@/components/ui/toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BarChart2, GitCompare, Radio, Map, Layers } from "lucide-react";
import {
  SensorDataPoint,
  AnomalyDataPoint,
  AnomalyStatistics,
  ConnectionSettings,
  AppSettings,
  AnomalyFilters,
  ConnectionStatus,
  WebSocketMessage,
  ExperimentRun,
  Experiment,
  MapColorMode,
} from "@/lib/types";
import { MOCK_RUNS } from "@/lib/mockData";
import { nextRunColor } from "@/lib/runColors";
import { type UploadState } from "@/components/RunsPanel";

let simulationInterval: NodeJS.Timeout | null = null;

// ── helpers ──────────────────────────────────────────────────────────────────
function calcStats(
  points: SensorDataPoint[],
  thresholds: { medium: number; high: number }
): AnomalyStatistics {
  if (points.length === 0)
    return { totalAnomalies: 0, lowAnomalies: 0, mediumAnomalies: 0, highAnomalies: 0, maxAnomaly: 0, avgAnomaly: 0 };

  let low = 0, med = 0, high = 0, max = 0, sum = 0;
  points.forEach(p => {
    const v = p.anomalyValue;
    if (v < thresholds.medium) low++;
    else if (v < thresholds.high) med++;
    else high++;
    if (v > max) max = v;
    sum += v;
  });
  return { totalAnomalies: points.length, lowAnomalies: low, mediumAnomalies: med, highAnomalies: high, maxAnomaly: max, avgAnomaly: sum / points.length };
}

// ── component ─────────────────────────────────────────────────────────────────
const Home: React.FC = () => {
  // ── Runs state ─────────────────────────────────────────────────────────────
  const [runs, setRuns]                 = useState<ExperimentRun[]>([]);
  const [activeRunId, setActiveRunId]   = useState<string | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [experiments, setExperiments]   = useState<Experiment[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [colorMode, setColorMode]       = useState<MapColorMode>('anomaly');
  const [uploadState, setUploadState]   = useState<UploadState>('idle');
  const [uploadError, setUploadError]   = useState<string | undefined>(undefined);

  // ── Legacy live-stream state (still used for DataStreamPanel & stats) ───────
  const [dataLogs, setDataLogs]         = useState<SensorDataPoint[]>([]);
  const [statistics, setStatistics]     = useState<AnomalyStatistics>({
    totalAnomalies: 0, lowAnomalies: 0, mediumAnomalies: 0, highAnomalies: 0, maxAnomaly: 0, avgAnomaly: 0,
  });
  const [lastDataPoint, setLastDataPoint] = useState<SensorDataPoint | null>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isSidebarVisible, setIsSidebarVisible]     = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [currentCoords, setCurrentCoords]           = useState<{ lat: number; lng: number } | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success'|'error'|'warning'|'info' }[]>([]);
  const [bottomTab, setBottomTab]     = useState<'feed' | 'plot' | 'compare'>('feed');
  const [bottomExpanded, setBottomExpanded] = useState(false);

  // ── Settings / filters ─────────────────────────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>({
    mapStyle: 'standard',
    defaultLat: 51.5008,
    defaultLng: -0.1246,
    thresholds: { medium: 0.5, high: 1.0 },
    darkMode: false,
  });
  const [filters, setFilters] = useState<AnomalyFilters>({ minAnomaly: 0, timeRange: 'all' });

  // ── Connection ─────────────────────────────────────────────────────────────
  const [connectionSettings, setConnectionSettings] = useState<ConnectionSettings>({
    connectionType: 'simulate', deviceId: '', port: '',
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isStreaming, setIsStreaming]             = useState(false);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const { isConnected: wsConnected, connect: wsConnect, disconnect: wsDisconnect, sendMessage: wsSendMessage }
    = useWebSocket({ onMessage: handleWebSocketMessage, manual: true });

  // ── Run helpers ────────────────────────────────────────────────────────────
  const createLiveRun = useCallback((): ExperimentRun => {
    const id = `live-${Date.now()}`;
    const run: ExperimentRun = {
      id,
      runId: `live_${new Date().toISOString().slice(0, 10)}_run`,
      experimentId: 'CAL',
      mode: connectionSettings.connectionType === 'simulate' ? 'simulated' : 'live',
      startTime: new Date(),
      location: connectionSettings.deviceId || 'unknown',
      notes: 'Live streamed data',
      points: [],
      visible: true,
      color: nextRunColor(),
    };
    return run;
  }, [connectionSettings]);

  // WebSocket message handler
  function handleWebSocketMessage(data: WebSocketMessage) {
    if (data.type === 'newAnomalyPoint') {
      const raw = data.data as any;
      const newPoint: SensorDataPoint = {
        ...raw,
        timestamp: typeof raw.timestamp === 'string' ? new Date(raw.timestamp) : raw.timestamp,
      };
      addLivePoint(newPoint);
    } else if (data.type === 'initialData') {
      const points = (data.data as any[]).map(p => ({
        ...p, timestamp: new Date(p.timestamp),
      })) as SensorDataPoint[];

      if (points.length > 0) {
        setDataLogs(points.slice(-100));
        setLastDataPoint(points[points.length - 1]);
        setStatistics(calcStats(points, settings.thresholds));
        showToast(`Loaded ${points.length} historical points`, 'info');
      }
    } else if (data.type === 'dataCleared') {
      setDataLogs([]);
      setLastDataPoint(null);
      setStatistics(calcStats([], settings.thresholds));
      showToast('Live data cleared', 'info');
    } else if (data.type === 'error') {
      showToast(data.message || 'An error occurred', 'error');
    }
  }

  const addLivePoint = useCallback((point: SensorDataPoint) => {
    setDataLogs(prev => [...prev, point].slice(-100));
    setLastDataPoint(point);

    setRuns(prev => {
      const idx = prev.findIndex(r => r.id === activeRunId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], points: [...updated[idx].points, point] };
      return updated;
    });

    setStatistics(prev => {
      const total  = prev.totalAnomalies + 1;
      const sum    = prev.avgAnomaly * prev.totalAnomalies + point.anomalyValue;
      const newMax = Math.max(prev.maxAnomaly, point.anomalyValue);
      const v = point.anomalyValue;
      return {
        totalAnomalies: total,
        lowAnomalies:    prev.lowAnomalies    + (v < settings.thresholds.medium ? 1 : 0),
        mediumAnomalies: prev.mediumAnomalies + (v >= settings.thresholds.medium && v < settings.thresholds.high ? 1 : 0),
        highAnomalies:   prev.highAnomalies   + (v >= settings.thresholds.high ? 1 : 0),
        maxAnomaly: newMax,
        avgAnomaly: sum / total,
      };
    });
  }, [activeRunId, settings.thresholds]);

  // Toast helpers
  const showToast = useCallback((message: string, type: 'success'|'error'|'warning'|'info' = 'info') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Connection handling ────────────────────────────────────────────────────
  const handleToggleConnection = useCallback(() => {
    if (connectionStatus === 'disconnected') {
      if (connectionSettings.connectionType !== 'simulate') {
        if (!connectionSettings.deviceId || !connectionSettings.port) {
          showToast('Enter device ID/IP and port', 'error');
          return;
        }
      }
      wsConnect();
      setConnectionStatus(connectionSettings.connectionType === 'simulate' ? 'simulation' : 'connected');
      showToast('Connected', 'success');
    } else {
      if (isStreaming) handleToggleStream();
      wsDisconnect();
      setConnectionStatus('disconnected');
      showToast('Disconnected', 'info');
    }
  }, [connectionStatus, connectionSettings, isStreaming, wsConnect, wsDisconnect, showToast]);

  // ── Stream handling ────────────────────────────────────────────────────────
  const handleToggleStream = useCallback(() => {
    if (connectionStatus === 'disconnected') {
      showToast('Connect first', 'error');
      return;
    }
    if (isStreaming) {
      setIsStreaming(false);
      if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
      // Close the active run
      setRuns(prev => {
        const idx = prev.findIndex(r => r.id === activeRunId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], endTime: new Date() };
        return updated;
      });
      setActiveRunId(null);
      showToast('Stream stopped', 'info');
    } else {
      // Create a new live run
      const run = createLiveRun();
      setRuns(prev => [run, ...prev]);
      setActiveRunId(run.id);
      setIsStreaming(true);

      if (connectionSettings.connectionType === 'simulate') {
        simulationInterval = setInterval(generateSimulatedData, 2000);
      }
      showToast('Stream started', 'success');
      setBottomTab('feed');
      setBottomExpanded(true);
    }
  }, [connectionStatus, isStreaming, createLiveRun, connectionSettings.connectionType, activeRunId, showToast]);

  // Simulate sensor data
  const generateSimulatedData = useCallback(() => {
    const lastPoint = dataLogs.length > 0 ? dataLogs[dataLogs.length - 1] : null;
    const baseLat = lastPoint ? lastPoint.latitude : settings.defaultLat;
    const baseLng = lastPoint ? lastPoint.longitude : settings.defaultLng;

    const latitude    = baseLat + (Math.random() - 0.5) * 0.01;
    const longitude   = baseLng + (Math.random() - 0.5) * 0.01;
    const anomalyValue = Math.pow(Math.random(), 2) * 2;

    const dataPoint: SensorDataPoint = {
      latitude, longitude, anomalyValue, timestamp: new Date(),
      ax: +(Math.random() * 0.02 - 0.01).toFixed(5),
      ay: +(Math.random() * 0.02 - 0.01).toFixed(5),
      az: +(0.99 + Math.random() * 0.02).toFixed(5),
      gx: +(Math.random() * 0.1 - 0.05).toFixed(4),
      gy: +(Math.random() * 0.1 - 0.05).toFixed(4),
      gz: +(Math.random() * 0.05).toFixed(4),
      pressure: +(1013 + Math.random() * 0.5).toFixed(2),
      temperature: +(20 + Math.random() * 2).toFixed(2),
      altitude: +(42 + Math.random() * 1).toFixed(1),
      hdop: 1.2,
      satellites: 8,
      fixQuality: 1,
      platformStationary: false,
    };

    wsSendMessage({ type: 'newAnomalyPoint', data: dataPoint });
  }, [dataLogs, settings.defaultLat, settings.defaultLng, wsSendMessage]);

  // ── Run management ─────────────────────────────────────────────────────────
  const handleToggleRunVisibility = useCallback((id: string) => {
    setRuns(prev => prev.map(r => r.id === id ? { ...r, visible: !r.visible } : r));
  }, []);

  const handleToggleRunSelect = useCallback((id: string) => {
    setSelectedRunIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const handleDeleteRun = useCallback((id: string) => {
    setRuns(prev => prev.filter(r => r.id !== id));
    setSelectedRunIds(prev => prev.filter(x => x !== id));
    if (activeRunId === id) setActiveRunId(null);
  }, [activeRunId]);

  // ── Experiment handlers ──────────────────────────────────────────────────
  // Architecture: ExperimentRun.parentExperimentId is the canonical FK.
  // Experiment objects don't store a runIds array — membership is derived.
  // This avoids any sync issues between the two sides.

  const handleCreateExperiment = useCallback((data: { name: string; experimentType: string; description: string }) => {
    const id = (crypto as any).randomUUID ? crypto.randomUUID() : `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const year = new Date().getFullYear();
    setExperiments(prev => {
      const code = `EXP-${year}-${String(prev.length + 1).padStart(3, '0')}`;
      const exp: Experiment = {
        id,
        experimentId: code,
        name: data.name,
        experimentType: data.experimentType,
        description: data.description,
        createdAt: new Date(),
      };
      showToast(`Created experiment "${exp.name}"`, 'success');
      return [exp, ...prev];
    });
    return id;
  }, [showToast]);

  const handleDeleteExperiment = useCallback((id: string) => {
    // Detach runs from this experiment but keep them — runs are owned independently.
    setRuns(prev => prev.map(r => r.parentExperimentId === id ? { ...r, parentExperimentId: undefined } : r));
    setExperiments(prev => prev.filter(e => e.id !== id));
    if (selectedExperimentId === id) setSelectedExperimentId(null);
  }, [selectedExperimentId]);

  const handleAssignRunToExperiment = useCallback((runId: string, experimentId: string | null) => {
    // Pure update — no mutation of the run object's fields beyond the FK.
    setRuns(prev => prev.map(r => r.id === runId
      ? { ...r, parentExperimentId: experimentId ?? undefined }
      : r));
  }, []);

  const handleCreateExperimentForRun = useCallback((runId: string) => {
    const name = window.prompt('New experiment name:', '')?.trim();
    if (!name) return;
    const id = (crypto as any).randomUUID ? crypto.randomUUID() : `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const year = new Date().getFullYear();
    setExperiments(prev => {
      const code = `EXP-${year}-${String(prev.length + 1).padStart(3, '0')}`;
      const exp: Experiment = {
        id, experimentId: code, name,
        experimentType: 'Custom', description: '',
        createdAt: new Date(),
      };
      return [exp, ...prev];
    });
    setRuns(prev => prev.map(r => r.id === runId ? { ...r, parentExperimentId: id } : r));
    showToast(`Created "${name}" and assigned run`, 'success');
  }, [showToast]);

  const handleLoadMockData = useCallback(() => {
    setRuns(prev => {
      const existingIds = new Set(prev.map(r => r.id));
      const toAdd = MOCK_RUNS.filter(r => !existingIds.has(r.id));
      if (toAdd.length === 0) { showToast('Sample data already loaded', 'info'); return prev; }
      showToast(`Loaded ${toAdd.length} sample runs`, 'success');
      return [...prev, ...toAdd];
    });
  }, [showToast]);

  const handleUploadCSV = useCallback(async (file: File) => {
    setUploadState('uploading');
    setUploadError(undefined);

    // After 2 s with no response, assume pipeline is running
    const processingTimer = setTimeout(() => setUploadState('processing'), 2000);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-csv', { method: 'POST', body: formData });
      clearTimeout(processingTimer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === 'no_python') {
          const msg = 'Server cannot process raw CSV: Python not available. Export a pre-processed CSV (containing anomaly_final_mgal) from your local machine first.';
          setUploadState('error');
          setUploadError(msg);
          showToast('Raw CSV requires Python on the server', 'error');
        } else {
          const msg = body?.message ?? `Upload failed (${res.status})`;
          setUploadState('error');
          setUploadError(msg);
          showToast(`Upload error: ${msg}`, 'error');
        }
        return;
      }

      const data = await res.json();
      const {
        source, runId, experimentId, location, notes, warnings = [], points = [],
      } = data;

      if (points.length === 0) {
        setUploadState('error');
        setUploadError('No valid data rows found in the uploaded file.');
        showToast('No data rows found', 'error');
        return;
      }

      // Convert timestamp strings → Date objects
      const parsedPoints: SensorDataPoint[] = points.map((p: any) => ({
        ...p,
        timestamp: new Date(p.timestamp),
        runId,
        experimentId,
      }));

      const firstTs = parsedPoints[0].timestamp;
      const lastTs  = parsedPoints[parsedPoints.length - 1].timestamp;

      const newRun: ExperimentRun = {
        id:           `upload-${Date.now()}`,
        runId,
        experimentId,
        mode:         'uploaded',
        color:        nextRunColor(),
        startTime:    firstTs instanceof Date ? firstTs : new Date(firstTs),
        endTime:      lastTs  instanceof Date ? lastTs  : new Date(lastTs),
        points:       parsedPoints,
        visible:      true,
        location,
        notes,
        processingSource: source,
      };

      setRuns(prev => [newRun, ...prev]);
      setUploadState('done');
      showToast(`Loaded "${runId}" — ${parsedPoints.length} pts (${source === 'raw' ? 'pipeline' : 'direct'})`, 'success');
      if (warnings.length > 0) showToast(warnings[0], 'warning');

      // Reset to idle after 4 s
      setTimeout(() => setUploadState('idle'), 4000);
    } catch (err: any) {
      clearTimeout(processingTimer);
      setUploadState('error');
      setUploadError(err.message ?? 'Network error during upload');
      showToast(`Upload error: ${err.message}`, 'error');
    }
  }, [showToast]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    const allPoints = runs.filter(r => r.visible).flatMap(r =>
      r.points.map(p => ({ ...p, runId: r.runId, experimentId: r.experimentId }))
    );
    if (allPoints.length === 0) { showToast('No visible data to export', 'error'); return; }
    let csv = 'Timestamp,RunId,ExperimentId,Latitude,Longitude,AnomalyValue\n';
    allPoints.forEach(p => {
      csv += `${new Date(p.timestamp).toISOString()},${p.runId},${p.experimentId},${p.latitude},${p.longitude},${p.anomalyValue}\n`;
    });
    download(csv, 'text/csv', `gadv-export-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast('Exported CSV', 'success');
  }, [runs, showToast]);

  const handleExportJSON = useCallback(() => {
    const visibleRuns = runs.filter(r => r.visible);
    if (visibleRuns.length === 0) { showToast('No visible data to export', 'error'); return; }
    const jsonData = JSON.stringify({ exportDate: new Date().toISOString(), runs: visibleRuns }, null, 2);
    download(jsonData, 'application/json', `gadv-export-${new Date().toISOString().slice(0, 10)}.json`);
    showToast('Exported JSON', 'success');
  }, [runs, showToast]);

  function download(content: string, mime: string, filename: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const handleClearData = useCallback(() => {
    if (!window.confirm('Clear all live stream data? Uploaded/sample runs are not affected.')) return;
    setDataLogs([]);
    setLastDataPoint(null);
    setStatistics(calcStats([], settings.thresholds));
    setRuns(prev => prev.filter(r => r.mode !== 'live' && r.mode !== 'simulated'));
    wsSendMessage({ type: 'clearData' });
  }, [settings.thresholds, wsSendMessage]);

  // ── Map events ────────────────────────────────────────────────────────────
  const handleZoomIn   = useCallback(() => window.dispatchEvent(new CustomEvent('map:zoomIn')), []);
  const handleZoomOut  = useCallback(() => window.dispatchEvent(new CustomEvent('map:zoomOut')), []);
  const handleCenterMap = useCallback(() => {
    const detail = lastDataPoint
      ? { lat: lastDataPoint.latitude, lng: lastDataPoint.longitude }
      : { lat: settings.defaultLat, lng: settings.defaultLng };
    window.dispatchEvent(new CustomEvent('map:center', { detail }));
  }, [lastDataPoint, settings.defaultLat, settings.defaultLng]);

  // Cleanup
  useEffect(() => () => {
    if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
  }, []);

  // Legacy dataPoints for MapToolbar
  const livePoints = activeRunId ? (runs.find(r => r.id === activeRunId)?.points ?? []) : [];

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      <AppHeader
        connectionStatus={connectionStatus}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {isSidebarVisible && (
          <div className="md:hidden absolute inset-0 z-10 bg-black/50" onClick={() => setIsSidebarVisible(false)}>
            <div className="h-full w-80" onClick={e => e.stopPropagation()}>
              <SidePanel
                connectionSettings={connectionSettings}
                onConnectionSettingsChange={s => setConnectionSettings(prev => ({ ...prev, ...s }))}
                connectionStatus={connectionStatus}
                onToggleConnection={handleToggleConnection}
                anomalyStats={statistics}
                filters={filters}
                onFiltersChange={f => setFilters(prev => ({ ...prev, ...f }))}
                thresholds={settings.thresholds}
                onExportCSV={handleExportCSV}
                onExportJSON={handleExportJSON}
                onClearData={handleClearData}
                runs={runs}
                selectedRunIds={selectedRunIds}
                onToggleRunVisibility={handleToggleRunVisibility}
                onToggleRunSelect={handleToggleRunSelect}
                onLoadMockData={handleLoadMockData}
                onUploadCSV={handleUploadCSV}
                onDeleteRun={handleDeleteRun}
                uploadState={uploadState}
                uploadError={uploadError}
                experiments={experiments}
                selectedExperimentId={selectedExperimentId}
                onSelectExperiment={setSelectedExperimentId}
                onCreateExperiment={handleCreateExperiment}
                onDeleteExperiment={handleDeleteExperiment}
                onAssignRunToExperiment={handleAssignRunToExperiment}
                onCreateExperimentForRun={handleCreateExperimentForRun}
              />
            </div>
          </div>
        )}

        {/* Desktop sidebar */}
        <SidePanel
          connectionSettings={connectionSettings}
          onConnectionSettingsChange={s => setConnectionSettings(prev => ({ ...prev, ...s }))}
          connectionStatus={connectionStatus}
          onToggleConnection={handleToggleConnection}
          anomalyStats={statistics}
          filters={filters}
          onFiltersChange={f => setFilters(prev => ({ ...prev, ...f }))}
          thresholds={settings.thresholds}
          onExportCSV={handleExportCSV}
          onExportJSON={handleExportJSON}
          onClearData={handleClearData}
          runs={runs}
          selectedRunIds={selectedRunIds}
          onToggleRunVisibility={handleToggleRunVisibility}
          onToggleRunSelect={handleToggleRunSelect}
          onLoadMockData={handleLoadMockData}
          onUploadCSV={handleUploadCSV}
          onDeleteRun={handleDeleteRun}
          uploadState={uploadState}
          uploadError={uploadError}
          experiments={experiments}
          selectedExperimentId={selectedExperimentId}
          onSelectExperiment={setSelectedExperimentId}
          onCreateExperiment={handleCreateExperiment}
          onDeleteExperiment={handleDeleteExperiment}
          onAssignRunToExperiment={handleAssignRunToExperiment}
          onCreateExperimentForRun={handleCreateExperimentForRun}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Map toolbar */}
          <MapToolbar
            onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCenterMap={handleCenterMap}
            isStreaming={isStreaming}
            onToggleStream={handleToggleStream}
            lastAnomalyPoint={lastDataPoint}
            currentCoords={currentCoords}
          />

          {/* Color-mode + run-count toolbar strip */}
          <div className="flex items-center gap-2 px-3 py-1 bg-white border-b border-gray-100 text-xs">
            <Layers className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-gray-500">Color by:</span>
            <button
              className={`px-2 py-0.5 rounded text-xs ${colorMode === 'anomaly' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setColorMode('anomaly')}
            >anomaly</button>
            <button
              className={`px-2 py-0.5 rounded text-xs ${colorMode === 'run' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setColorMode('run')}
            >run</button>
            <div className="flex-1" />
            <span className="text-gray-400">
              {runs.filter(r => r.visible).length} run{runs.filter(r => r.visible).length !== 1 ? 's' : ''} visible ·{' '}
              {runs.filter(r => r.visible).reduce((s, r) => s + r.points.length, 0)} pts
            </span>
          </div>

          {/* Map */}
          <MapView
            runs={runs}
            settings={settings}
            filters={filters}
            thresholds={settings.thresholds}
            colorMode={colorMode}
          />

          {/* Bottom panel — Feed / Plot / Compare */}
          <div className={`bg-white border-t border-gray-200 flex flex-col transition-all duration-200 ${bottomExpanded ? 'h-48' : 'h-9'}`}>
            {/* Tab bar */}
            <div className="flex items-center border-b border-gray-100 h-9 flex-shrink-0 px-1 gap-0.5">
              {(['feed', 'plot', 'compare'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setBottomTab(tab); setBottomExpanded(true); }}
                  className={`px-3 h-full text-xs flex items-center gap-1.5 border-b-2 transition-colors ${
                    bottomTab === tab && bottomExpanded
                      ? 'border-blue-500 text-blue-700 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'feed'    && <><Radio className="h-3 w-3" />Live Feed</>}
                  {tab === 'plot'    && <><BarChart2 className="h-3 w-3" />Plot</>}
                  {tab === 'compare' && <><GitCompare className="h-3 w-3" />Compare</>}
                </button>
              ))}
              <div className="flex-1" />
              <button
                className="text-gray-400 hover:text-gray-600 px-2 text-xs"
                onClick={() => setBottomExpanded(v => !v)}
              >
                {bottomExpanded ? '▾' : '▴'}
              </button>
            </div>

            {/* Panel content */}
            {bottomExpanded && (
              <div className="flex-1 min-h-0 overflow-hidden">
                {bottomTab === 'feed' && (
                  <DataStreamPanel
                    dataLogs={dataLogs}
                    isExpanded={true}
                    onToggleExpand={() => setBottomExpanded(false)}
                    thresholds={settings.thresholds}
                  />
                )}
                {bottomTab === 'plot' && (
                  <AnomalyPlot runs={runs} selectedRunIds={selectedRunIds} />
                )}
                {bottomTab === 'compare' && (
                  <RunCompare runs={runs} selectedRunIds={selectedRunIds} />
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={(s) => { setSettings(s); showToast('Settings saved', 'success'); }}
      />

      <ToastContainer>
        {toasts.map(t => (
          <Toast key={t.id} id={t.id} message={t.message} type={t.type} onDismiss={dismissToast} />
        ))}
      </ToastContainer>
    </div>
  );
};

export default Home;
