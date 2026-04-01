import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatCard from "./StatCard";
import { Link, Unlink, Table, Code, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  ConnectionSettings, 
  AnomalyStatistics, 
  AnomalyFilters, 
  ConnectionStatus
} from "@/lib/types";

interface SidePanelProps {
  connectionSettings: ConnectionSettings;
  onConnectionSettingsChange: (settings: Partial<ConnectionSettings>) => void;
  connectionStatus: ConnectionStatus;
  onToggleConnection: () => void;
  anomalyStats: AnomalyStatistics;
  filters: AnomalyFilters;
  onFiltersChange: (filters: Partial<AnomalyFilters>) => void;
  thresholds: { medium: number; high: number };
  onExportCSV: () => void;
  onExportJSON: () => void;
  onClearData: () => void;
}

const SidePanel: React.FC<SidePanelProps> = ({
  connectionSettings,
  onConnectionSettingsChange,
  connectionStatus,
  onToggleConnection,
  anomalyStats,
  filters,
  onFiltersChange,
  thresholds,
  onExportCSV,
  onExportJSON,
  onClearData
}) => {
  const getButtonLabel = () => {
    return connectionStatus === 'disconnected' ? 'Connect' : 'Disconnect';
  };
  
  const getButtonIcon = () => {
    return connectionStatus === 'disconnected' ? <Link className="mr-2" /> : <Unlink className="mr-2" />;
  };
  
  const getButtonColor = () => {
    return connectionStatus === 'disconnected' ? 'bg-primary hover:bg-blue-700' : 'bg-red-500 hover:bg-red-600';
  };

  // Calculate max and avg anomaly progress percentages (scale 0-2 to 0-100%)
  const maxAnomalyPercent = Math.min(anomalyStats.maxAnomaly / 2 * 100, 100);
  const avgAnomalyPercent = Math.min(anomalyStats.avgAnomaly / 2 * 100, 100);

  // Determine progress bar colors based on thresholds
  const getProgressColor = (value: number) => {
    if (value < thresholds.medium) return "bg-green-500";
    if (value < thresholds.high) return "bg-yellow-400";
    return "bg-red-500";
  };

  return (
    <aside className="w-80 bg-white shadow-md flex flex-col border-r border-gray-200 hidden md:block">
      {/* Device Connection Section */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium mb-4">Device Connection</h2>
        <div className="space-y-3">
          <div>
            <Label className="mb-1">Connection Type</Label>
            <Select 
              value={connectionSettings.connectionType} 
              onValueChange={(value) => onConnectionSettingsChange({ 
                connectionType: value as ConnectionSettings['connectionType'] 
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select connection type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bluetooth">Bluetooth</SelectItem>
                <SelectItem value="wifi">WiFi</SelectItem>
                <SelectItem value="simulate">Simulation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(connectionSettings.connectionType === 'bluetooth' || connectionSettings.connectionType === 'wifi') && (
            <div className="space-y-3">
              <div>
                <Label className="mb-1">Device ID / IP Address</Label>
                <Input 
                  type="text" 
                  placeholder="Device ID or IP" 
                  value={connectionSettings.deviceId || ''}
                  onChange={(e) => onConnectionSettingsChange({ deviceId: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Port</Label>
                <Input 
                  type="number" 
                  placeholder="Port number" 
                  value={connectionSettings.port || ''}
                  onChange={(e) => onConnectionSettingsChange({ port: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button 
              className={`w-full ${getButtonColor()}`} 
              onClick={onToggleConnection}
            >
              {getButtonIcon()}
              {getButtonLabel()}
            </Button>
          </div>
        </div>
      </div>

      {/* Anomaly Statistics Section */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium mb-4">Anomaly Statistics</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard 
            label="Total Anomalies" 
            value={anomalyStats.totalAnomalies} 
            bgColor="bg-blue-50" 
          />
          <StatCard 
            label={`Low (<${thresholds.medium})`} 
            value={anomalyStats.lowAnomalies} 
            bgColor="bg-green-50" 
            textColor="text-green-600"
          />
          <StatCard 
            label={`Medium (${thresholds.medium}-${thresholds.high})`} 
            value={anomalyStats.mediumAnomalies} 
            bgColor="bg-yellow-50" 
            textColor="text-yellow-600"
          />
          <StatCard 
            label={`High (>${thresholds.high})`} 
            value={anomalyStats.highAnomalies} 
            bgColor="bg-red-50" 
            textColor="text-red-600"
          />
        </div>

        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <div className="text-sm font-medium">Strongest Anomaly</div>
            <div className="text-lg font-mono font-medium">
              {anomalyStats.maxAnomaly.toFixed(2)}
            </div>
          </div>
          <Progress 
            value={maxAnomalyPercent} 
            className="h-1.5"
            indicatorClassName={getProgressColor(anomalyStats.maxAnomaly)} 
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <div className="text-sm font-medium">Average Strength</div>
            <div className="text-lg font-mono font-medium">
              {anomalyStats.avgAnomaly.toFixed(2)}
            </div>
          </div>
          <Progress 
            value={avgAnomalyPercent} 
            className="h-1.5"
            indicatorClassName={getProgressColor(anomalyStats.avgAnomaly)} 
          />
        </div>
      </div>

      {/* Filter Controls Section */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium mb-4">Data Filters</h2>
        <div className="space-y-3">
          <div>
            <Label className="mb-1">Minimum Anomaly Value</Label>
            <div className="px-1">
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="0.1" 
                value={filters.minAnomaly}
                onChange={(e) => onFiltersChange({ minAnomaly: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0</span>
                <span>{filters.minAnomaly.toFixed(1)}</span>
                <span>2</span>
              </div>
            </div>
          </div>
          <div>
            <Label className="mb-1">Time Range</Label>
            <Select 
              value={filters.timeRange} 
              onValueChange={(value) => onFiltersChange({ 
                timeRange: value as AnomalyFilters['timeRange'] 
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Data</SelectItem>
                <SelectItem value="hour">Last Hour</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Export Controls Section */}
      <div className="p-4 mt-auto border-t border-gray-200">
        <h2 className="text-lg font-medium mb-3">Export Data</h2>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onExportCSV}>
            <Table className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={onExportJSON}>
            <Code className="mr-1 h-4 w-4" /> JSON
          </Button>
          <Button variant="destructive" className="col-span-2" onClick={onClearData}>
            <Trash2 className="mr-1 h-4 w-4" /> Clear Data
          </Button>
        </div>
      </div>
    </aside>
  );
};

export default SidePanel;
