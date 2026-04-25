# PROJECT_CONTEXT

This file is a quick architecture handoff for future AI coding sessions working on this repository.

## Project Purpose

GADV, the Gravitational Anomaly Detection Vehicle, is a research and science-fair platform for mapping local gravity-proxy anomalies using low-cost hardware. The intended system combines:

- An ESP32-based sensor node with IMU, barometer, and GNSS inputs.
- A real-time web dashboard for map-based telemetry visualization.
- CSV import/export for field runs.
- A Python analysis pipeline that converts raw rover logs into processed anomaly estimates and run summaries.

The central scientific question is whether consumer-grade MEMS sensors can produce repeatable, geo-referenced gravity anomaly signals after filtering, tilt compensation, altitude correction, and statistical cleanup.

## Folder Structure

```text
.
├── app/
│   ├── client/          React + Vite dashboard frontend
│   ├── server/          Express backend, REST API, WebSocket bridge, CSV processing
│   └── shared/          Shared TypeScript schemas and DTO definitions
├── analysis/
│   ├── scripts/         Python processing scripts, especially gravity_pipeline.py
│   └── notebooks/       Placeholder area for exploratory Jupyter analysis
├── hardware/
│   ├── sensors/         Sensor stack notes and calibration documentation
│   ├── circuit/         ESP32 circuit/schematic documentation
│   └── rover/           Mobile platform documentation
├── data/
│   ├── raw/             Unmodified field logs and CSV template
│   └── processed/       Pipeline outputs and run_summary.csv
├── experiments/
│   ├── protocols/       Planned experiment protocols E1-E6
│   └── logs/            Field log placeholder area
├── docs/                Architecture, methodology, and system overview docs
├── paper/               Research manuscript draft
├── attached_assets/     Imported prompts/images/context from prior work
├── render.yaml          Render web service definition
├── build-render.sh      Local reproduction of the Render build
├── package.json         Root Node dependencies and scripts
├── vite.config.ts       Vite client build config and aliases
├── tsconfig.json        TypeScript config for app/client, app/server, app/shared
├── drizzle.config.ts    Drizzle config for future PostgreSQL usage
└── pyproject.toml       Python project metadata
```

## Frontend Architecture

The frontend lives in `app/client`.

Main entrypoints:

- `app/client/index.html`
- `app/client/src/main.tsx`
- `app/client/src/App.tsx`
- `app/client/src/pages/Home.tsx`

The frontend is a React single-page app built with Vite. It uses:

- `wouter` for routing.
- `@tanstack/react-query` infrastructure, though most dashboard state is local React state.
- Leaflet for map rendering in `app/client/src/components/MapView.tsx`.
- Recharts and local components for telemetry/plot/compare panels.
- A shadcn/Radix-style UI component set under `app/client/src/components/ui`.

`Home.tsx` is the main orchestration component. It owns:

- Live telemetry state.
- Run and experiment state.
- Simulation mode.
- CSV upload handling.
- Map filters and color modes.
- Export to CSV/JSON.
- WebSocket connect/disconnect and message handling.

Real-time communication is handled by `app/client/src/lib/useWebSocket.ts`. It connects to:

```text
/ws
```

using `ws://` or `wss://` depending on the page protocol.

The frontend expects live packets in this shape:

```json
{
  "type": "newAnomalyPoint",
  "data": {
    "latitude": 51.5,
    "longitude": -0.12,
    "anomalyValue": 0.85,
    "timestamp": "2026-04-25T01:00:00Z"
  }
}
```

Additional IMU, GPS quality, pressure, temperature, altitude, smoothed anomaly, and stationary fields are optional.

## Backend Architecture

The backend lives in `app/server`.

Main files:

- `app/server/index.ts`: Express app setup, request logging, error handling, dev/prod frontend serving, port binding.
- `app/server/routes.ts`: REST routes and WebSocket server.
- `app/server/storage.ts`: In-memory storage abstraction.
- `app/server/csvProcessor.ts`: CSV upload parsing and Python pipeline bridge.
- `app/server/vite.ts`: Vite dev middleware and production static serving.

