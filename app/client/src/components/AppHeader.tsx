import { useEffect, useState, type FC } from "react";
import { Button } from "@/components/ui/button";
import { ChartScatter, Settings, Wifi, WifiOff, Radio, Circle, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConnectionStatus, ExperimentRun, Experiment, ConnectionSettings } from "@/lib/types";

interface AppHeaderProps {
  connectionStatus:   ConnectionStatus;
  connectionSettings: ConnectionSettings;
  isStreaming:        boolean;
  activeRun:          ExperimentRun | null;
  assignedExperiment: Experiment | null;
  onOpenSettings:     () => void;
}

const fmtClock = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const AppHeader: FC<AppHeaderProps> = ({
  connectionStatus, connectionSettings,
  isStreaming, activeRun, assignedExperiment,
  onOpenSettings,
}) => {
  // Live ticking clock
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const connBadge = (() => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 h-5">
            <Wifi className="h-2.5 w-2.5 mr-1" /> CONNECTED
          </Badge>
        );
      case 'simulation':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 h-5">
            <Radio className="h-2.5 w-2.5 mr-1" /> SIMULATION
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] px-1.5 py-0 h-5">
            <WifiOff className="h-2.5 w-2.5 mr-1" /> OFFLINE
          </Badge>
        );
    }
  })();

  return (
    <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg border-b border-slate-700 px-3 py-1.5">
      <div className="flex items-center gap-3">
        {/* Title */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ChartScatter className="h-5 w-5 text-blue-400" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">GADV INSTRUMENT CONSOLE</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-widest">Gravitational Anomaly Detection Vehicle</div>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-700 mx-1" />

        {/* Mode + connection */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {connBadge}

          <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-600 text-[10px] px-1.5 py-0 h-5">
            MODE: <span className="ml-1 font-mono uppercase">{connectionSettings.connectionType}</span>
          </Badge>

          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-5 ${
              isStreaming
                ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                : 'bg-slate-800 text-slate-400 border-slate-600'
            }`}
          >
            <Circle className={`h-2 w-2 mr-1 ${isStreaming ? 'fill-current animate-pulse' : ''}`} />
            STREAM: {isStreaming ? 'LIVE' : 'IDLE'}
          </Badge>

          {/* Active run */}
          {activeRun && (
            <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-600 text-[10px] px-1.5 py-0 h-5">
              <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: activeRun.color }} />
              RUN: <span className="ml-1 font-mono truncate max-w-[180px]">{activeRun.runId}</span>
            </Badge>
          )}

          {/* Assigned experiment */}
          {assignedExperiment && (
            <Badge variant="outline" className="bg-purple-900/30 text-purple-200 border-purple-700 text-[10px] px-1.5 py-0 h-5">
              <FlaskConical className="h-2.5 w-2.5 mr-1" />
              EXP: <span className="ml-1 truncate max-w-[140px]">{assignedExperiment.name}</span>
            </Badge>
          )}
        </div>

        <div className="flex-1" />

        {/* Local clock */}
        <div className="text-right leading-tight font-mono">
          <div className="text-sm text-slate-100">{fmtClock(now)}</div>
          <div className="text-[9px] text-slate-400 uppercase tracking-wider">{now.toLocaleDateString()}</div>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
};

export default AppHeader;
