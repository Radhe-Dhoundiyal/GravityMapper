# PROJECT_CONTEXT

This file is a quick architecture handoff for future AI coding sessions working on this repository.

## Project Purpose

GADV, the Gravitational Anomaly Detection Vehicle, is a research and science-fair platform for mapping local gravity-proxy anomalies using low-cost hardware. The intended system combines:

- ESP32-based rover telemetry with IMU, barometer, GNSS, temperature, distance, and optional battery inputs.
- A real-time web dashboard for map-based telemetry visualization, recording, analysis, anomaly detection, and survey planning.
- CSV import/export for field runs.
- JSON-backed run persistence for live telemetry runs and experiment/run metadata.
- A Python analysis pipeline that converts raw rover logs into processed anomaly estimates and run summaries.

The central scientific question is whether consumer-grade MEMS sensors can produce repeatable, geo-referenced gravity anomaly signals after filtering, tilt compensation, altitude correction, and statistical cleanup.

## Folder Structure

```text
.
|-- app/
|   |-- client/          React + Vite dashboard frontend
|   |-- server/          Express backend, REST API, WebSocket bridge, CSV/run processing
|   `-- shared/          Shared TypeScript schemas and DTO definitions
|-- analysis/
|   |-- scripts/         Python processing scripts, especially gravity_pipeline.py
|   `-- notebooks/       Placeholder area for exploratory Jupyter analysis
|-- hardware/
|   |-- esp32/           ESP32-S3 and Wokwi telemetry sketches
|   |-- sensors/         Sensor stack notes and calibration documentation
|   |-- circuit/         ESP32 circuit/schematic documentation
|   `-- rover/           Mobile platform documentation
|-- data/
|   |-- raw/             Unmodified field logs and CSV template
|   |-- processed/       Pipeline outputs and run_summary.csv
|   `-- runs/            JSON persisted telemetry runs grouped by experiment/run
|-- experiments/
|   |-- protocols/       Planned experiment protocols E1-E6
|   `-- logs/            Field log placeholder area
|-- docs/                Architecture, methodology, and system overview docs
|-- paper/               Research manuscript draft
|-- attached_assets/     Imported prompts/images/context from prior work
|-- render.yaml          Render web service definition
|-- build-render.sh      Local reproduction of the Render build
|-- package.json         Root Node dependencies and scripts
|-- vite.config.ts       Vite client build config and aliases
|-- tsconfig.json        TypeScript config for app/client, app/server, app/shared
|-- drizzle.config.ts    Drizzle config for future PostgreSQL usage
`-- pyproject.toml       Python project metadata
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
- Recharts and local components for telemetry, anomaly plot, statistics, and run comparison panels.
- A shadcn/Radix-style UI component set under `app/client/src/components/ui`.

`Home.tsx` is the main orchestration component. It owns:

- Live telemetry state.
- Run and experiment state.
- Experiment/run metadata editing state.
- Simulation mode.
- CSV upload handling.
- Saved run loading from `/api/runs`.
- Run processing requests through `/api/process-run`.
- Map filters, point/heatmap/gradient/anomaly view modes, and anomaly/run color modes.
- Survey grid planning state, origin selection, visited-node highlighting, and grid export.
- Detected anomaly region state and summary export.
- Export to CSV/JSON for visible points, run summaries, experiment summaries, and detected anomalies.
- WebSocket telemetry ingestion and recording state.
- A compact system status checklist for demo readiness.

Real-time communication is handled by `app/client/src/lib/useWebSocket.ts`. The hook auto-connects on page load to the current host:

```text
ws://<current-host>/ws    for local HTTP
wss://<current-host>/ws   for HTTPS/Render
```

It reconnects every 5 seconds after disconnects, server restarts, or Render wakeups. Development-only console diagnostics use the `[WS]` prefix. `AppHeader.tsx` displays `WS CONNECTED`, `WS DISCONNECTED`, or `WS RECONNECTING`, plus `Last telemetry received: X seconds ago`.

The frontend expects live packets in this shape:

```json
{
  "type": "newAnomalyPoint",
  "data": {
    "device_id": "gadv-rover-001",
    "experiment_id": "EXP-TEST",
    "run_id": "RUN-TEST",
    "timestamp": "2026-04-25T01:00:00Z",
    "latitude": 51.5,
    "longitude": -0.12,
    "anomalyValue": 0.85
  }
}
```

Additional IMU, GPS quality, pressure, temperature, altitude, distance, battery, smoothed anomaly, and stationary fields are optional. The dashboard defensively ignores malformed packets and invalid point coordinates/values.

Map features now include:

- Point/trail rendering with anomaly or run coloring.
- IDW-interpolated anomaly heatmap overlay using existing telemetry points.
- Gradient visualization computed from the interpolated grid with finite differences.
- Automatic anomaly-region detection from the interpolated grid using mean +/- 2 standard deviations.
- Positive and negative anomaly regions rendered as red/blue circles.
- Per-region confidence scoring using normalized peak anomaly, area, and nearby measurement density.
- Survey grid generation from a clicked origin, row/column count, and meter spacing.
- Grid node status highlighting: green for visited, gray for unvisited.

## Backend Architecture

The backend lives in `app/server`.

Main files:

- `app/server/index.ts`: Express app setup, request logging, error handling, dev/prod frontend serving, port binding.
- `app/server/routes.ts`: REST routes and WebSocket server.
- `app/server/storage.ts`: In-memory legacy anomaly-point storage abstraction.
- `app/server/runStorage.ts`: JSON-backed persisted run storage under `data/runs`.
- `app/server/csvProcessor.ts`: CSV upload parsing and Python pipeline bridge.
- `app/server/runProcessor.ts`: Stored-run JSON to raw CSV conversion, pipeline invocation, processed output handling.
- `app/server/vite.ts`: Vite dev middleware and production static serving.

The backend runs as one Node process. It serves:

- The React app in production from `dist/public`.
- API routes under `/api/*`.
- WebSocket telemetry under `/ws`.

Important REST routes:

```text
GET    /api/health
POST   /api/telemetry
GET    /api/runs
PATCH  /api/runs/:experimentId/:runId/metadata
PATCH  /api/experiments/:experimentId/metadata
POST   /api/process-run
GET    /api/anomaly-points
POST   /api/anomaly-points
DELETE /api/anomaly-points
POST   /api/upload-csv
```

`/api/telemetry` is an HTTP fallback for environments that cannot hold a WebSocket open. It accepts either a bare sensor payload or `{ "type": "newAnomalyPoint", "data": ... }`, validates it, stores it into the JSON run store when `experiment_id`/`run_id` metadata is present or defaulted, persists the legacy anomaly projection in memory, and broadcasts it to connected dashboards.

`/ws` accepts messages from simulated clients, future ESP32 clients, or other telemetry producers. On `newAnomalyPoint`, the server:

1. Parses JSON.
2. Validates the rich payload using `sensorDataPointSchema` from `app/shared/schema.ts`.
3. Stores a legacy latitude/longitude/anomaly/timestamp projection in `MemStorage`.
4. Appends the full rich telemetry point to a JSON run file via `runStorage`.
5. Broadcasts the full rich packet to all connected WebSocket clients.

JSON run persistence stores runs as:

```text
data/runs/<experiment_id>/<run_id>.json
```

with structure:

```json
{
  "experiment_id": "...",
  "run_id": "...",
  "device_id": "...",
  "start_time": "...",
  "end_time": "...",
  "duration": 0,
  "processing_status": "unprocessed",
  "run_metadata": {
    "location": "...",
    "notes": "..."
  },
  "experiment_metadata": {
    "location": "...",
    "operator": "...",
    "description": "...",
    "grid_spacing": "...",
    "sensor_configuration": "...",
    "notes": "..."
  },
  "points": []
}
```

The run store loads existing files on server startup and writes via temp-file plus rename to avoid corrupting JSON files mid-write. Experiment metadata is stored with each run file for that experiment because JSON run files are currently the only durable runtime storage layer.

`/api/process-run` accepts:

```json
{
  "experiment_id": "...",
  "run_id": "..."
}
```

It locates the stored JSON run, converts it to the raw CSV schema expected by the Python pipeline, invokes `analysis/scripts/gravity_pipeline.py`, copies processed output to:

```text
data/processed/<experiment_id>/<run_id>_processed.csv
```

and returns `points_processed`, `mean_anomaly`, `std_anomaly`, plus processed points for immediate dashboard refresh.

## Shared Schema Layer

Shared schemas live in `app/shared/schema.ts`.

They define:

- `users` table schema, reserved for future auth.
- `anomaly_points` table schema, a legacy 4-field anomaly store.
- `sensorDataPointSchema`, the richer live telemetry DTO used by WebSocket and `/api/telemetry`.

`sensorDataPointSchema` accepts optional identity and run metadata:

- `device_id`
- `experiment_id`
- `run_id`

It also accepts optional IMU, barometer, GPS quality, smoothed anomaly, and stationary fields. Drizzle and Zod are both present. The runtime app currently uses Zod schemas, in-memory legacy anomaly storage, and JSON files for runs. PostgreSQL is not wired into the live server yet.

Frontend-only domain types live in `app/client/src/lib/types.ts`, including `MapViewMode`, `AnomalyRegion`, `SurveyGrid`, experiment metadata fields, and run processing status.

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

The backend invokes this script in two ways:

- `app/server/csvProcessor.ts` processes uploaded raw CSV files through `/api/upload-csv`.
- `app/server/runProcessor.ts` processes recorded JSON runs through `/api/process-run`.

If an uploaded CSV already contains processed markers such as `anomaly_final_mgal`, the backend parses it directly without Python. If the CSV is raw, the backend attempts to find `python3` or `python` and run:

```text
analysis/scripts/gravity_pipeline.py <uploaded-file>
```

For stored runs, `runProcessor.ts` converts JSON telemetry points into the required raw CSV schema before invoking the same script.

If Python is unavailable, processing routes return an error and the user must process locally or upload a pre-processed CSV.

## Hardware Layer

The hardware layer now includes documentation plus first firmware sketches.

Intended/implemented sensor stack:

- ESP32/ESP32-S3 MCU with WiFi.
- MPU-6050 IMU for acceleration and gyroscope readings.
- BMP280 barometer for pressure, temperature, and barometric altitude.
- NEO-6M or similar GNSS receiver for latitude, longitude, altitude, HDOP, fix quality, and satellites.
- DS18B20 temperature sensor.
- HC-SR04 ultrasonic distance sensor.
- Optional INA219 battery monitor.
- microSD logging placeholder pins, not full implementation yet.

Firmware and simulation folders:

```text
hardware/esp32/gadv_rover_v1/
hardware/esp32/wokwi_telemetry_test/
```

`gadv_rover_v1.ino` targets ESP32-S3 DevKitC-1 and sends HTTPS POST telemetry to:

```text
https://gravitymapper.onrender.com/api/telemetry
```

using `WiFiClientSecure` with `client.setInsecure()` for testing.

`wokwi_telemetry_test.ino` targets Wokwi ESP32 simulation, uses `Wokwi-GUEST`, wakes Render with `/api/health`, and posts synthetic telemetry every 3 seconds.

The intended live data flow is:

1. Sensor node samples IMU/barometer/GNSS/temperature/distance/battery.
2. It computes or forwards a temporary live anomaly proxy.
3. It sends telemetry to the web dashboard via HTTP POST `/api/telemetry`; WebSocket `/ws` remains supported for simulated/browser clients.
4. The backend validates, persists, and broadcasts packets.
5. The frontend renders points, heatmaps, gradients, anomaly detections, survey grid coverage, and records runs.

Note: Some older docs still show message type `anomalyData`; the current server/frontend/firmware implementation expects `newAnomalyPoint`.

## Render Deployment Flow

Render deployment is configured by `render.yaml`.

It defines one Node web service:

```text
gadv-web-dashboard
```

Current Render build command:

```bash
npm ci --include=dev
npm run build
```

`npm run build` currently runs:

```bash
vite build && esbuild app/server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
```

Build outputs:

- `dist/public`: Vite-built React frontend.
- `dist/index.js`: esbuild-bundled Express server.

Current Render start command:

```bash
npm run start
```

`npm run start` currently runs:

```bash
NODE_ENV=production node dist/index.js
```

The single Node process serves:

- `/` and SPA fallback from `dist/public`.
- `/api/*` REST endpoints.
- `/ws` WebSocket endpoint.

Health check:

```text
/api/health
```

`build-render.sh` still mirrors older explicit Render build steps and may need to be checked if used locally. `render.yaml` is the current deployment source of truth.

## Runtime Entrypoints

Development web app source entry:

```bash
NODE_ENV=development tsx app/server/index.ts
```

Important: the current root `npm run dev` script still points to `server/index.ts`, which does not match the repo layout. Use the direct command above unless/until the script is fixed.

Production web app after build:

```bash
NODE_ENV=production PORT=5000 node dist/index.js
```

Render production start:

```bash
npm run start
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
- `DATABASE_URL`: Required by `drizzle.config.ts` for `drizzle-kit push`, but not required by the running app because runtime storage is not PostgreSQL-backed.

Current `.env` usage is minimal. The app does not currently load a database connection at runtime.

## Current Limitations

- Legacy `/api/anomaly-points` history is still volatile because it uses `MemStorage`.
- JSON run persistence survives local server restarts but may not survive Render free-tier instance replacement because Render filesystem persistence is ephemeral unless a disk is configured.
- Experiments and assignments are still primarily frontend state. Experiment metadata can be persisted into existing run JSON files only after there is at least one stored run for that experiment.
- PostgreSQL/Drizzle is partially scaffolded but not integrated into the runtime backend.
- `drizzle.config.ts` appears to reference `./shared/schema.ts`, but the actual schema is `app/shared/schema.ts`.
- Root `npm run dev` still references `server/index.ts`, while the real server path is `app/server/index.ts`.
- Docs mention `preprocess.py` in several places, but the real pipeline script is `gravity_pipeline.py`.
- Some hardware/docs text may still reference `anomalyData`; the implemented message type is `newAnomalyPoint`.
- Raw CSV and stored-run processing depend on Python plus numpy/pandas availability. A Node-only Render service may not always provide the right Python environment unless explicitly configured.
- CSV parsing exists in both client and server code, which can drift over time.
- Some markdown/doc text appears to have character encoding artifacts in terminal output.
- WebSocket and HTTP telemetry ingestion are unauthenticated and accept any client that can reach the service.
- Uploaded files are temporarily written to `uploads/`; this directory is created at runtime and cleaned after each upload, but there is no persistent upload audit trail.
- Local production smoke start on Windows may fail with `listen ENOTSUP 0.0.0.0:<port>` because of the server listen configuration. Render/Linux remains the intended production environment.
- Heatmap, gradient, and anomaly-region interpolation are intentionally lightweight and approximate; they are for visualization and demo analysis, not scientific-grade geostatistics.
- Anomaly confidence scoring is a relative dashboard score normalized across currently detected regions, not an externally validated probability.
- Survey grid spacing uses approximate Earth conversions and is best suited for small local survey areas.

## Future Extensions

- Replace `MemStorage` and JSON run files with real PostgreSQL-backed storage using the existing Drizzle schema.
- Add durable models for experiments, runs, telemetry packets, uploaded files, survey grids, anomaly detections, and processed outputs.
- Align all docs and hardware examples with the implemented `newAnomalyPoint` packet shape.
- Fix root `npm run dev` so local development uses `app/server/index.ts`.
- Add a Render-compatible Python setup if raw CSV or stored-run processing is expected in production.
- Consolidate CSV parsing into one shared server-side pathway.
- Add authentication or device tokens for ESP32 telemetry ingestion.
- Add SD-card/offline-log import guidance for field hardware.
- Add automated tests for schema validation, CSV upload behavior, WebSocket broadcasting, JSON run persistence, `/api/process-run`, heatmap generation, gradient generation, anomaly detection, confidence scoring, survey grid generation, and the Python pipeline.
- Add deployment checks that verify both Node build artifacts and Python pipeline availability.
- Replace `client.setInsecure()` in firmware with certificate validation before field deployment.

## Recently Modified Files

Recent work expanded the dashboard from live telemetry visualization into a fuller field workflow with persistent runs, processing, map analysis modes, anomaly detection, exports, metadata editing, and firmware examples.

Known recent modifications:

- `app/shared/schema.ts`: `sensorDataPointSchema` accepts optional `device_id`, `experiment_id`, and `run_id`.
- `app/client/src/lib/types.ts`: Adds telemetry identity fields, experiment metadata fields, run processing fields, `WebSocketStatus`, `MapViewMode`, `SurveyGrid`, and `AnomalyRegion`; `ExperimentRun.experimentId` can be a custom string.
- `app/client/src/lib/useWebSocket.ts`: Auto-connects to current host `/ws`, tracks `connected`/`disconnected`/`reconnecting`, reconnects every 5 seconds, and logs dev diagnostics with `[WS]`.
- `app/client/src/types/leaflet.d.ts`: Adds a local Leaflet module declaration so TypeScript can check the project without adding a dependency.
- `app/client/src/components/AppHeader.tsx`: Shows WebSocket status and last telemetry age.
- `app/client/src/components/TelemetryPanel.tsx`: Shows Device, Experiment, and Run metadata with clean fallbacks.
- `app/client/src/components/MapView.tsx`: Adds IDW heatmap rendering, gradient rendering, anomaly-region detection, confidence scoring, point/heatmap/gradient/anomalies view support, survey grid origin picking, grid markers, and visited/unvisited highlighting.
- `app/client/src/components/RunsPanel.tsx`: Adds per-run `Process Run` control with processing spinner.
- `app/client/src/components/ExperimentsPanel.tsx`: Adds Experiment Details metadata editing and run metadata controls.
- `app/client/src/components/StatsPanel.tsx`: Displays experiment metadata, run metadata, anomaly statistics, quality metrics, and latest sensor values for selected runs.
- `app/client/src/components/SidePanel.tsx`: Passes run processing and metadata callbacks, adds Stats-tab export controls, and wires anomaly export actions.
- `app/client/src/pages/Home.tsx`: Loads saved runs from `/api/runs`, processes runs through `/api/process-run`, manages point/heatmap/gradient/anomaly modes, stores detected anomaly regions, manages survey grid planning/export, handles metadata updates, provides system status checklist, and exports run summaries, experiment summaries, anomaly JSON, and anomaly CSV.
- `app/server/routes.ts`: Adds run persistence to WebSocket and HTTP telemetry ingestion, `GET /api/runs`, metadata PATCH routes, and `POST /api/process-run`.
- `app/server/runStorage.ts`: Adds JSON-backed run storage in `data/runs/<experiment_id>/<run_id>.json`, including run metadata, experiment metadata, duration, end time, and processing status.
- `app/server/runProcessor.ts`: Converts stored JSON runs to raw CSV, invokes `gravity_pipeline.py`, stores processed output, and returns processed points/summary.
- `app/server/vite.ts`: Tightens the Vite `allowedHosts` typing with `true as const`.
- `data/runs/.gitkeep`: Keeps JSON run storage directory in the repository.
- `hardware/esp32/gadv_rover_v1/gadv_rover_v1.ino`: Adds first ESP32-S3 rover telemetry firmware sketch.
- `hardware/esp32/gadv_rover_v1/README.md`: Documents board, libraries, pins, setup, and temporary live anomaly proxy warning.
- `hardware/esp32/wokwi_telemetry_test/wokwi_telemetry_test.ino`: Adds Wokwi ESP32 HTTPS telemetry simulator.
- `hardware/esp32/wokwi_telemetry_test/README.md`: Documents Wokwi setup and `broadcast:1` verification.
- `RENDER_DEPLOYMENT.md`: Sample telemetry payload includes identity metadata.
- `render.yaml`: Uses `npm ci --include=dev`, `npm run build`, and `npm run start`.
- `package.json`: `build` uses `app/server/index.ts`; `start` uses `dist/index.js`; `dev` still needs correction.
- `.replit`: Removed in prior cleanup.
- `app/client/index.html`, `vite.config.ts`, `README.md`, `docs/system-overview.md`, `package.json`, `package-lock.json`: Replit-specific references/plugins were removed in prior cleanup.
- `PROJECT_CONTEXT.md`: Regenerated for this handover.
- `ENVIRONMENT_NOTES.md`: Regenerated for this handover.

Last confirmed verification status:

- `npm.cmd run check` passed after local Leaflet typing, `MapView.tsx` narrowing cleanup, and `app/server/vite.ts` allowed-host typing cleanup.
- `npm.cmd run build` passed after metadata, heatmap, gradient, anomaly detection, confidence scoring, export, and system-status work.
- Build warnings remain non-blocking: large frontend chunk size and outdated Browserslist/caniuse-lite data.
- `gravity_pipeline.py` syntax was previously verified with the local Python 3.12 interpreter after sandbox escalation.
- `python` was not available on PATH in the default shell; the known local interpreter path was `C:\Users\Radhe\AppData\Local\Programs\Python\Python312\python.exe`.
- No full end-to-end `/api/process-run` runtime job was completed against a real stored run in the last session.
