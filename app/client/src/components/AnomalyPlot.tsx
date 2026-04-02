import { useMemo, Fragment } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
  ComposedChart,
} from "recharts";
import { ExperimentRun } from "@/lib/types";

interface AnomalyPlotProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
}

const AnomalyPlot: React.FC<AnomalyPlotProps> = ({ runs, selectedRunIds }) => {
  const selected = runs.filter(r => selectedRunIds.includes(r.id));

  // Build unified chart data — one entry per sample index per run
  const { chartData, seriesKeys } = useMemo(() => {
    if (selected.length === 0) return { chartData: [], seriesKeys: [] };

    const maxLen = Math.max(...selected.map(r => r.points.length));
    const seriesKeys: { key: string; smoothKey: string; color: string; label: string }[] = [];

    const rows: any[] = Array.from({ length: maxLen }, (_, i) => ({ idx: i }));

    selected.forEach(run => {
      const baseKey  = `${run.id}_anomaly`;
      const smoothKey = `${run.id}_smooth`;
      seriesKeys.push({ key: baseKey, smoothKey, color: run.color, label: run.runId });

      run.points.forEach((p, i) => {
        if (!rows[i]) rows[i] = { idx: i };
        rows[i][baseKey]  = p.anomalyValue != null && isFinite(p.anomalyValue) ? +p.anomalyValue.toFixed(3) : null;
        if (p.anomalySmoothed != null && isFinite(p.anomalySmoothed)) {
          rows[i][smoothKey] = +p.anomalySmoothed.toFixed(3);
        }
        if (p.outlierFlag) rows[i][`${run.id}_outlier`] = rows[i][baseKey];
      });
    });

    return { chartData: rows, seriesKeys };
  }, [selected]);

  if (selected.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs">
        Select runs in the Runs tab to view the anomaly plot.
      </div>
    );
  }

  return (
    <div className="w-full h-full px-2 py-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="idx"
            tick={{ fontSize: 9 }}
            label={{ value: 'sample', position: 'insideBottomRight', offset: -4, fontSize: 9 }}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            tickFormatter={v => `${v}`}
            label={{ value: 'mGal', angle: -90, position: 'insideLeft', offset: 8, fontSize: 9 }}
          />
          <Tooltip
            formatter={(value: any, name: string) => {
              const label = name.includes('smooth') ? 'smoothed' : name.includes('outlier') ? 'outlier' : 'raw';
              return [`${value} mGal`, label];
            }}
            labelFormatter={v => `Sample ${v}`}
            contentStyle={{ fontSize: 10 }}
          />
          {selected.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />}

          {seriesKeys.map(({ key, smoothKey, color, label }) => (
            <Fragment key={key}>
              {/* Raw anomaly line */}
              <Line
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={1.2}
                dot={false}
                connectNulls={false}
                name={`${label} (raw)`}
                isAnimationActive={false}
              />
              {/* Smoothed line */}
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
              {/* Outlier scatter */}
              <Scatter
                dataKey={`${key.split('_')[0]}_outlier`}
                fill="red"
                name="outlier"
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
