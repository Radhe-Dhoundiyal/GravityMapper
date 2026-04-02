import React from "react";
import { ExperimentRun, SensorDataPoint } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, Thermometer, Gauge, Navigation, Signal } from "lucide-react";

interface StatsPanelProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
}

function runStats(points: SensorDataPoint[]) {
  const valid = points.filter(p => p.anomalyValue != null && isFinite(p.anomalyValue));
  if (valid.length === 0) return null;

  const vals = valid.map(p => p.anomalyValue);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const lats = valid.map(p => p.latitude);
  const lngs = valid.map(p => p.longitude);

  const tsFirst = points[0]?.timestamp;
  const tsLast  = points[points.length - 1]?.timestamp;
  const duration = tsFirst && tsLast
    ? ((tsLast.getTime() - tsFirst.getTime()) / 1000)
    : null;

  const nStationary = points.filter(p => p.platformStationary).length;
  const nOutlier    = points.filter(p => p.outlierFlag).length;

  return {
    n: valid.length,
    mean, std, min, max,
    latRange: [Math.min(...lats), Math.max(...lats)],
    lngRange: [Math.min(...lngs), Math.max(...lngs)],
    duration,
    pctStationary: valid.length ? (nStationary / valid.length) * 100 : 0,
    pctOutlier: valid.length ? (nOutlier / valid.length) * 100 : 0,
  };
}

function lastSensorValues(points: SensorDataPoint[]): SensorDataPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.ax != null || p.pressure != null || p.temperature != null) return p;
  }
  return points[points.length - 1] ?? null;
}

function n(v: number | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(digits);
}

const StatsPanel: React.FC<StatsPanelProps> = ({ runs, selectedRunIds }) => {
  const selected = runs.filter(r => selectedRunIds.includes(r.id));

  if (selected.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 text-xs mt-4">
        Select one or more runs in the Runs tab to see statistics.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      {selected.map(run => {
        const st = runStats(run.points);
        const last = lastSensorValues(run.points);
        if (!st) return null;

        return (
          <div key={run.id} className="border-b border-gray-100 last:border-b-0">
            {/* Run header */}
            <div className="px-3 py-2 flex items-center gap-2 bg-gray-50">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: run.color }} />
              <span className="text-xs font-medium truncate">{run.runId}</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-auto">{run.experimentId}</Badge>
            </div>

            <div className="px-3 py-2 space-y-2">
              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Mean anomaly', value: `${n(st.mean)} mGal` },
                  { label: 'Std deviation', value: `${n(st.std)} mGal` },
                  { label: 'Min / Max', value: `${n(st.min)} / ${n(st.max)}` },
                  { label: 'Sample count', value: String(st.n) },
                  { label: 'Duration', value: st.duration != null ? `${st.duration.toFixed(1)} s` : '—' },
                  { label: '% stationary', value: `${n(st.pctStationary, 0)} %` },
                  { label: '% outlier', value: `${n(st.pctOutlier, 0)} %` },
                  { label: 'Lat range', value: `${n(st.latRange[0], 5)}…${n(st.latRange[1], 5)}` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded p-1.5">
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</div>
                    <div className="text-xs font-mono font-medium text-gray-800 mt-0.5 truncate">{value}</div>
                  </div>
                ))}
              </div>

              {/* Sensor cards */}
              {last && (
                <>
                  <Separator className="my-1" />
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                    {run.mode === 'live' ? 'Latest sensor values' : 'Last sample values'}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Accel */}
                    {(last.ax != null) && (
                      <div className="bg-blue-50 rounded p-1.5 col-span-2">
                        <div className="text-[9px] text-blue-400 uppercase tracking-wide flex items-center gap-1">
                          <Activity className="h-2.5 w-2.5" /> Accelerometer (g)
                        </div>
                        <div className="text-xs font-mono text-blue-800 mt-0.5">
                          X {n(last.ax, 4)} · Y {n(last.ay, 4)} · Z {n(last.az, 4)}
                        </div>
                      </div>
                    )}
                    {/* Gyro */}
                    {(last.gx != null) && (
                      <div className="bg-indigo-50 rounded p-1.5 col-span-2">
                        <div className="text-[9px] text-indigo-400 uppercase tracking-wide flex items-center gap-1">
                          <Activity className="h-2.5 w-2.5" /> Gyroscope (°/s)
                        </div>
                        <div className="text-xs font-mono text-indigo-800 mt-0.5">
                          X {n(last.gx, 3)} · Y {n(last.gy, 3)} · Z {n(last.gz, 3)}
                        </div>
                      </div>
                    )}
                    {/* Pressure */}
                    {last.pressure != null && (
                      <div className="bg-cyan-50 rounded p-1.5">
                        <div className="text-[9px] text-cyan-400 uppercase tracking-wide flex items-center gap-1">
                          <Gauge className="h-2.5 w-2.5" /> Pressure
                        </div>
                        <div className="text-xs font-mono text-cyan-800 mt-0.5">{n(last.pressure, 1)} hPa</div>
                      </div>
                    )}
                    {/* Temperature */}
                    {last.temperature != null && (
                      <div className="bg-orange-50 rounded p-1.5">
                        <div className="text-[9px] text-orange-400 uppercase tracking-wide flex items-center gap-1">
                          <Thermometer className="h-2.5 w-2.5" /> Temperature
                        </div>
                        <div className="text-xs font-mono text-orange-800 mt-0.5">{n(last.temperature, 1)} °C</div>
                      </div>
                    )}
                    {/* Altitude */}
                    {last.altitude != null && (
                      <div className="bg-green-50 rounded p-1.5">
                        <div className="text-[9px] text-green-400 uppercase tracking-wide flex items-center gap-1">
                          <Navigation className="h-2.5 w-2.5" /> Altitude
                        </div>
                        <div className="text-xs font-mono text-green-800 mt-0.5">{n(last.altitude, 1)} m</div>
                      </div>
                    )}
                    {/* GPS */}
                    {last.fixQuality != null && (
                      <div className="bg-yellow-50 rounded p-1.5">
                        <div className="text-[9px] text-yellow-600 uppercase tracking-wide flex items-center gap-1">
                          <Signal className="h-2.5 w-2.5" /> GPS fix
                        </div>
                        <div className="text-xs font-mono text-yellow-800 mt-0.5">
                          Q{last.fixQuality} · {last.satellites ?? '—'} sats · HDOP {n(last.hdop, 1)}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsPanel;
