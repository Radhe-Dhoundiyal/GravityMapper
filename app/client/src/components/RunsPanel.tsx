import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Upload, Database, Trash2, CheckSquare, Square } from "lucide-react";
import { ExperimentRun } from "@/lib/types";

interface RunsPanelProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
  onToggleVisibility: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onLoadMockData: () => void;
  onUploadCSV: (file: File) => void;
  onDeleteRun: (id: string) => void;
}

const modeLabel: Record<string, string> = {
  live: 'Live',
  simulated: 'Sim',
  uploaded: 'CSV',
};

const modeBadge: Record<string, string> = {
  live: 'bg-green-100 text-green-800',
  simulated: 'bg-blue-100 text-blue-800',
  uploaded: 'bg-purple-100 text-purple-800',
};

const RunsPanel: React.FC<RunsPanelProps> = ({
  runs,
  selectedRunIds,
  onToggleVisibility,
  onToggleSelect,
  onLoadMockData,
  onUploadCSV,
  onDeleteRun,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadCSV(file);
    e.target.value = '';
  };

  function fmt(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function duration(r: ExperimentRun): string {
    if (!r.endTime) return '—';
    const s = (r.endTime.getTime() - r.startTime.getTime()) / 1000;
    if (s < 60) return `${s.toFixed(0)} s`;
    return `${(s / 60).toFixed(1)} min`;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Action buttons */}
      <div className="p-3 space-y-2 border-b border-gray-100">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={onLoadMockData}
        >
          <Database className="mr-2 h-3.5 w-3.5 text-blue-500" />
          Load sample data
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mr-2 h-3.5 w-3.5 text-purple-500" />
          Upload CSV log
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-xs mt-4">
            No runs loaded.<br />Load sample data or upload a CSV.
          </div>
        )}
        {runs.map((run) => {
          const isSelected = selectedRunIds.includes(run.id);
          return (
            <div
              key={run.id}
              className={`px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {/* Color dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: run.color }}
                />
                {/* Select checkbox */}
                <button
                  className="flex-shrink-0 text-gray-400 hover:text-blue-600"
                  onClick={() => onToggleSelect(run.id)}
                  title={isSelected ? 'Deselect run' : 'Select run for analysis'}
                >
                  {isSelected
                    ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                    : <Square className="h-3.5 w-3.5" />}
                </button>
                {/* Experiment badge */}
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                  {run.experimentId}
                </Badge>
                {/* Mode badge */}
                <Badge className={`text-[10px] px-1 py-0 h-4 ${modeBadge[run.mode]}`}>
                  {modeLabel[run.mode]}
                </Badge>
                <div className="flex-1" />
                {/* Visibility toggle */}
                <button
                  className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                  onClick={() => onToggleVisibility(run.id)}
                  title={run.visible ? 'Hide on map' : 'Show on map'}
                >
                  {run.visible
                    ? <Eye className="h-3.5 w-3.5" />
                    : <EyeOff className="h-3.5 w-3.5 text-gray-300" />}
                </button>
                {/* Delete */}
                <button
                  className="text-gray-300 hover:text-red-500 flex-shrink-0"
                  onClick={() => onDeleteRun(run.id)}
                  title="Remove run"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Run details */}
              <div className="text-[10px] text-gray-500 pl-7 leading-relaxed">
                <span className="font-mono truncate block">{run.runId}</span>
                <span>{fmt(run.startTime)} · {duration(run)} · {run.points.length} pts</span>
                {run.notes && (
                  <span className="block text-gray-400 truncate">{run.notes}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedRunIds.length > 0 && (
        <div className="p-2 border-t border-gray-100 bg-blue-50 text-center text-xs text-blue-700">
          {selectedRunIds.length} run{selectedRunIds.length > 1 ? 's' : ''} selected · see Stats &amp; Plot tabs
        </div>
      )}
    </div>
  );
};

export default RunsPanel;
