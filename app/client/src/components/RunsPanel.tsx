import { useRef, type FC, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Upload, Database, Trash2, CheckSquare, Square, Loader2, AlertCircle, CheckCircle2, FlaskConical } from "lucide-react";
import { ExperimentRun, Experiment } from "@/lib/types";

export type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

interface RunsPanelProps {
  runs: ExperimentRun[];
  selectedRunIds: string[];
  onToggleVisibility: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onLoadMockData: () => void;
  onUploadCSV: (file: File) => void;
  onDeleteRun: (id: string) => void;
  uploadState?: UploadState;
  uploadError?: string;
  experiments?: Experiment[];
  onAssignRunToExperiment?: (runId: string, experimentId: string | null) => void;
  onCreateExperimentForRun?: (runId: string) => void;
}

const modeLabel: Record<string, string> = {
  live: "Live", simulated: "Sim", uploaded: "CSV",
};
const modeBadge: Record<string, string> = {
  live: "bg-green-100 text-green-800",
  simulated: "bg-blue-100 text-blue-800",
  uploaded: "bg-purple-100 text-purple-800",
};

const RunsPanel: FC<RunsPanelProps> = ({
  runs, selectedRunIds,
  onToggleVisibility, onToggleSelect,
  onLoadMockData, onUploadCSV, onDeleteRun,
  uploadState = "idle", uploadError,
  experiments = [], onAssignRunToExperiment, onCreateExperimentForRun,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = uploadState === "uploading" || uploadState === "processing";

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadCSV(file);
    e.target.value = "";
  };

  function fmt(d: Date): string {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function duration(r: ExperimentRun): string {
    if (!r.endTime) return "—";
    const s = (r.endTime.getTime() - r.startTime.getTime()) / 1000;
    if (s < 60) return `${s.toFixed(0)} s`;
    return `${(s / 60).toFixed(1)} min`;
  }

  const uploadLabel = {
    idle:       "Upload CSV log",
    uploading:  "Uploading…",
    processing: "Running pipeline…",
    done:       "Loaded",
    error:      "Upload failed",
  }[uploadState];

  return (
    <div className="flex flex-col h-full">
      {/* Action buttons */}
      <div className="p-3 space-y-2 border-b border-gray-100">
        <Button
          variant="outline" size="sm"
          className="w-full justify-start text-xs"
          onClick={onLoadMockData}
        >
          <Database className="mr-2 h-3.5 w-3.5 text-blue-500" />
          Load sample data
        </Button>

        <Button
          variant="outline" size="sm"
          className={`w-full justify-start text-xs ${uploadState === "error" ? "border-red-300 text-red-600" : ""} ${uploadState === "done" ? "border-green-300 text-green-600" : ""}`}
          onClick={() => !busy && fileRef.current?.click()}
          disabled={busy}
        >
          {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {!busy && uploadState === "done"  && <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-green-500" />}
          {!busy && uploadState === "error" && <AlertCircle className="mr-2 h-3.5 w-3.5 text-red-500" />}
          {!busy && uploadState === "idle"  && <Upload className="mr-2 h-3.5 w-3.5 text-purple-500" />}
          {uploadLabel}
        </Button>
        <input
          ref={fileRef} type="file" accept=".csv"
          className="hidden" onChange={handleFileChange}
        />

        {/* Processing status strip */}
        {busy && (
          <div className="flex items-center gap-1.5 text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1.5">
            <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
            <span>
              {uploadState === "uploading"
                ? "Sending file to server…"
                : "Running Python gravity pipeline — this may take a few seconds…"}
            </span>
          </div>
        )}

        {/* Error message */}
        {uploadState === "error" && uploadError && (
          <div className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1.5 leading-relaxed">
            {uploadError}
          </div>
        )}

        {/* Source badge shown after success */}
        {uploadState === "done" && (
          <div className="text-[10px] text-green-700 bg-green-50 rounded px-2 py-1.5">
            Run added — check the list below.
          </div>
        )}
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
          const isBusy = run.id.startsWith("pending-");
          return (
            <div
              key={run.id}
              className={`px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${isSelected ? "bg-blue-50" : ""} ${isBusy ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: run.color }} />
                <button
                  className="flex-shrink-0 text-gray-400 hover:text-blue-600"
                  onClick={() => onToggleSelect(run.id)}
                  title={isSelected ? "Deselect" : "Select for analysis"}
                >
                  {isSelected
                    ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                    : <Square className="h-3.5 w-3.5" />}
                </button>
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{run.experimentId}</Badge>
                <Badge className={`text-[10px] px-1 py-0 h-4 ${modeBadge[run.mode]}`}>{modeLabel[run.mode]}</Badge>
                {run.mode === "uploaded" && (
                  <Badge className="text-[10px] px-1 py-0 h-4 bg-gray-100 text-gray-500">
                    {(run as any).processingSource === "raw" ? "pipeline" : "direct"}
                  </Badge>
                )}
                <div className="flex-1" />
                <button
                  className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                  onClick={() => onToggleVisibility(run.id)}
                  title={run.visible ? "Hide on map" : "Show on map"}
                >
                  {run.visible
                    ? <Eye className="h-3.5 w-3.5" />
                    : <EyeOff className="h-3.5 w-3.5 text-gray-300" />}
                </button>
                <button
                  className="text-gray-300 hover:text-red-500 flex-shrink-0"
                  onClick={() => onDeleteRun(run.id)}
                  title="Remove run"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-[10px] text-gray-500 pl-7 leading-relaxed">
                <span className="font-mono truncate block">{run.runId}</span>
                <span>{fmt(run.startTime)} · {duration(run)} · {run.points.length} pts</span>
                {run.notes && <span className="block text-gray-400 truncate">{run.notes}</span>}

                {/* Experiment assignment (only when handler provided) */}
                {onAssignRunToExperiment && (
                  <div className="flex items-center gap-1 mt-1">
                    <FlaskConical className="h-2.5 w-2.5 text-purple-400 flex-shrink-0" />
                    <select
                      className="text-[10px] bg-gray-50 border border-gray-200 rounded px-1 py-0.5 flex-1 min-w-0 truncate"
                      value={run.parentExperimentId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__new__') {
                          onCreateExperimentForRun?.(run.id);
                        } else {
                          onAssignRunToExperiment(run.id, v || null);
                        }
                      }}
                      title="Assign to experiment"
                    >
                      <option value="">— Unassigned —</option>
                      {experiments.map(exp => (
                        <option key={exp.id} value={exp.id}>{exp.name}</option>
                      ))}
                      <option value="__new__">+ New experiment…</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedRunIds.length > 0 && (
        <div className="p-2 border-t border-gray-100 bg-blue-50 text-center text-xs text-blue-700">
          {selectedRunIds.length} run{selectedRunIds.length > 1 ? "s" : ""} selected · see Stats &amp; Plot tabs
        </div>
      )}
    </div>
  );
};

export default RunsPanel;
