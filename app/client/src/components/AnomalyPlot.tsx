import { useMemo, Fragment, type FC } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
} from "recharts";
import { ExperimentRun } from "@/lib/types";
import { getAnomalyValue } from "@/lib/runStatistics";

interface AnomalyPlotProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
}

interface SeriesKey {
  rawKey: string;
  smoothKey: string;
  outlierKey: string;
  color: string;
  label: string;
  hasSmoothed: boolean;
}

const AnomalyPlot: FC<AnomalyPlotProps> = ({ runs, selectedRunIds }) => {
  const selected = runs.filter(r => selectedRunIds.includes(r.id));

  // Build a unified time-indexed dataset across all selected runs.
  // Each row is keyed by a unix-ms timestamp; per-run series are stored as
  // separate keys so they can be plotted as parallel lines on the same chart.
  const { chartData, seriesKeys, tFirst, tLast } = useMemo(() => {
    if (selected.length === 0) {
      return { chartData: [], seriesKeys: [] as SeriesKey[], tFirst: 0, tLast: 0 };
    }

    const seriesKeys: SeriesKey[] = [];
    // Map<timestamp_ms, row>
    const rowMap = new Map<number, Record<string, any>>();

    let tFirst = Infinity;
    let tLast  = -Infinity;

    for (const run of selected) {
      const rawKey      = `${run.id}__raw`;
      const smoothKey   = `${run.id}__smooth`;
      const outlierKey  = `${run.id}__outlier`;
      let hasSmoothed   = false;

      for (const p of run.points) {
        const ts = p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime();
        if (!isFinite(ts)) continue;
        if (ts < tFirst) tFirst = ts;
        if (ts > tLast)  tLast  = ts;

        let row = rowMap.get(ts);
        if (!row) {
          row = { t: ts };
          rowMap.set(ts, row);
        }

        const v = getAnomalyValue(p);
        if (v != null) row[rawKey] = +v.toFixed(4);

        if (p.anomalySmoothed != null && isFinite(p.anomalySmoothed)) {
          row[smoothKey] = +p.anomalySmoothed.toFixed(4);
          hasSmoothed = true;
        }

        if (p.outlierFlag === true && v != null) {
          row[outlierKey] = +v.toFixed(4);
        }
      }

      seriesKeys.push({
        rawKey, smoothKey, outlierKey,
        color: run.color,
        label: run.runId,
        hasSmoothed,
      });
    }

    // Sort rows by timestamp so the line draws in time order
    const chartData = Array.from(rowMap.values()).sort((a, b) => a.t - b.t);
    return { chartData, seriesKeys, tFirst, tLast };
  }, [selected]);

  if (selected.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs">
        Select runs in the Runs tab to view the anomaly plot.
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs">
        Selected run(s) have no plottable anomaly data.
      </div>
    );
  }

  // Pick a tick formatter based on total span — short spans show seconds,
  // long spans show date.
  const spanSec = (tLast - tFirst) / 1000;
  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    if (spanSec < 600)         return d.toLocaleTimeString(undefined, { hour12: false }); // < 10 min: HH:MM:SS
    if (spanSec < 24 * 3600)   return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
  };
  const fmtTooltipTime = (ms: any) => new Date(ms).toLocaleString(undefined, { hour12: false });

  return (
    <div className="w-full h-full px-2 py-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={fmtTime}
            tick={{ fontSize: 9 }}
            label={{ value: 'time', position: 'insideBottomRight', offset: -4, fontSize: 9 }}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            tickFormatter={v => `${v}`}
            label={{ value: 'mGal', angle: -90, position: 'insideLeft', offset: 8, fontSize: 9 }}
          />
          <Tooltip
            labelFormatter={fmtTooltipTime}
            formatter={(value: any, name: string) => {
              const kind = name.includes('smooth') ? 'smoothed'
                        : name.includes('outlier') ? 'outlier'
                        : 'raw';
              return [`${value} mGal`, kind];
            }}
            contentStyle={{ fontSize: 10 }}
          />
          {selected.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />}

          {seriesKeys.map(({ rawKey, smoothKey, outlierKey, color, label, hasSmoothed }) => (
            <Fragment key={rawKey}>
              {/* Raw anomaly line (anomaly_final_mgal → anomalyValue on client) */}
              <Line
                type="monotone"
                dataKey={rawKey}
                stroke={color}
                strokeWidth={1.2}
                dot={false}
                connectNulls={false}
                name={`${label} (final)`}
                isAnimationActive={false}
              />
              {/* Smoothed line — only rendered when present */}
              {hasSmoothed && (
                <Line
                  type="monotone"
                  dataKey={smoothKey}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  connectNulls={false}
                  name={`${label} (smoothed)`}
                  isAnimationActive={false}
                />
              )}
              {/* Outliers — red dots overlaid on the raw line */}
              <Scatter
                dataKey={outlierKey}
                fill="#dc2626"
                stroke="#dc2626"
                shape="circle"
                name={`${label} outlier`}
                isAnimationActive={false}
              />
            </Fragment>
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AnomalyPlot;
