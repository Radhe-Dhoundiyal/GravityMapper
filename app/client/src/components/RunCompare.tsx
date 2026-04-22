import { useMemo, type FC } from "react";
import { ExperimentRun } from "@/lib/types";
import { computeRunStats, fmtNum, formatDuration } from "@/lib/runStatistics";

interface RunCompareProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
}

const ROWS: { label: string; key: string; unit: string; d: number; highlight?: boolean }[] = [
  { label: 'Mean anomaly',   key: 'meanAnomaly',   unit: 'mGal', d: 2, highlight: true },
  { label: 'Std deviation',  key: 'stdAnomaly',    unit: 'mGal', d: 2, highlight: true },
  { label: 'Median',         key: 'medianAnomaly', unit: 'mGal', d: 2 },
  { label: 'Min',            key: 'minAnomaly',    unit: 'mGal', d: 2 },
  { label: 'Max',            key: 'maxAnomaly',    unit: 'mGal', d: 2 },
  { label: 'Sample count',   key: 'sampleCount',   unit: '',     d: 0 },
  { label: 'Duration',       key: 'durationSec',   unit: 's',    d: 1 },
  { label: '% stationary',   key: 'pctStationary', unit: '%',    d: 0 },
  { label: '% outliers',     key: 'pctOutliers',   unit: '%',    d: 0 },
];

// Metrics where computing a delta makes physical sense
const DELTA_KEYS = new Set(['meanAnomaly', 'stdAnomaly', 'medianAnomaly', 'minAnomaly', 'maxAnomaly']);

const RunCompare: FC<RunCompareProps> = ({ runs, selectedRunIds }) => {
  // Compute stats for ALL selected runs unconditionally — keep hook order stable
  const allStats = useMemo(
    () => runs
      .filter(r => selectedRunIds.includes(r.id))
      .slice(0, 2)
      .map(r => ({ run: r, stats: computeRunStats(r) })),
    [runs, selectedRunIds],
  );

  if (allStats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs p-4 text-center">
        Select up to two runs in the Runs tab to compare them.
      </div>
    );
  }

  const statA = allStats[0]?.stats;
  const statB = allStats[1]?.stats;
  const meanDiff = statA && statB ? statA.meanAnomaly - statB.meanAnomaly : null;

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <th className="text-left px-3 py-2 text-gray-500 font-normal text-[10px] w-1/3">Metric</th>
            {allStats.map(({ run }) => (
              <th key={run.id} className="px-2 py-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: run.color }} />
                  <span className="font-medium text-[10px] truncate max-w-[80px]">{run.experimentId}</span>
                </div>
                <div className="text-[9px] text-gray-400 font-normal truncate max-w-[110px]">
                  {run.runId.split('_').slice(-1)[0]}
                </div>
              </th>
            ))}
            {allStats.length === 2 && (
              <th className="px-2 py-2 text-center text-[10px] text-gray-500 font-normal">Δ (A−B)</th>
            )}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ label, key, unit, d, highlight }) => {
            const vA = statA ? (statA as any)[key] : null;
            const vB = statB ? (statB as any)[key] : null;
            const showDelta = allStats.length === 2 && DELTA_KEYS.has(key) && vA != null && vB != null;
            const delta = showDelta ? vA - vB : null;

            const fmt = (v: any) => key === 'durationSec'
              ? formatDuration(v)
              : `${fmtNum(v, d)}${unit ? ` ${unit}` : ''}`;

            return (
              <tr key={key} className={`border-b border-gray-100 ${highlight ? 'bg-blue-50/40' : ''}`}>
                <td className="px-3 py-1.5 text-gray-600">{label}</td>
                <td className="px-2 py-1.5 text-center font-mono text-gray-800">{fmt(vA)}</td>
                {allStats.length === 2 && (
                  <td className="px-2 py-1.5 text-center font-mono text-gray-800">{fmt(vB)}</td>
                )}
                {allStats.length === 2 && (
                  <td className={`px-2 py-1.5 text-center font-mono ${
                    delta != null && Math.abs(delta) > 0.001
                      ? (delta > 0 ? 'text-amber-600' : 'text-blue-600')
                      : 'text-gray-400'
                  }`}>
                    {delta != null ? `${delta > 0 ? '+' : ''}${fmtNum(delta, d)}` : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {allStats.length === 2 && meanDiff != null && isFinite(meanDiff) && (
        <div className="px-3 py-2 bg-gray-50 text-[10px] text-gray-500 border-t border-gray-200">
          Mean anomaly difference:{' '}
          <span className="font-mono font-medium text-gray-700">{fmtNum(Math.abs(meanDiff))} mGal</span>
          {statA!.meanAnomaly !== 0 && statB!.meanAnomaly !== 0 && (
            <>
              {' '}({fmtNum(
                Math.abs(meanDiff) / Math.abs((statA!.meanAnomaly + statB!.meanAnomaly) / 2) * 100,
                1,
              )} % relative)
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RunCompare;
