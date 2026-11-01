# Deployment

`render.yaml` defines one Node web service. The Express process serves the frontend, `/api/*`, and `/ws` on the same port.

| Setting | Value |
| --- | --- |
| Build | `npm ci --include=dev` followed by `npm run build` |
| Start | `npm run start` |
| Health check | `/api/health` |
| Frontend output | `dist/public` |
| Server output | `dist/index.js` |

`NODE_ENV=production` selects static frontend serving. Render supplies `PORT`; local development defaults to 5000. `SESSION_SECRET` remains unused. Durable storage requires `DATABASE_URL` pointing to persistent PostgreSQL and `GADV_WRITE_TOKEN` (a random secret of at least 32 characters).

After configuring a database, run `npm run db:migrate` once with its `DATABASE_URL`. This command is idempotent and verifies the migration checksum; the server does not run schema changes automatically. Use a persistent database with an appropriate backup/retention policy. Do not use an expiring trial for the only copy of measurements. No hosted database is provisioned by this repository.

CSV originals, their SHA-256 hashes, run observations, processing results, metadata, and experiment assignments are stored in PostgreSQL. An import is acknowledged only after its transaction commits. Reimporting identical rows is idempotent; reusing a run ID with different data returns HTTP 409. Scientific processing keeps derived results separate from source observations. Temporary upload/processing files are not the durable copy.

To transfer existing JSON runs without deleting them, run `npm run db:import-json -- <path-to-runs-directory>` after migration. Conflicts stop the import without overwriting an existing run. Back up those source files before changing hosting. The legacy `/api/anomaly-points` live-history view remains transient; clearing it never deletes saved runs.

Administrative mutations and original CSV downloads require `Authorization: Bearer <GADV_WRITE_TOKEN>`. Use **Write access** in the Runs tab for administrative access; the token stays in memory and must be re-entered after reloading. The original-file button sends an authenticated request. Downloads and run/experiment reads are marked `no-store`.

For ESP32 and Wokwi telemetry, configure `GADV_DEVICE_TOKENS` as a private JSON object mapping each `device_id` to its own random secret of at least 32 characters. Use different secrets from the administrative token. These credentials allow only telemetry submission for the matching device, over HTTP bearer authorization or a WebSocket message's top-level `token` field. They cannot upload files, download originals, edit metadata, process runs, or delete data. Supply device secrets privately; never put the administrative token or real device secrets in public firmware or simulation files. Existing telemetry payloads and endpoints are unchanged; add the device authorization header or message token.

Public dashboard reads and WebSocket broadcasts contain normalized measurements and run/experiment identifiers needed for maps, plots, statistics, and grouping. Original source columns, source observations, device IDs, provenance details, and private notes/operator metadata are omitted. Administrative bearer-authenticated reads include full metadata for editing. Missing or malformed credentials fail closed.

For local testing, set `TEST_DATABASE_URL` to a separate PostgreSQL database whose name ends in `_test`, then run `npm run test:persistence`. Never point that variable at a production database. Review the migration and database configuration before deploying; a redeployment must retain the same persistent `DATABASE_URL`.

Raw CSV uploads and Process Run require Python, NumPy, and pandas. The Node build does not install these. If they are unavailable, use a locally processed CSV instead. See [the data reference](docs/data-format.md).

To check a production build locally:

```sh
npm run check
npm run build
```

Then set `NODE_ENV=production` and run `node dist/index.js`. In PowerShell:

```powershell
$env:NODE_ENV='production'
node dist/index.js
```

Check `/api/health` and `/` on the chosen port. The deployed dashboard is at <https://gravitymapper.onrender.com/> and uses `wss://gravitymapper.onrender.com/ws`. A sleeping service can delay the first request; the dashboard reconnects after a disconnect.