The backend runs as one Node process. It serves:

- The React app in production from `dist/public`.
- API routes under `/api/*`.
- WebSocket telemetry under `/ws`.

Important REST routes:

```text
GET    /api/health
POST   /api/telemetry
GET    /api/anomaly-points
POST   /api/anomaly-points
DELETE /api/anomaly-points
POST   /api/upload-csv
```

`/api/telemetry` is an HTTP fallback for environments that cannot hold a WebSocket open. It accepts either a bare sensor payload or `{ "type": "newAnomalyPoint", "data": ... }`, validates it, and broadcasts it to connected dashboards.

`/ws` accepts messages from simulated clients, future ESP32 clients, or other telemetry producers. On `newAnomalyPoint`, the server:

1. Parses JSON.
2. Validates the rich payload using `sensorDataPointSchema` from `app/shared/schema.ts`.
3. Stores a legacy latitude/longitude/anomaly/timestamp projection in `MemStorage`.
4. Broadcasts the full rich packet to all connected WebSocket clients.

Current persistence is `MemStorage`, so server restarts wipe legacy anomaly history.

## Shared Schema Layer

Shared schemas live in `app/shared/schema.ts`.

They define:

- `users` table schema, reserved for future auth.
- `anomaly_points` table schema, a legacy 4-field anomaly store.
- `sensorDataPointSchema`, the richer live telemetry DTO used by WebSocket and `/api/telemetry`.

Drizzle and Zod are both present. The runtime app currently uses the Zod schemas and in-memory storage. PostgreSQL is not wired into the live server yet.

## Analysis Pipeline

The main analysis script is:

```text
analysis/scripts/gravity_pipeline.py
```

It processes raw CSV logs into processed CSV outputs and run summaries.

Pipeline steps include:

1. Load and validate the raw CSV schema.
2. Convert accelerometer readings from g to m/s^2.
3. Estimate pitch/roll and compute vertical acceleration.
4. Apply free-air altitude correction.
5. Apply WGS-84/Somigliana latitude correction.
6. Compute gravity anomaly proxy in mGal.
7. Filter static samples via `platform_stationary`.
8. Smooth using a moving average window.
9. Reject outliers with MAD filtering.
10. Write processed CSV and update `data/processed/run_summary.csv`.

The backend can invoke this script from `app/server/csvProcessor.ts` when a raw CSV is uploaded to `/api/upload-csv`.

If an uploaded CSV already contains processed markers such as `anomaly_final_mgal`, the backend parses it directly without Python. If the CSV is raw, the backend attempts to find `python3` or `python` and run:

```text
analysis/scripts/gravity_pipeline.py <uploaded-file>
```

If Python is unavailable, the API returns a `no_python` error and asks the user to upload a pre-processed CSV.

## Hardware Layer

The hardware layer is currently documentation-focused. It describes the intended ESP32 sensor node and rover platform.

Intended sensor stack:

- ESP32 MCU with WiFi.
- MPU-6050 IMU for acceleration and gyroscope readings.
- BMP280 barometer for pressure, temperature, and barometric altitude.
- NEO-6M or similar GNSS receiver for latitude, longitude, altitude, HDOP, fix quality, and satellites.

The intended live data flow is:

1. Sensor node samples IMU/barometer/GNSS.
2. It computes or forwards a gravity anomaly estimate.
3. It sends telemetry to the web dashboard via WebSocket `/ws`, or HTTP POST `/api/telemetry` as a fallback.
4. The backend validates and broadcasts packets.
5. The frontend renders points on the Leaflet map and records them into runs.

Note: Some docs still show message type `anomalyData`; the current server/frontend implementation expects `newAnomalyPoint`.

## Render Deployment Flow

Render deployment is configured by `render.yaml`.

It defines one Node web service:

```text
gadv-web-dashboard
```

