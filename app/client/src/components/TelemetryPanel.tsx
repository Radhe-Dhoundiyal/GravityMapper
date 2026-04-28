import { useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import {
  Activity, Wifi, WifiOff, Radio, Satellite, Compass, Gauge, Mountain,
  Thermometer, Navigation2, MapPin, Circle, Square, FlaskConical,
  AlertTriangle, CheckCircle2, Play, StopCircle, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SensorDataPoint, ExperimentRun, Experiment, ConnectionStatus, ConnectionSettings, ExperimentType,
} from "@/lib/types";

export interface RecordingMeta {
  runId?: string;
  experimentType: ExperimentType | string;
  parentExperimentId?: string | null;
  notes?: string;
}

interface TelemetryPanelProps {
  latestPoint:        SensorDataPoint | null;
  activeRun:          ExperimentRun | null;
  assignedExperiment: Experiment | null;
  connectionStatus:   ConnectionStatus;
  connectionSettings: ConnectionSettings;
  isStreaming:        boolean;
  recentPoints:       SensorDataPoint[];   // last N points for rate estimation
  experiments:        Experiment[];
  onStartRecording:   (meta: RecordingMeta) => void;
  onStopRecording:    () => void;
}

const EXP_TYPES: (ExperimentType | 'Custom')[] = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'CAL', 'Custom'];

const fmtElapsed = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

const autoRunId = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `live_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

// ── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number | undefined | null, digits = 2, unit = ''): string => {
  if (n === undefined || n === null || !isFinite(n)) return '—';
  return `${n.toFixed(digits)}${unit ? ' ' + unit : ''}`;
};

const fmtTimeAgo = (ts: Date | null): string => {
  if (!ts) return '—';
  const ms = Date.now() - ts.getTime();
  if (ms < 0)    return 'now';
  if (ms < 1000) return `${ms}ms ago`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s ago`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3600_000)}h ago`;
};

/** Estimate samples-per-second from the most recent timestamps. */
function estimateSampleRate(points: SensorDataPoint[]): number | null {
  if (points.length < 2) return null;
  const tail = points.slice(-12);
  const t0 = tail[0].timestamp instanceof Date ? tail[0].timestamp.getTime() : new Date(tail[0].timestamp).getTime();
  const tN = tail[tail.length - 1].timestamp instanceof Date
    ? tail[tail.length - 1].timestamp.getTime()
    : new Date(tail[tail.length - 1].timestamp).getTime();
  const span = (tN - t0) / 1000;
  if (span <= 0) return null;
  return (tail.length - 1) / span;
}

// ── small UI primitives ─────────────────────────────────────────────────────
const Pill: FC<{ tone?: 'good' | 'warn' | 'bad' | 'muted' | 'info'; icon?: ReactNode; children: ReactNode }> = ({
  tone = 'muted', icon, children,
}) => {
  const tones = {
    good:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn:  'bg-amber-50   text-amber-700   border-amber-200',
    bad:   'bg-red-50     text-red-700     border-red-200',
    muted: 'bg-gray-50    text-gray-600    border-gray-200',
    info:  'bg-blue-50    text-blue-700    border-blue-200',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border rounded ${tones[tone]}`}>
      {icon}{children}
    </span>
  );
};

