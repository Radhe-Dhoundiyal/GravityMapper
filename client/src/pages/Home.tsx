import React, { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/AppHeader";
import SidePanel from "@/components/SidePanel";
import MapView from "@/components/MapView";
import MapToolbar from "@/components/MapToolbar";
import DataStreamPanel from "@/components/DataStreamPanel";
import SettingsModal from "@/components/SettingsModal";
import { useWebSocket } from "@/lib/useWebSocket";
import { ToastContainer, Toast } from "@/components/ui/toast";
import { 
  AnomalyDataPoint, 
  AnomalyStatistics, 
  ConnectionSettings,
  AppSettings,
  AnomalyFilters,
  ConnectionStatus,
  WebSocketMessage
} from "@/lib/types";

let simulationInterval: NodeJS.Timeout | null = null;

const Home: React.FC = () => {
  // State for data points and statistics
  const [dataPoints, setDataPoints] = useState<AnomalyDataPoint[]>([]);
  const [dataLogs, setDataLogs] = useState<AnomalyDataPoint[]>([]);
  const [statistics, setStatistics] = useState<AnomalyStatistics>({
    totalAnomalies: 0,
    lowAnomalies: 0,
    mediumAnomalies: 0,
    highAnomalies: 0,
    maxAnomaly: 0,
    avgAnomaly: 0
  });
  
  // UI state
  const [isStreamPanelExpanded, setIsStreamPanelExpanded] = useState(true);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [lastDataPoint, setLastDataPoint] = useState<AnomalyDataPoint | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([]);
  
  // App settings and filters
  const [settings, setSettings] = useState<AppSettings>({
    mapStyle: 'standard',
    defaultLat: 37.7749,
    defaultLng: -122.4194,
    thresholds: {
      medium: 0.5,
      high: 1.0
    },
    darkMode: false
  });
  
  const [filters, setFilters] = useState<AnomalyFilters>({
    minAnomaly: 0,
    timeRange: 'all'
  });
  
  // Connection state
  const [connectionSettings, setConnectionSettings] = useState<ConnectionSettings>({
    connectionType: 'simulate',
    deviceId: '',
    port: ''
  });
  
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // WebSocket connection
  const { 
    isConnected: wsConnected,
    connect: wsConnect,
    disconnect: wsDisconnect,
    sendMessage: wsSendMessage
  } = useWebSocket({
    onMessage: handleWebSocketMessage,
    manual: true
  });

  // Websocket message handler
  function handleWebSocketMessage(data: WebSocketMessage) {
    if (data.type === 'newAnomalyPoint') {
      const newPoint = data.data as AnomalyDataPoint;
      
      // Ensure timestamp is a Date object
      if (typeof newPoint.timestamp === 'string') {
        newPoint.timestamp = new Date(newPoint.timestamp);
      }
      
      addDataPoint(newPoint);
    } else if (data.type === 'initialData') {
      // Convert timestamps to Date objects
      const points = (data.data as AnomalyDataPoint[]).map(point => ({
        ...point,
        timestamp: new Date(point.timestamp)
      }));
      
      setDataPoints(points);
      updateStatistics(points);
      
      if (points.length > 0) {
        // Add up to the last 100 points to the data logs
        const logsToAdd = points.slice(-100);
        setDataLogs(logsToAdd);
        setLastDataPoint(points[points.length - 1]);
      }
      
      showToast(`Loaded ${points.length} data points`, 'info');
    } else if (data.type === 'dataCleared') {
      setDataPoints([]);
      setDataLogs([]);
      setLastDataPoint(null);
      updateStatistics([]);
      showToast('All data has been cleared', 'info');
    } else if (data.type === 'error') {
      showToast(data.message || 'An error occurred', 'error');
    }
  }

  // Toast management
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Handle connection toggle
  const handleToggleConnection = useCallback(() => {
    if (connectionStatus === 'disconnected') {
      // Connect logic
      if (connectionSettings.connectionType === 'simulate') {
        // Connect to WebSocket server
        wsConnect();
        setConnectionStatus('simulation');
        showToast('Connected to simulation mode', 'success');
      } else {
        // Check for required fields
        if (!connectionSettings.deviceId || !connectionSettings.port) {
          showToast('Please enter device ID/IP and port', 'error');
          return;
        }
        
        // Connect to WebSocket server
        wsConnect();
        setConnectionStatus('connected');
        showToast(`Connected to ${connectionSettings.connectionType.toUpperCase()} device: ${connectionSettings.deviceId}`, 'success');
      }
    } else {
      // Disconnect logic
      if (isStreaming) {
        handleToggleStream();
      }
      
      wsDisconnect();
      setConnectionStatus('disconnected');
      showToast('Disconnected from device', 'info');
    }
  }, [connectionStatus, connectionSettings, isStreaming, wsConnect, wsDisconnect, showToast]);

  // Handle data streaming toggle
  const handleToggleStream = useCallback(() => {
    if (!connectionStatus.includes('connected') && connectionStatus !== 'simulation') {
      showToast('Connect to a device first', 'error');
      return;
    }
    
    if (isStreaming) {
      // Stop streaming
      setIsStreaming(false);
      
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
      
      showToast('Data stream stopped', 'info');
    } else {
      // Start streaming
      setIsStreaming(true);
      
      // If in simulation mode, start generating data
      if (connectionSettings.connectionType === 'simulate') {
        simulationInterval = setInterval(generateSimulatedData, 2000);
      }
      
      showToast('Data stream started', 'success');
    }
  }, [connectionStatus, isStreaming, connectionSettings.connectionType, showToast]);

  // Generate simulated data
  const generateSimulatedData = useCallback(() => {
    const lastPoint = dataPoints.length > 0 
      ? dataPoints[dataPoints.length - 1] 
      : { latitude: settings.defaultLat, longitude: settings.defaultLng, anomalyValue: 0, timestamp: new Date() };
    
    // Generate a random point near the last point
    const latitude = lastPoint.latitude + (Math.random() - 0.5) * 0.01;
    const longitude = lastPoint.longitude + (Math.random() - 0.5) * 0.01;
    
    // Generate a random anomaly value (weighted towards smaller values)
    const anomalyValue = Math.pow(Math.random(), 2) * 2;
    
    // Create a timestamp
    const timestamp = new Date();
    
    const dataPoint: AnomalyDataPoint = {
      latitude,
      longitude,
      anomalyValue,
      timestamp
    };
    
    // Send to server
    wsSendMessage({
      type: "newAnomalyPoint",
      data: dataPoint
    });
  }, [dataPoints, settings.defaultLat, settings.defaultLng, wsSendMessage]);

  // Add a data point and update stats
  const addDataPoint = useCallback((point: AnomalyDataPoint) => {
    setDataPoints(prev => [...prev, point]);
    setDataLogs(prev => {
      const newLogs = [...prev, point];
      // Limit to last 100 entries
      return newLogs.slice(-100);
    });
    setLastDataPoint(point);
    
    // Update statistics with the new point
    updateStatistics([...dataPoints, point]);
  }, [dataPoints]);

  // Update statistics based on data points
  const updateStatistics = useCallback((points: AnomalyDataPoint[]) => {
    if (points.length === 0) {
      setStatistics({
        totalAnomalies: 0,
        lowAnomalies: 0,
        mediumAnomalies: 0,
        highAnomalies: 0,
        maxAnomaly: 0,
        avgAnomaly: 0
      });
      return;
    }
    
    let lowCount = 0;
    let mediumCount = 0;
    let highCount = 0;
    let maxAnomaly = 0;
    let totalAnomaly = 0;
    
    points.forEach(point => {
      const value = point.anomalyValue;
      
      if (value < settings.thresholds.medium) {
        lowCount++;
      } else if (value < settings.thresholds.high) {
        mediumCount++;
      } else {
        highCount++;
      }
      
      if (value > maxAnomaly) {
        maxAnomaly = value;
      }
      
      totalAnomaly += value;
    });
    
    const avgAnomaly = totalAnomaly / points.length;
    
    setStatistics({
      totalAnomalies: points.length,
      lowAnomalies: lowCount,
      mediumAnomalies: mediumCount,
      highAnomalies: highCount,
      maxAnomaly,
      avgAnomaly
    });
  }, [settings.thresholds]);

  // Export functions
  const handleExportCSV = useCallback(() => {
    if (dataPoints.length === 0) {
      showToast('No data to export', 'error');
      return;
    }
    
    // Create CSV content
    let csv = 'Timestamp,Latitude,Longitude,AnomalyValue\n';
    
    dataPoints.forEach(point => {
      csv += `${new Date(point.timestamp).toISOString()},${point.latitude},${point.longitude},${point.anomalyValue}\n`;
    });
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gravitational-anomalies-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported as CSV', 'success');
  }, [dataPoints, showToast]);

  const handleExportJSON = useCallback(() => {
    if (dataPoints.length === 0) {
      showToast('No data to export', 'error');
      return;
    }
    
    // Create JSON content
    const jsonData = JSON.stringify({
      metadata: {
        exportDate: new Date().toISOString(),
        pointCount: dataPoints.length,
        stats: statistics
      },
      points: dataPoints
    }, null, 2);
    
    // Create download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gravitational-anomalies-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported as JSON', 'success');
  }, [dataPoints, statistics, showToast]);

  const handleClearData = useCallback(() => {
    if (dataPoints.length === 0) {
      showToast('No data to clear', 'info');
      return;
    }
    
    // Confirm before clearing
    if (window.confirm('Are you sure you want to clear all collected data? This cannot be undone.')) {
      // Send clear command to server
      wsSendMessage({
        type: "clearData"
      });
    }
  }, [dataPoints.length, wsSendMessage, showToast]);

  // Clean up simulation interval on unmount
  useEffect(() => {
    return () => {
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
    };
  }, []);

  // Map functions
  const handleZoomIn = useCallback(() => {
    // This will be handled by MapView using ref
    const mapZoomInEvent = new CustomEvent('map:zoomIn');
    window.dispatchEvent(mapZoomInEvent);
  }, []);

  const handleZoomOut = useCallback(() => {
    // This will be handled by MapView using ref
    const mapZoomOutEvent = new CustomEvent('map:zoomOut');
    window.dispatchEvent(mapZoomOutEvent);
  }, []);

  const handleCenterMap = useCallback(() => {
    // This will be handled by MapView using ref
    const mapCenterEvent = new CustomEvent('map:center', {
      detail: lastDataPoint ? 
        { lat: lastDataPoint.latitude, lng: lastDataPoint.longitude } : 
        { lat: settings.defaultLat, lng: settings.defaultLng }
    });
    window.dispatchEvent(mapCenterEvent);
  }, [lastDataPoint, settings.defaultLat, settings.defaultLng]);

  return (
    <div className="h-screen flex flex-col bg-light text-dark">
      <AppHeader 
        connectionStatus={connectionStatus} 
        onOpenSettings={() => setIsSettingsModalOpen(true)} 
      />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar */}
        {isSidebarVisible && (
          <div className="md:hidden absolute inset-0 z-10 bg-black bg-opacity-50" onClick={() => setIsSidebarVisible(false)}>
            <div className="h-full w-80" onClick={e => e.stopPropagation()}>
              <SidePanel
                connectionSettings={connectionSettings}
                onConnectionSettingsChange={(settings) => setConnectionSettings(prev => ({ ...prev, ...settings }))}
                connectionStatus={connectionStatus}
                onToggleConnection={handleToggleConnection}
                anomalyStats={statistics}
                filters={filters}
                onFiltersChange={(newFilters) => setFilters(prev => ({ ...prev, ...newFilters }))}
                thresholds={settings.thresholds}
                onExportCSV={handleExportCSV}
                onExportJSON={handleExportJSON}
                onClearData={handleClearData}
              />
            </div>
          </div>
        )}
        
        {/* Desktop sidebar */}
        <SidePanel
          connectionSettings={connectionSettings}
          onConnectionSettingsChange={(settings) => setConnectionSettings(prev => ({ ...prev, ...settings }))}
          connectionStatus={connectionStatus}
          onToggleConnection={handleToggleConnection}
          anomalyStats={statistics}
          filters={filters}
          onFiltersChange={(newFilters) => setFilters(prev => ({ ...prev, ...newFilters }))}
          thresholds={settings.thresholds}
          onExportCSV={handleExportCSV}
          onExportJSON={handleExportJSON}
          onClearData={handleClearData}
        />
        
        {/* Main content area */}
        <main className="flex-1 flex flex-col overflow-hidden">
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
          
          <MapView
            dataPoints={dataPoints}
            settings={settings}
            filters={filters}
            thresholds={settings.thresholds}
          />
          
          {isStreaming && (
            <DataStreamPanel
              dataLogs={dataLogs}
              isExpanded={isStreamPanelExpanded}
              onToggleExpand={() => setIsStreamPanelExpanded(!isStreamPanelExpanded)}
              thresholds={settings.thresholds}
            />
          )}
        </main>
      </div>
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={(newSettings) => {
          setSettings(newSettings);
          showToast('Settings saved successfully', 'success');
        }}
      />
      
      {/* Toast notifications */}
      <ToastContainer>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={dismissToast}
          />
        ))}
      </ToastContainer>
    </div>
  );
};

export default Home;
