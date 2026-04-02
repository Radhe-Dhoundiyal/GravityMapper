import React, { useMemo } from "react";
import { ExperimentRun, SensorDataPoint } from "@/lib/types";

interface RunCompareProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
}

function stats(points: SensorDataPoint[]) {
  const vals = points.map(p => p.anomalyValue).filter(v => isFinite(v));
  if (vals.length === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const tsA  = points[0]?.timestamp;
  const tsB  = points[points.length - 1]?.timestamp;
  const dur  = tsA && tsB ? (tsB.getTime() - tsA.getTime()) / 1000 : null;
  const nStat = points.filter(p => p.platformStationary).length;
  const nOut  = points.filter(p => p.outlierFlag).length;
  return {
    mean, std,
    min: Math.min(...vals),
    max: Math.max(...vals),
    n: vals.length,
    dur,
    pctStat: vals.length ? (nStat / vals.length) * 100 : 0,
    pctOut:  vals.length ? (nOut  / vals.length) * 100 : 0,
  };
}

function n(v: number | null | undefined, d = 2): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(d);
}

const ROWS = [
  { label: 'Mean anomaly',   key: 'mean',    unit: 'mGal', d: 2 },
  { label: 'Std deviation',  key: 'std',     unit: 'mGal', d: 2 },
  { label: 'Min',            key: 'min',     unit: 'mGal', d: 2 },
  { label: 'Max',            key: 'max',     unit: 'mGal', d: 2 },
  { label: 'Samples (MAD)', key: 'n',       unit: '',     d: 0 },
  { label: 'Duration',       key: 'dur',     unit: 's',    d: 1 },
  { label: '% stationary',   key: 'pctStat', unit: '%',    d: 0 },
  { label: '% outlier',      key: 'pctOut',  unit: '%',    d: 0 },
] as const;

const RunCompare: React.FC<RunCompareProps> = ({ runs, selectedRunIds }) => {
  const selected = runs.filter(r => selectedRunIds.includes(r.id)).slice(0, 2);

  if (selected.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs p-4 text-center">
        Select two runs in the Runs tab to compare them.
      </div>
    );
  }

  const statA = useMemo(() => selected[0] ? stats(selected[0].points) : null, [selected[0]]);
  const statB = useMemo(() => selected[1] ? stats(selected[1].points) : null, [selected[1]]);

  const meanDiff = statA && statB ? statA.mean - statB.mean : null;

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-3 py-2 text-gray-500 font-normal text-[10px] w-1/3">Metric</th>
            {selected.map(r => (
              <th key={r.id} className="px-2 py-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: r.color }} />
                  <span className="font-medium text-[10px] truncate max-w-[80px]">{r.experimentId}</span>
                </div>
                <div className="text-[9px] text-gray-400 font-normal truncate max-w-[90px]">{r.runId.split('_').slice(-1)[0]}</div>
              </th>
            ))}
            {selected.length === 2 && (
              <th className="px-2 py-2 text-center text-[10px] text-gray-500 font-normal">Δ (A−B)</th>
            )}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ label, key, unit, d }) => {
            const vA = statA ? (statA as any)[key] : null;
            const vB = statB ? (statB as any)[key] : null;
            const delta = (vA != null && vB != null && key !== 'n' && key !== 'pctStat' && key !== 'pctOut')
              ? vA - vB : null;

            const highlight = key === 'mean' || key === 'std';

            return (
              <tr key={key} className={`border-b border-gray-100 ${highlight ? 'bg-blue-50/40' : ''}`}>
                <td className="px-3 py-1.5 text-gray-600">{label}</td>
                <td className="px-2 py-1.5 text-center font-mono text-gray-800">
                  {n(vA, d as number)}{unit ? ` ${unit}` : ''}
                </td>
                {selected.length === 2 && (
                  <td className="px-2 py-1.5 text-center font-mono text-gray-800">
                    {n(vB, d as number)}{unit ? ` ${unit}` : ''}
                  </td>
                )}
                {selected.length === 2 && (
                  <td className={`px-2 py-1.5 text-center font-mono ${delta != null && Math.abs(delta) > 0.001 ? (delta > 0 ? 'text-amber-600' : 'text-blue-600') : 'text-gray-400'}`}>
                    {delta != null ? `${delta > 0 ? '+' : ''}${n(delta, d as number)}` : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {selected.length === 2 && meanDiff != null && (
        <div className="px-3 py-2 bg-gray-50 text-[10px] text-gray-500 border-t border-gray-200">
          Mean anomaly difference: <span className="font-mono font-medium text-gray-700">{n(Math.abs(meanDiff))} mGal</span>
          {' '}({n(Math.abs(meanDiff) / Math.abs((statA!.mean + statB!.mean) / 2) * 100, 1)} % relative)
        </div>
      )}
    </div>
  );
};

export default RunCompare;