const TCard: FC<{ label: string; value: ReactNode; unit?: string; icon?: ReactNode; tone?: 'normal' | 'accent' | 'warn'; }> = ({
  label, value, unit, icon, tone = 'normal',
}) => {
  const valueColor =
    tone === 'accent' ? 'text-blue-700' :
    tone === 'warn'   ? 'text-amber-700' :
    'text-gray-800';
  return (
    <div className="bg-white border border-gray-200 rounded px-1.5 py-1 min-w-[78px] flex flex-col justify-between">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-gray-400">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className={`text-[11px] font-mono font-semibold leading-tight ${valueColor}`}>
        {value}{unit && <span className="text-[9px] text-gray-400 font-normal ml-0.5">{unit}</span>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const TelemetryPanel: FC<TelemetryPanelProps> = ({
  latestPoint, activeRun, assignedExperiment,
  connectionStatus, connectionSettings, isStreaming, recentPoints,
  experiments, onStartRecording, onStopRecording,
}) => {
  const p = latestPoint;
  const sampleRate = useMemo(() => estimateSampleRate(recentPoints), [recentPoints]);
  const lastSeen   = p?.timestamp ? (p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp)) : null;

  // ── Recording form state ──────────────────────────────────────────────────
  const [showForm,    setShowForm]    = useState(false);
  const [formRunId,   setFormRunId]   = useState('');
  const [formExpType, setFormExpType] = useState<string>('CAL');
  const [formCustom,  setFormCustom]  = useState('');
  const [formExpId,   setFormExpId]   = useState<string>('');
  const [formNotes,   setFormNotes]   = useState('');

  // ── 1Hz tick for elapsed timer (only while recording) ─────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isStreaming || !activeRun) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isStreaming, activeRun]);

  const elapsedSec = activeRun
    ? (Date.now() - (activeRun.startTime instanceof Date ? activeRun.startTime.getTime() : new Date(activeRun.startTime).getTime())) / 1000
    : 0;
  void tick; // dependency to force re-render

  const submitStart = () => {
    const type = formExpType === 'Custom' ? (formCustom.trim() || 'Custom') : formExpType;
    onStartRecording({
      runId: formRunId.trim() || undefined,
      experimentType: type,
      parentExperimentId: formExpId || null,
      notes: formNotes.trim() || undefined,
    });
    setShowForm(false);
    // Reset for next session
    setFormRunId(''); setFormCustom(''); setFormNotes('');
  };

  const quickStart = () => {
    onStartRecording({
      runId: autoRunId(),
      experimentType: 'CAL',
      parentExperimentId: null,
      notes: 'Quick recording',
    });
  };

  // ── Sensor health (inferred from latest packet) ─────────────────────────────
  const imuOK   = !!p && (p.ax !== undefined || p.ay !== undefined || p.az !== undefined ||
                          p.gx !== undefined || p.gy !== undefined || p.gz !== undefined);
  const baroOK  = !!p && (p.pressure !== undefined || p.altitude !== undefined);
  const gpsFix  = !!p && (p.fixQuality !== undefined ? p.fixQuality > 0
                          : (p.satellites !== undefined ? p.satellites >= 4
                          : (isFinite(p.latitude) && isFinite(p.longitude) && (p.latitude !== 0 || p.longitude !== 0))));

  // ── Status derivations ──────────────────────────────────────────────────────
  const connTone: 'good' | 'warn' | 'bad' =
    connectionStatus === 'connected'  ? 'good' :
    connectionStatus === 'simulation' ? 'warn' : 'bad';

  const sourceMode = activeRun?.mode ?? null;
  const displayDeviceId = p?.device_id || 'unknown';
  const displayExperimentId = p?.experiment_id || 'unassigned';
  const displayRunId = p?.run_id || 'none';
  const processingSource: string =
    activeRun?.processingSource ? activeRun.processingSource :
    activeRun?.mode === 'live'      ? 'live' :
    activeRun?.mode === 'simulated' ? 'sim'  : '—';

  // ── Empty state (no active stream and no data) ──────────────────────────────
  const hasAnyContext = !!p || !!activeRun || isStreaming;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-gray-50 to-white">
      {/* ── Top bar: status & operator summary ──────────────────────────────── */}
      <div className="px-2 py-1.5 border-b border-gray-200 bg-white flex flex-wrap items-center gap-1.5">
        {/* Connection */}
        <Pill
          tone={connTone}
          icon={connectionStatus === 'connected' ? <Wifi className="h-2.5 w-2.5" />
                : connectionStatus === 'simulation' ? <Radio className="h-2.5 w-2.5" />
                : <WifiOff className="h-2.5 w-2.5" />}
        >
          {connectionStatus.toUpperCase()}
        </Pill>

        {/* Streaming */}
        <Pill tone={isStreaming ? 'good' : 'muted'} icon={isStreaming ? <Circle className="h-2 w-2 fill-current animate-pulse" /> : <Square className="h-2 w-2" />}>
          {isStreaming ? 'STREAMING' : 'IDLE'}
        </Pill>

        {/* Recording state — now real */}
        {isStreaming && activeRun ? (
          <Pill tone="bad" icon={<Circle className="h-2 w-2 fill-current animate-pulse" />}>
            REC&nbsp;{fmtElapsed(elapsedSec)}
          </Pill>
        ) : (
          <Pill tone="muted" icon={<Circle className="h-2 w-2" />}>
            REC&nbsp;OFF
          </Pill>
        )}

        {/* Source mode */}
        {sourceMode && (
          <Pill tone={sourceMode === 'live' ? 'good' : sourceMode === 'simulated' ? 'warn' : 'info'}>
            SRC: {sourceMode.toUpperCase()}
          </Pill>
        )}

        {/* Processing source */}
        <Pill tone="muted">PROC: {processingSource}</Pill>

        {/* Sample rate */}
        {sampleRate !== null && (
          <Pill tone="info" icon={<Activity className="h-2.5 w-2.5" />}>
            {sampleRate.toFixed(1)} Hz
          </Pill>
        )}

        {/* Last packet */}
        <Pill tone="muted">last: {fmtTimeAgo(lastSeen)}</Pill>

        <div className="flex-1" />

        {/* Health badges */}
        <Pill tone={imuOK ? 'good' : 'bad'} icon={imuOK ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}>
          IMU
        </Pill>
        <Pill tone={gpsFix ? 'good' : 'bad'} icon={<Satellite className="h-2.5 w-2.5" />}>
          GPS {gpsFix ? 'FIX' : 'NO FIX'}
        </Pill>
        <Pill tone={baroOK ? 'good' : 'bad'} icon={<Gauge className="h-2.5 w-2.5" />}>
          BARO
        </Pill>
      </div>

      {/* ── Recording controls ───────────────────────────────────────────────── */}
      <div className="px-2 py-1.5 bg-slate-50 border-b border-gray-200">
        {isStreaming && activeRun ? (
          // ── Recording: stop button + duration ───────────────────────────────
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={onStopRecording}
            >
              <StopCircle className="h-3.5 w-3.5 mr-1" /> Stop Run
            </Button>
            <div className="text-[11px] font-mono text-red-700 flex items-center gap-1">
              <Circle className="h-2 w-2 fill-current animate-pulse" />
              <span>RECORDING · {fmtElapsed(elapsedSec)}</span>
              <span className="text-gray-400">· {activeRun.points.length} pts</span>
            </div>
          </div>
        ) : connectionStatus === 'disconnected' ? (
          // ── Disconnected: locked ────────────────────────────────────────────
          <div className="text-[11px] text-gray-400 italic px-1">
            Connect from the side panel to enable recording.
          </div>
        ) : !showForm ? (
          // ── Ready to record: quick + configure buttons ──────────────────────
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={quickStart}
            >
              <Play className="h-3.5 w-3.5 mr-1" /> Start Run
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs"
              onClick={() => { setFormRunId(autoRunId()); setShowForm(true); }}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1" /> Configure…
            </Button>
            <span className="text-[10px] text-gray-500 ml-auto">Captures incoming telemetry into a new run</span>
          </div>
        ) : (
          // ── Configure form ──────────────────────────────────────────────────
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[9px] text-gray-500 uppercase tracking-wide">Run ID</Label>
                <Input
                  value={formRunId} onChange={e => setFormRunId(e.target.value)}
                  className="text-[11px] h-6 font-mono mt-0.5"
                  placeholder="auto"
                />
              </div>
              <div>
                <Label className="text-[9px] text-gray-500 uppercase tracking-wide">Experiment type</Label>
                <Select value={formExpType} onValueChange={setFormExpType}>
                  <SelectTrigger className="text-[11px] h-6 mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXP_TYPES.map(t => <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {formExpType === 'Custom' && (
                <div className="col-span-2">
                  <Label className="text-[9px] text-gray-500 uppercase tracking-wide">Custom type</Label>
                  <Input
                    value={formCustom} onChange={e => setFormCustom(e.target.value)}
                    className="text-[11px] h-6 mt-0.5"
                    placeholder="e.g. CAL-LAB"
                  />
                </div>
              )}
              <div className="col-span-2">
                <Label className="text-[9px] text-gray-500 uppercase tracking-wide">Assign to experiment</Label>
                <Select value={formExpId || 'none'} onValueChange={v => setFormExpId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="text-[11px] h-6 mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-[11px]">— Unassigned —</SelectItem>
                    {experiments.map(e => (
                      <SelectItem key={e.id} value={e.id} className="text-[11px]">{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-[9px] text-gray-500 uppercase tracking-wide">Notes</Label>
                <Textarea
                  value={formNotes} onChange={e => setFormNotes(e.target.value)}
                  className="text-[11px] min-h-[36px] mt-0.5"
                  placeholder="Optional…" rows={2}
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={submitStart}>
                <Play className="h-3.5 w-3.5 mr-1" /> Start Recording
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Operator summary strip ───────────────────────────────────────────── */}
      <div className="px-2 py-1 bg-gray-50/70 border-b border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="text-gray-400 uppercase tracking-wide">Device:</span>
          <span className="font-mono text-gray-800">{displayDeviceId}</span>
        </div>
        <div className="flex items-center gap-1">
          <FlaskConical className="h-2.5 w-2.5 text-purple-400" />
          <span className="text-gray-400 uppercase tracking-wide">Experiment:</span>
          <span className="font-mono text-gray-800">{displayExperimentId}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400 uppercase tracking-wide">Run:</span>
          <span className="font-mono text-gray-800">{displayRunId}</span>
          {activeRun && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeRun.color }} />}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400 uppercase tracking-wide">Mode:</span>
          <span className="text-gray-800 capitalize">{connectionSettings.connectionType}</span>
        </div>
        {activeRun && (
          <div className="flex items-center gap-1">
            <span className="text-gray-400 uppercase tracking-wide">Pts:</span>
            <span className="font-mono text-gray-800">{activeRun.points.length}</span>
          </div>
        )}
      </div>

      {/* ── Telemetry value grid ─────────────────────────────────────────────── */}
      {!hasAnyContext ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-xs gap-1">
          <Radio className="h-6 w-6 text-gray-300" />
          Awaiting telemetry — connect or start simulation.
        </div>
      ) : (
        <div className="p-2 space-y-2">
          {/* Anomaly group — primary scientific signal */}
          <div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-1 px-0.5">Anomaly</div>
            <div className="grid grid-cols-3 gap-1.5">
              <TCard
                label="anomaly"
                value={fmt(p?.anomalyValue, 3)}
                unit="mGal"
                tone="accent"
                icon={<Activity className="h-2.5 w-2.5" />}
              />
              <TCard
                label="smoothed"
                value={fmt(p?.anomalySmoothed, 3)}
                unit="mGal"
                tone="accent"
              />
              <TCard
                label="stationary"
                value={p?.platformStationary === undefined ? '—'
                       : p.platformStationary ? 'YES' : 'NO'}
                tone={p?.platformStationary ? 'normal' : 'warn'}
              />
            </div>
          </div>

          {/* IMU group */}
          <div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-1 px-0.5 flex items-center gap-1">
              <Compass className="h-2.5 w-2.5" /> IMU
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              <TCard label="ax" value={fmt(p?.ax, 3)} unit="g" />
              <TCard label="ay" value={fmt(p?.ay, 3)} unit="g" />
              <TCard label="az" value={fmt(p?.az, 3)} unit="g" />
              <TCard label="gx" value={fmt(p?.gx, 2)} unit="°/s" />
              <TCard label="gy" value={fmt(p?.gy, 2)} unit="°/s" />
              <TCard label="gz" value={fmt(p?.gz, 2)} unit="°/s" />
            </div>
          </div>

          {/* Barometer + environment */}
          <div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-1 px-0.5 flex items-center gap-1">
              <Mountain className="h-2.5 w-2.5" /> Environment
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <TCard label="pressure"    value={fmt(p?.pressure,    1)} unit="hPa" icon={<Gauge className="h-2.5 w-2.5" />} />
              <TCard label="temperature" value={fmt(p?.temperature, 1)} unit="°C"  icon={<Thermometer className="h-2.5 w-2.5" />} />
              <TCard label="altitude"    value={fmt(p?.altitude,    1)} unit="m"   icon={<Mountain className="h-2.5 w-2.5" />} />
            </div>
          </div>

          {/* GNSS group */}
          <div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-1 px-0.5 flex items-center gap-1">
              <Satellite className="h-2.5 w-2.5" /> GNSS
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              <TCard label="lat"   value={fmt(p?.latitude,  5)} unit="°"   icon={<MapPin className="h-2.5 w-2.5" />} />
              <TCard label="lng"   value={fmt(p?.longitude, 5)} unit="°"   icon={<MapPin className="h-2.5 w-2.5" />} />
              <TCard label="speed" value={fmt(p?.speed, 2)}     unit="m/s" icon={<Navigation2 className="h-2.5 w-2.5" />} />
              <TCard label="hdop"  value={fmt(p?.hdop, 2)} tone={p?.hdop !== undefined && p.hdop > 5 ? 'warn' : 'normal'} />
              <TCard label="sats"  value={p?.satellites ?? '—'} tone={p?.satellites !== undefined && p.satellites < 4 ? 'warn' : 'normal'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TelemetryPanel;
