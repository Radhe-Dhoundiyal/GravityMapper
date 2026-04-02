import React from "react";
import { SensorDataPoint, AnomalyThresholds } from "@/lib/types";

interface DataStreamPanelProps {
  dataLogs: SensorDataPoint[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  thresholds: AnomalyThresholds;
}

const DataStreamPanel: React.FC<DataStreamPanelProps> = ({
  dataLogs,
  isExpanded,
  onToggleExpand,
  thresholds,
}) => {
  const getAnomalyClass = (value: number) => {
    if (value < thresholds.medium)  return "text-green-600";
    if (value < thresholds.high)    return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="h-full overflow-y-auto font-mono text-xs bg-white">
      {dataLogs.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">
          Waiting for live data…
        </div>
      ) : (
        <div className="p-2 space-y-0.5">
          {[...dataLogs].reverse().map((log, index) => (
            <div key={index} className="grid gap-x-2 text-[10px] leading-5" style={{ gridTemplateColumns: '70px 100px 100px 90px auto' }}>
              <div className="text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</div>
              <div>{log.latitude.toFixed(5)}° {log.latitude >= 0 ? 'N' : 'S'}</div>
              <div>{log.longitude.toFixed(5)}° {log.longitude >= 0 ? 'E' : 'W'}</div>
              <div className={getAnomalyClass(log.anomalyValue)}>
                Δg {log.anomalyValue.toFixed(3)}
              </div>
              {/* Optional extended fields */}
              <div className="text-gray-400 truncate">
                {log.temperature != null && `${log.temperature.toFixed(1)}°C `}
                {log.altitude != null && `${log.altitude.toFixed(0)}m `}
                {log.satellites != null && `${log.satellites}sat`}
                {log.outlierFlag && <span className="text-red-400 ml-1">⚠</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DataStreamPanel;
