import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnomalyDataPoint, AnomalyThresholds } from "@/lib/types";

interface DataStreamPanelProps {
  dataLogs: AnomalyDataPoint[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  thresholds: AnomalyThresholds;
}

const DataStreamPanel: React.FC<DataStreamPanelProps> = ({
  dataLogs,
  isExpanded,
  onToggleExpand,
  thresholds
}) => {
  // Determine anomaly class based on value
  const getAnomalyClass = (value: number) => {
    if (value < thresholds.medium) {
      return "text-green-600";
    } else if (value < thresholds.high) {
      return "text-yellow-600";
    } else {
      return "text-red-600";
    }
  };

  return (
    <div className={`bg-white shadow-inner border-t border-gray-200 ${isExpanded ? 'h-32' : 'h-6'} overflow-y-auto font-mono text-xs transition-all duration-200`}>
      <div className="p-2 text-gray-600 font-sans font-medium border-b border-gray-200 sticky top-0 bg-white flex justify-between items-center">
        <span>Data Stream</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 p-0" onClick={onToggleExpand}>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>
      {isExpanded && (
        <div className="p-2 space-y-1">
          {dataLogs.map((log, index) => (
            <div key={index} className="grid grid-cols-4 gap-2">
              <div>{new Date(log.timestamp).toLocaleTimeString()}</div>
              <div>{log.latitude.toFixed(6)}° {log.latitude >= 0 ? 'N' : 'S'}</div>
              <div>{log.longitude.toFixed(6)}° {log.longitude >= 0 ? 'E' : 'W'}</div>
              <div className={getAnomalyClass(log.anomalyValue)}>
                Δg: {log.anomalyValue.toFixed(2)}
              </div>
            </div>
          ))}
          {dataLogs.length === 0 && (
            <div className="text-center text-gray-500 py-2">No data available</div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataStreamPanel;
