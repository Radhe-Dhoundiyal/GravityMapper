import { ExperimentRun, SensorDataPoint } from './types';

// ── helpers ────────────────────────────────────────────────────────────────────
function rnd(mean: number, std: number): number {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeTimestamps(start: Date, n: number, intervalMs = 100): Date[] {
  return Array.from({ length: n }, (_, i) => new Date(start.getTime() + i * intervalMs));
}

// ── E1 — Stationary Noise Floor (30 pts, fixed location) ──────────────────────
function buildE1(): SensorDataPoint[] {
  const base = new Date('2025-04-01T10:00:00Z');
  const ts = makeTimestamps(base, 30, 200);
  return ts.map((t, i) => ({
    timestamp: t,
    latitude: 51.500801,
    longitude: -0.124626,
    anomalyValue: rnd(-12.4, 3.1),
    anomalySmoothed: rnd(-12.1, 1.4),
    ax: rnd(0.003, 0.001),
    ay: rnd(-0.008, 0.001),
    az: rnd(0.999, 0.001),
    gx: rnd(0.02, 0.004),
    gy: rnd(-0.019, 0.004),
    gz: rnd(0.010, 0.003),
    pressure: rnd(1013.25, 0.05),
    temperature: rnd(22.2, 0.3),
    altitude: rnd(42.3, 0.2),
    hdop: 1.2,
    satellites: 8,
    fixQuality: 1,
    platformStationary: true,
    outlierFlag: i === 7 || i === 21,
  }));
}

// ── E3 — Smooth Transect (40 pts, moving lat) ─────────────────────────────────
function buildE3(): SensorDataPoint[] {
  const base = new Date('2025-04-03T14:00:00Z');
  const n = 40;
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(base.getTime() + i * 2500),
    latitude: 51.500801 + i * 0.00008,
    longitude: -0.124626 + i * 0.00003,
    anomalyValue: rnd(-11.5 + i * 0.08, 5.5),
    anomalySmoothed: rnd(-11.5 + i * 0.08, 2.2),
    ax: rnd(0.003, 0.012),
    ay: rnd(-0.008, 0.010),
    az: rnd(0.998, 0.008),
    gx: rnd(0.02, 0.08),
    gy: rnd(-0.019, 0.07),
    gz: rnd(0.010, 0.05),
    pressure: rnd(1013.1, 0.2),
    temperature: rnd(21.8, 0.5),
    altitude: rnd(42.0, 0.5),
    hdop: rnd(1.4, 0.2),
    satellites: 7,
    fixQuality: 1,
    platformStationary: i < 5 || i > 35,
    outlierFlag: false,
  }));
}

// ── E5 run 1 — Repeatability (25 pts) ─────────────────────────────────────────
function buildE5r1(): SensorDataPoint[] {
  const base = new Date('2025-04-10T09:00:00Z');
  return makeTimestamps(base, 25, 300).map((t, i) => ({
    timestamp: t,
    latitude: 51.500801 + rnd(0, 0.000005),
    longitude: -0.124626 + rnd(0, 0.000005),
    anomalyValue: rnd(-11.1, 2.8),
    anomalySmoothed: rnd(-11.0, 1.2),
    pressure: rnd(1012.9, 0.08),
    temperature: rnd(19.5, 0.4),
    altitude: rnd(42.4, 0.3),
    hdop: 1.3,
    satellites: 8,
    fixQuality: 1,
    platformStationary: true,
    outlierFlag: i === 12,
  }));
}

// ── E5 run 2 — Repeatability (25 pts, different day) ──────────────────────────
function buildE5r2(): SensorDataPoint[] {
  const base = new Date('2025-04-11T11:30:00Z');
  return makeTimestamps(base, 25, 300).map((t, i) => ({
    timestamp: t,
    latitude: 51.500801 + rnd(0, 0.000006),
    longitude: -0.124626 + rnd(0, 0.000006),
    anomalyValue: rnd(-13.8, 3.2),
    anomalySmoothed: rnd(-13.6, 1.5),
    pressure: rnd(1014.2, 0.09),
    temperature: rnd(20.1, 0.3),
    altitude: rnd(42.2, 0.3),
    hdop: 1.1,
    satellites: 9,
    fixQuality: 1,
    platformStationary: true,
    outlierFlag: false,
  }));
}

// ── Exported mock runs ─────────────────────────────────────────────────────────
export const MOCK_RUNS: ExperimentRun[] = [
  {
    id: 'mock-e1-01',
    runId: '2025-04-01_E1_lab-bench_run01',
    experimentId: 'E1',
    mode: 'uploaded',
    startTime: new Date('2025-04-01T10:00:00Z'),
    endTime:   new Date('2025-04-01T10:00:06Z'),
    location: 'lab-bench',
    notes: 'Built-in sample data — E1 stationary noise floor',
    points: buildE1(),
    visible: true,
    color: '#3B82F6',
  },
  {
    id: 'mock-e3-01',
    runId: '2025-04-03_E3_campus-north_run01',
    experimentId: 'E3',
    mode: 'uploaded',
    startTime: new Date('2025-04-03T14:00:00Z'),
    endTime:   new Date('2025-04-03T14:01:40Z'),
    location: 'campus-north',
    notes: 'Built-in sample data — E3 smooth transect',
    points: buildE3(),
    visible: true,
    color: '#F97316',
  },
  {
    id: 'mock-e5-r1',
    runId: '2025-04-10_E5_fixed-point_run01',
    experimentId: 'E5',
    mode: 'uploaded',
    startTime: new Date('2025-04-10T09:00:00Z'),
    endTime:   new Date('2025-04-10T09:00:07.5Z'),
    location: 'fixed-point',
    notes: 'Built-in sample data — E5 repeatability run 1',
    points: buildE5r1(),
    visible: false,
    color: '#8B5CF6',
  },
  {
    id: 'mock-e5-r2',
    runId: '2025-04-11_E5_fixed-point_run02',
    experimentId: 'E5',
    mode: 'uploaded',
    startTime: new Date('2025-04-11T11:30:00Z'),
    endTime:   new Date('2025-04-11T11:30:07.5Z'),
    location: 'fixed-point',
    notes: 'Built-in sample data — E5 repeatability run 2',
    points: buildE5r2(),
    visible: false,
    color: '#10B981',
  },
];
