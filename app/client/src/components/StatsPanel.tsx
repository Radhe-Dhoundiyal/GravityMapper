import type { FC } from "react";
import { ExperimentRun, SensorDataPoint } from "@/lib/types";
import { computeRunStats, formatDuration, fmtNum } from "@/lib/runStatistics";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, Thermometer, Gauge, Navigation, Signal, FileText, Database, Radio, Cpu } from "lucide-react";

interface StatsPanelProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
}

const sourceMeta: Record<string, { label: string; icon: any; cls: string }> = {
  raw:       { label: 'Pipeline', icon: Cpu,      cls: 'bg-purple-100 text-purple-700' },
  processed: { label: 'Direct',   icon: FileText, cls: 'bg-blue-100 text-blue-700'    },
  live:      { label: 'Live',     icon: Radio,    cls: 'bg-green-100 text-green-700'  },
  simulated: { label: 'Sim',      icon: Database, cls: 'bg-amber-100 text-amber-700'  },
};

function lastSensorValues(points: SensorDataPoint[]): SensorDataPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.ax != null || p.pressure != null || p.temperature != null) return p;
  }
  return points[points.length - 1] ?? null;
}

const StatsPanel: FC<StatsPanelProps> = ({ runs, selectedRunIds }) => {
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
        const stats = computeRunStats(run);
        const last  = lastSensorValues(run.points);
        if (!stats) {
          return (
            <div key={run.id} className="p-3 text-xs text-gray-400 text-center">
              Run "{run.runId}" has no data.
            </div>
          );
        }

        const src = sourceMeta[stats.processingSource];
        const SrcIcon = src.icon;

        return (
          <div key={run.id} className="border-b border-gray-100 last:border-b-0">
            {/* ── Run metadata header ─────────────────────────────────────────── */}
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: run.color }} />
                <span className="text-xs font-medium truncate flex-1" title={stats.runId}>{stats.runId}</span>
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                  {stats.experimentType}
                </Badge>
                <Badge className={`text-[10px] px-1 py-0 h-4 ${src.cls} flex items-center gap-0.5`}>
                  <SrcIcon className="h-2.5 w-2.5" /> {src.label}
                </Badge>
                <span className="text-[10px] text-gray-500 ml-auto">
                  {stats.sampleCount} pts · {formatDuration(stats.durationSec)}
                </span>
              </div>
            </div>

            {/* ── Anomaly metrics grid ────────────────────────────────────────── */}
            <div className="px-3 py-2 space-y-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Anomaly statistics (mGal)</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Mean',          value: fmtNum(stats.meanAnomaly,   2) },
                  { label: 'Median',        value: fmtNum(stats.medianAnomaly, 2) },
                  { label: 'Std deviation', value: fmtNum(stats.stdAnomaly,    2) },
                  { label: 'Min',           value: fmtNum(stats.minAnomaly,    2) },
                  { label: 'Max',           value: fmtNum(stats.maxAnomaly,    2) },
                  { label: 'Valid samples', value: `${stats.validCount} / ${stats.sampleCount}` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded p-1.5">
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</div>
                    <div className="text-xs font-mono font-medium text-gray-800 mt-0.5 truncate">{value}</div>
                  </div>
                ))}
              </div>

              <Separator className="my-1" />

              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Quality &amp; extent</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: '% stationary', value: `${fmtNum(stats.pctStationary, 0)} %` },
                  { label: '% outliers',   value: `${fmtNum(stats.pctOutliers, 0)} %` },
                  { label: 'Lat range',    value: `${fmtNum(stats.latRange[0], 5)} … ${fmtNum(stats.latRange[1], 5)}` },
                  { label: 'Lng range',    value: `${fmtNum(stats.lngRange[0], 5)} … ${fmtNum(stats.lngRange[1], 5)}` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded p-1.5 col-span-2">
                    <div className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</div>
                    <div className="text-xs font-mono font-medium text-gray-800 mt-0.5 truncate">{value}</div>
                  </div>
                ))}
              </div>

              {/* ── Latest sensor cards ──────────────────────────────────────── */}
              {last && (
                <>
                  <Separator className="my-1" />
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                    {run.mode === 'live' ? 'Latest sensor values' : 'Last sample values'}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(last.ax != null) && (
                      <div className="bg-blue-50 rounded p-1.5 col-span-2">
                        <div className="text-[9px] text-blue-400 uppercase tracking-wide flex items-center gap-1">
                          <Activity className="h-2.5 w-2.5" /> Accelerometer (g)
                        </div>
                        <div className="text-xs font-mono text-blue-800 mt-0.5">
                          X {fmtNum(last.ax, 4)} · Y {fmtNum(last.ay, 4)} · Z {fmtNum(last.az, 4)}
                        </div>
                      </div>
                    )}
                    {(last.gx != null) && (
                      <div className="bg-indigo-50 rounded p-1.5 col-span-2">
                        <div className="text-[9px] text-indigo-400 uppercase tracking-wide flex items-center gap-1">
                          <Activity className="h-2.5 w-2.5" /> Gyroscope (°/s)
                        </div>
                        <div className="text-xs font-mono text-indigo-800 mt-0.5">
                          X {fmtNum(last.gx, 3)} · Y {fmtNum(last.gy, 3)} · Z {fmtNum(last.gz, 3)}
                        </div>
                      </div>
                    )}
                    {last.pressure != null && (
                      <div className="bg-cyan-50 rounded p-1.5">
                        <div className="text-[9px] text-cyan-400 uppercase tracking-wide flex items-center gap-1">
                          <Gauge className="h-2.5 w-2.5" /> Pressure
                        </div>
                        <div className="text-xs font-mono text-cyan-800 mt-0.5">{fmtNum(last.pressure, 1)} hPa</div>
                      </div>
                    )}
                    {last.temperature != null && (
                      <div className="bg-orange-50 rounded p-1.5">
                        <div className="text-[9px] text-orange-400 uppercase tracking-wide flex items-center gap-1">
                          <Thermometer className="h-2.5 w-2.5" /> Temperature
                        </div>
                        <div className="text-xs font-mono text-orange-800 mt-0.5">{fmtNum(last.temperature, 1)} °C</div>
                      </div>
                    )}
                    {last.altitude != null && (
                      <div className="bg-green-50 rounded p-1.5">
                        <div className="text-[9px] text-green-400 uppercase tracking-wide flex items-center gap-1">
                          <Navigation className="h-2.5 w-2.5" /> Altitude
                        </div>
                        <div className="text-xs font-mono text-green-800 mt-0.5">{fmtNum(last.altitude, 1)} m</div>
                      </div>
                    )}
                    {last.fixQuality != null && (
                      <div className="bg-yellow-50 rounded p-1.5">
                        <div className="text-[9px] text-yellow-600 uppercase tracking-wide flex items-center gap-1">
                          <Signal className="h-2.5 w-2.5" /> GPS fix
                        </div>
                        <div className="text-xs font-mono text-yellow-800 mt-0.5">
                          Q{last.fixQuality} · {last.satellites ?? '—'} sats · HDOP {fmtNum(last.hdop, 1)}
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
