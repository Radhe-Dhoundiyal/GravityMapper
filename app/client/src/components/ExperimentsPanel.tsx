import { useState, useMemo, type FC } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FlaskConical, Plus, ArrowLeft, Trash2, Eye, EyeOff,
  CheckSquare, Square, X, Calendar,
} from "lucide-react";
import { Experiment, ExperimentRun, ExperimentType } from "@/lib/types";
import { computeExperimentSummary, runsForExperiment } from "@/lib/experimentStatistics";
import { fmtNum, formatDuration } from "@/lib/runStatistics";

interface ExperimentsPanelProps {
  experiments:           Experiment[];
  runs:                  ExperimentRun[];
  selectedExperimentId:  string | null;
  selectedRunIds:        string[];
  onSelectExperiment:    (id: string | null) => void;
  onCreateExperiment:    (data: { name: string; experimentType: string; description: string }) => void;
  onUpdateExperimentMetadata: (id: string, metadata: Pick<Experiment, 'location' | 'operator' | 'description' | 'grid_spacing' | 'sensor_configuration' | 'notes'>) => void;
  onDeleteExperiment:    (id: string) => void;
  onAssignRunToExperiment: (runId: string, experimentId: string | null) => void;
  onUpdateRunMetadata: (id: string, metadata: Pick<ExperimentRun, 'location' | 'notes' | 'processing_status'>) => void;
  onToggleRunVisibility: (id: string) => void;
  onToggleRunSelect:     (id: string) => void;
}

const EXP_TYPES: (ExperimentType | 'Custom')[] = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'CAL', 'Custom'];

