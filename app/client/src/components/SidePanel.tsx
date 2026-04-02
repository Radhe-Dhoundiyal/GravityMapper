import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatCard from "./StatCard";
import RunsPanel from "./RunsPanel";
import StatsPanel from "./StatsPanel";
import { Link, Unlink, Table, Code, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ConnectionSettings,
  AnomalyStatistics,
  AnomalyFilters,
  ConnectionStatus,
  ExperimentRun,
} from "@/lib/types";

interface SidePanelProps {
  // connection
  connectionSettings: ConnectionSettings;
  onConnectionSettingsChange: (settings: Partial<ConnectionSettings>) => void;
  connectionStatus: ConnectionStatus;
  onToggleConnection: () => void;
  // legacy stats (used in Connect tab)
  anomalyStats: AnomalyStatistics;
  filters: AnomalyFilters;
  onFiltersChange: (filters: Partial<AnomalyFilters>) => void;
  thresholds: { medium: number; high: number };
  onExportCSV: () => void;
  onExportJSON: () => void;
  onClearData: () => void;
  // runs
  runs: ExperimentRun[];
  selectedRunIds: string[];
  onToggleRunVisibility: (id: string) => void;
  onToggleRunSelect: (id: string) => void;
  onLoadMockData: () => void;
  onUploadCSV: (file: File) => void;
  onDeleteRun: (id: string) => void;
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
  onClearData,
  runs,
  selectedRunIds,
  onToggleRunVisibility,
  onToggleRunSelect,
  onLoadMockData,
  onUploadCSV,
  onDeleteRun,
}) => {
  const isConnected = connectionStatus !== 'disconnected';
  const maxAnomalyPercent = Math.min(anomalyStats.maxAnomaly / 2 * 100, 100);
  const avgAnomalyPercent = Math.min(anomalyStats.avgAnomaly / 2 * 100, 100);

  const getProgressColor = (value: number) => {
    if (value < thresholds.medium) return "bg-green-500";
    if (value < thresholds.high) return "bg-yellow-400";
    return "bg-red-500";
  };

  return (
    <aside className="w-80 bg-white shadow-md flex flex-col border-r border-gray-200 hidden md:flex">
      <Tabs defaultValue="connect" className="flex flex-col flex-1 min-h-0">
        {/* Tab headers — pinned at top */}
        <TabsList className="grid grid-cols-3 rounded-none border-b border-gray-200 h-9 bg-gray-50 flex-shrink-0">
          <TabsTrigger value="connect" className="text-xs rounded-none">Connect</TabsTrigger>
          <TabsTrigger value="runs"    className="text-xs rounded-none">
            Runs
            {runs.length > 0 && (
              <span className="ml-1 text-[9px] bg-blue-500 text-white rounded-full px-1">{runs.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="stats"   className="text-xs rounded-none">
            Stats
            {selectedRunIds.length > 0 && (
              <span className="ml-1 text-[9px] bg-green-500 text-white rounded-full px-1">{selectedRunIds.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Connect tab ──────────────────────────────────────────────────── */}
        <TabsContent value="connect" className="flex flex-col flex-1 min-h-0 overflow-y-auto mt-0">
          {/* Device Connection */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-medium mb-3">Device Connection</h2>
            <div className="space-y-3">
              <div>
                <Label className="mb-1 text-xs">Connection Type</Label>
                <Select
                  value={connectionSettings.connectionType}
                  onValueChange={(value) =>
                    onConnectionSettingsChange({ connectionType: value as ConnectionSettings['connectionType'] })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bluetooth">Bluetooth</SelectItem>
                    <SelectItem value="wifi">WiFi</SelectItem>
                    <SelectItem value="simulate">Simulation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(connectionSettings.connectionType !== 'simulate') && (
                <div className="space-y-2">
                  <div>
                    <Label className="mb-1 text-xs">Device ID / IP Address</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Device ID or IP"
                      value={connectionSettings.deviceId || ''}
                      onChange={(e) => onConnectionSettingsChange({ deviceId: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 text-xs">Port</Label>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      placeholder="Port number"
                      value={connectionSettings.port || ''}
                      onChange={(e) => onConnectionSettingsChange({ port: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <Button
                className={`w-full h-8 text-xs ${isConnected ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-blue-700'}`}
                onClick={onToggleConnection}
              >
                {isConnected ? <Unlink className="mr-2 h-3.5 w-3.5" /> : <Link className="mr-2 h-3.5 w-3.5" />}
                {isConnected ? 'Disconnect' : 'Connect'}
              </Button>
            </div>
          </div>

          {/* Live Anomaly Stats */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-medium mb-3">Live Statistics</h2>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <StatCard label="Total" value={anomalyStats.totalAnomalies} bgColor="bg-blue-50" />
              <StatCard label={`Low <${thresholds.medium}`} value={anomalyStats.lowAnomalies} bgColor="bg-green-50" textColor="text-green-600" />
              <StatCard label={`Med ${thresholds.medium}–${thresholds.high}`} value={anomalyStats.mediumAnomalies} bgColor="bg-yellow-50" textColor="text-yellow-600" />
              <StatCard label={`High >${thresholds.high}`} value={anomalyStats.highAnomalies} bgColor="bg-red-50" textColor="text-red-600" />
            </div>
            <div className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <div className="text-xs font-medium">Max Anomaly</div>
                <div className="text-sm font-mono">{anomalyStats.maxAnomaly.toFixed(2)}</div>
              </div>
              <Progress value={maxAnomalyPercent} className="h-1.5" indicatorClassName={getProgressColor(anomalyStats.maxAnomaly)} />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="text-xs font-medium">Avg Anomaly</div>
                <div className="text-sm font-mono">{anomalyStats.avgAnomaly.toFixed(2)}</div>
              </div>
              <Progress value={avgAnomalyPercent} className="h-1.5" indicatorClassName={getProgressColor(anomalyStats.avgAnomaly)} />
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-medium mb-3">Data Filters</h2>
            <div className="space-y-3">
              <div>
                <Label className="mb-1 text-xs">Min Anomaly</Label>
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={filters.minAnomaly}
                  onChange={(e) => onFiltersChange({ minAnomaly: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>0</span><span>{filters.minAnomaly.toFixed(1)}</span><span>2</span>
                </div>
              </div>
              <div>
                <Label className="mb-1 text-xs">Time Range</Label>
                <Select
                  value={filters.timeRange}
                  onValueChange={(value) => onFiltersChange({ timeRange: value as AnomalyFilters['timeRange'] })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
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

          {/* Export */}
          <div className="p-4 mt-auto">
            <h2 className="text-sm font-medium mb-2">Export</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={onExportCSV}>
                <Table className="mr-1 h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={onExportJSON}>
                <Code className="mr-1 h-3.5 w-3.5" /> JSON
              </Button>
              <Button variant="destructive" size="sm" className="col-span-2 text-xs" onClick={onClearData}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear Live Data
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Runs tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="runs" className="flex flex-col flex-1 min-h-0 overflow-hidden mt-0">
          <RunsPanel
            runs={runs}
            selectedRunIds={selectedRunIds}
            onToggleVisibility={onToggleRunVisibility}
            onToggleSelect={onToggleRunSelect}
            onLoadMockData={onLoadMockData}
            onUploadCSV={onUploadCSV}
            onDeleteRun={onDeleteRun}
          />
        </TabsContent>

        {/* ── Stats tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="stats" className="flex flex-col flex-1 min-h-0 overflow-y-auto mt-0">
          <StatsPanel runs={runs} selectedRunIds={selectedRunIds} />
        </TabsContent>
      </Tabs>
    </aside>
  );
};

export default SidePanel;