Build command:

```bash
npm ci --include=dev
npx vite build
npx esbuild app/server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir=dist
```

Build outputs:

- `dist/public`: Vite-built React frontend.
- `dist/index.js`: esbuild-bundled Express server.

Start command:

```bash
node dist/index.js
```

The single Node process serves:

- `/` and SPA fallback from `dist/public`.
- `/api/*` REST endpoints.
- `/ws` WebSocket endpoint.

Health check:

```text
/api/health
```

`build-render.sh` mirrors the Render build locally and checks for the expected output files.

## Runtime Entrypoints

Development web app:

```bash
NODE_ENV=development tsx app/server/index.ts
```

Production web app after build:

```bash
NODE_ENV=production PORT=5000 node dist/index.js
```

Render production start:

```bash
node dist/index.js
```

Frontend source entry:

```text
app/client/src/main.tsx
```

Backend source entry:

```text
app/server/index.ts
```

Route/WebSocket registration:

```text
app/server/routes.ts
```

Python analysis CLI:

```bash
python analysis/scripts/gravity_pipeline.py <csv-file>
python analysis/scripts/gravity_pipeline.py --batch
```

Root `main.py` is only a placeholder and is not part of the active app architecture.

## Environment Variables

Required or relevant variables:

- `NODE_ENV`: Controls dev vs production behavior. In production, must be `production` so Express serves static files instead of Vite middleware.
- `PORT`: Port used by `app/server/index.ts`. Render injects this automatically. Local fallback is `5000`.
- `SESSION_SECRET`: Present in `.env` and generated in Render. Currently reserved for future session/cookie support.
- `DATABASE_URL`: Required by `drizzle.config.ts` for `drizzle-kit push`, but not required by the running app because it currently uses `MemStorage`.
Current `.env` usage is minimal. The app does not currently load a database connection at runtime.

## Current Limitations

- Persistence is volatile. `MemStorage` loses live anomaly history on server restart, deploy, or Render free-tier sleep.
- Runs and experiments mostly live in frontend React state, not durable storage.
- PostgreSQL/Drizzle is partially scaffolded but not integrated into the runtime backend.
- `drizzle.config.ts` appears to reference `./shared/schema.ts`, but the actual schema is `app/shared/schema.ts`.
- Root `package.json` scripts reference `server/index.ts`, while the real server path is `app/server/index.ts`. Render uses the correct path.
- Docs mention `preprocess.py` in several places, but the real pipeline script is `gravity_pipeline.py`.
- Hardware docs show `anomalyData`, but the implemented WebSocket message type is `newAnomalyPoint`.
- Raw CSV server-side processing depends on Python plus numpy/pandas availability. A Node-only Render service may not always provide the right Python environment unless explicitly configured.
- CSV parsing exists in both client and server code, which can drift over time.
- Some markdown/doc text appears to have character encoding artifacts in terminal output.
- WebSocket telemetry is unauthenticated and accepts any client that can reach the service.
- Uploaded files are temporarily written to `uploads/`; this directory is created at runtime and cleaned after each upload, but there is no persistent upload audit trail.

## Future Extensions

- Replace `MemStorage` with a real PostgreSQL-backed storage implementation using the existing Drizzle schema.
- Add durable models for experiments, runs, telemetry packets, and uploaded files.
- Align all docs and hardware examples with the implemented `newAnomalyPoint` packet shape.
- Fix root npm scripts so local `npm run dev`, `npm run build`, and `npm run start` match the `app/server` layout.
- Add a Render-compatible Python setup if raw CSV processing is expected in production.
- Consolidate CSV parsing into one shared server-side pathway.
- Add authentication or device tokens for ESP32 telemetry ingestion.
- Add SD-card/offline-log import guidance for field hardware.
- Add automated tests for schema validation, CSV upload behavior, WebSocket broadcasting, and the Python pipeline.
- Add deployment checks that verify both Node build artifacts and Python pipeline availability.