const ExperimentsPanel: FC<ExperimentsPanelProps> = ({
  experiments, runs, selectedExperimentId, selectedRunIds,
  onSelectExperiment, onCreateExperiment, onUpdateExperimentMetadata, onDeleteExperiment,
  onAssignRunToExperiment, onUpdateRunMetadata, onToggleRunVisibility, onToggleRunSelect,
}) => {
  const [showForm, setShowForm]      = useState(false);
  const [formName, setFormName]      = useState('');
  const [formType, setFormType]      = useState<string>('E1');
  const [formCustom, setFormCustom]  = useState('');
  const [formDesc, setFormDesc]      = useState('');

  const selected = useMemo(
    () => experiments.find(e => e.id === selectedExperimentId) ?? null,
    [experiments, selectedExperimentId],
  );

  const submitForm = () => {
    const trimmed = formName.trim();
    if (!trimmed) return;
    const type = formType === 'Custom' ? (formCustom.trim() || 'Custom') : formType;
    onCreateExperiment({
      name: trimmed,
      experimentType: type,
      description: formDesc.trim(),
    });
    setFormName(''); setFormCustom(''); setFormDesc(''); setFormType('E1');
    setShowForm(false);
  };

  // ── Detail view (single experiment selected) ────────────────────────────────
  if (selected) {
    const summary = computeExperimentSummary(selected, runs);
    const expRuns = runsForExperiment(selected, runs);

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1.5">
            <button
              className="text-gray-500 hover:text-gray-800"
              onClick={() => onSelectExperiment(null)}
              title="Back to list"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <FlaskConical className="h-3.5 w-3.5 text-purple-500" />
            <span className="text-xs font-medium truncate flex-1">{selected.name}</span>
            <button
              className="text-gray-300 hover:text-red-500"
              onClick={() => {
                if (confirm(`Delete experiment "${selected.name}"? Runs will become unassigned but kept.`)) {
                  onDeleteExperiment(selected.id);
                }
              }}
              title="Delete experiment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 items-center">
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{selected.experimentType}</Badge>
            <Badge className="text-[10px] px-1 py-0 h-4 bg-gray-100 text-gray-600 font-mono">{selected.experimentId}</Badge>
            <span className="text-[10px] text-gray-500 ml-auto flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {selected.createdAt.toLocaleDateString()}
            </span>
          </div>
          {selected.description && (
            <div className="text-[10px] text-gray-500 mt-1 italic">{selected.description}</div>
          )}
        </div>

        {/* Summary */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Aggregate summary</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'Runs',          value: String(summary.numRuns) },
              { label: 'Total samples', value: String(summary.totalSamples) },
              { label: 'Mean anomaly',  value: `${fmtNum(summary.meanAnomaly, 2)} mGal` },
              { label: 'Mean σ',        value: `${fmtNum(summary.meanStd,     2)} mGal` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded p-1.5">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</div>
                <div className="text-xs font-mono font-medium text-gray-800 mt-0.5 truncate">{value}</div>
              </div>
            ))}
            <div className="bg-gray-50 rounded p-1.5 col-span-2">
              <div className="text-[9px] text-gray-400 uppercase tracking-wide">Time span</div>
              <div className="text-[10px] font-mono text-gray-800 mt-0.5 truncate">
                {summary.earliestTimestamp ? summary.earliestTimestamp.toLocaleString() : '—'}
                <span className="text-gray-400"> → </span>
                {summary.latestTimestamp ? summary.latestTimestamp.toLocaleString() : '—'}
              </div>
              {summary.earliestTimestamp && summary.latestTimestamp && (
                <div className="text-[10px] text-gray-500 mt-0.5">
                  Span: {formatDuration((summary.latestTimestamp.getTime() - summary.earliestTimestamp.getTime()) / 1000)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Experiment details */}
        <div className="px-3 py-2 border-b border-gray-100 space-y-2">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Experiment details</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-gray-500">Location</Label>
              <Input
                value={selected.location}
                onChange={e => onUpdateExperimentMetadata(selected.id, { ...selected, location: e.target.value })}
                className="text-xs h-7 mt-0.5"
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Operator</Label>
              <Input
                value={selected.operator}
                onChange={e => onUpdateExperimentMetadata(selected.id, { ...selected, operator: e.target.value })}
                className="text-xs h-7 mt-0.5"
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Grid spacing</Label>
              <Input
                value={selected.grid_spacing}
                onChange={e => onUpdateExperimentMetadata(selected.id, { ...selected, grid_spacing: e.target.value })}
                placeholder="e.g. 10 m"
                className="text-xs h-7 mt-0.5"
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Sensor config</Label>
              <Input
                value={selected.sensor_configuration}
                onChange={e => onUpdateExperimentMetadata(selected.id, { ...selected, sensor_configuration: e.target.value })}
                placeholder="e.g. MPU6050 + BMP280"
                className="text-xs h-7 mt-0.5"
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">Description</Label>
            <Textarea
              value={selected.description}
              onChange={e => onUpdateExperimentMetadata(selected.id, { ...selected, description: e.target.value })}
              className="text-xs min-h-[44px] mt-0.5"
              rows={2}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">Notes</Label>
            <Textarea
              value={selected.notes}
              onChange={e => onUpdateExperimentMetadata(selected.id, { ...selected, notes: e.target.value })}
              className="text-xs min-h-[44px] mt-0.5"
              rows={2}
            />
          </div>
        </div>

        {/* Member runs */}
        <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
          Runs in this experiment ({expRuns.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {expRuns.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-xs">
              No runs yet.<br />Assign runs from the Runs tab.
            </div>
          )}
          {expRuns.map(run => {
            const isSelected = selectedRunIds.includes(run.id);
            return (
              <div
                key={run.id}
                className={`px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: run.color }} />
                  <button
                    className="flex-shrink-0 text-gray-400 hover:text-blue-600"
                    onClick={() => onToggleRunSelect(run.id)}
                    title={isSelected ? 'Deselect' : 'Select for analysis'}
                  >
                    {isSelected
                      ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                      : <Square className="h-3.5 w-3.5" />}
                  </button>
                  <span className="text-[11px] font-mono truncate flex-1">{run.runId}</span>
                  <button
                    className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                    onClick={() => onToggleRunVisibility(run.id)}
                    title={run.visible ? 'Hide on map' : 'Show on map'}
                  >
                    {run.visible
                      ? <Eye className="h-3.5 w-3.5" />
                      : <EyeOff className="h-3.5 w-3.5 text-gray-300" />}
                  </button>
                  <button
                    className="text-gray-300 hover:text-red-500 flex-shrink-0"
                    onClick={() => onAssignRunToExperiment(run.id, null)}
                    title="Remove from experiment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-[10px] text-gray-500 pl-7">
                  {run.points.length} pts · {run.experimentId}
                </div>
                <div className="grid grid-cols-2 gap-1.5 pl-7 mt-1.5">
                  <Input
                    value={run.location}
                    onChange={e => onUpdateRunMetadata(run.id, {
                      location: e.target.value,
                      notes: run.notes,
                      processing_status: run.processing_status || 'unprocessed',
                    })}
                    className="text-[10px] h-6"
                    title="Run location"
                  />
                  <Select
                    value={run.processing_status || 'unprocessed'}
                    onValueChange={(value) => onUpdateRunMetadata(run.id, {
                      location: run.location,
                      notes: run.notes,
                      processing_status: value as ExperimentRun['processing_status'],
                    })}
                  >
                    <SelectTrigger className="text-[10px] h-6"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unprocessed" className="text-xs">unprocessed</SelectItem>
                      <SelectItem value="processing" className="text-xs">processing</SelectItem>
                      <SelectItem value="processed" className="text-xs">processed</SelectItem>
                      <SelectItem value="failed" className="text-xs">failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={run.notes}
                    onChange={e => onUpdateRunMetadata(run.id, {
                      location: run.location,
                      notes: e.target.value,
                      processing_status: run.processing_status || 'unprocessed',
                    })}
                    className="text-[10px] min-h-[36px] col-span-2"
                    rows={2}
                    title="Run notes"
                  />
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
  }

  // ── List view (no experiment selected) ──────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        {!showForm ? (
          <Button
            variant="outline" size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setShowForm(true)}
          >
            <Plus className="mr-2 h-3.5 w-3.5 text-purple-500" />
            New experiment
          </Button>
        ) : (
          <div className="space-y-2">
            <div>
              <Label className="text-[10px] text-gray-500">Name *</Label>
              <Input
                value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="e.g. April 2025 lab calibration"
                className="text-xs h-7 mt-0.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-gray-500">Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="text-xs h-7 mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXP_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {formType === 'Custom' && (
                <div>
                  <Label className="text-[10px] text-gray-500">Custom type</Label>
                  <Input
                    value={formCustom} onChange={e => setFormCustom(e.target.value)}
                    placeholder="e.g. CAL-2025"
                    className="text-xs h-7 mt-0.5"
                  />
                </div>
              )}
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Description</Label>
              <Textarea
                value={formDesc} onChange={e => setFormDesc(e.target.value)}
                placeholder="Optional notes…"
                className="text-xs min-h-[40px] mt-0.5"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="text-xs flex-1" onClick={submitForm} disabled={!formName.trim()}>
                Create
              </Button>
              <Button
                variant="outline" size="sm" className="text-xs flex-1"
                onClick={() => { setShowForm(false); setFormName(''); setFormCustom(''); setFormDesc(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {experiments.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-xs mt-4">
            No experiments yet.<br />Click <span className="font-medium">New experiment</span> to create one.
          </div>
        )}
        {experiments.map(exp => {
          const summary = computeExperimentSummary(exp, runs);
          return (
            <button
              key={exp.id}
              className="w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors"
              onClick={() => onSelectExperiment(exp.id)}
            >
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{exp.name}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{exp.experimentType}</Badge>
              </div>
              <div className="text-[10px] text-gray-500 pl-5 flex items-center gap-2 flex-wrap">
                <span>{summary.numRuns} run{summary.numRuns === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{summary.totalSamples} pts</span>
                {isFinite(summary.meanAnomaly) && (
                  <>
                    <span>·</span>
                    <span>μ {fmtNum(summary.meanAnomaly, 1)} mGal</span>
                  </>
                )}
              </div>
              {exp.description && (
                <div className="text-[10px] text-gray-400 pl-5 truncate italic">{exp.description}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ExperimentsPanel;
