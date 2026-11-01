# Deployment

`render.yaml` defines one Node web service. The Express process serves the frontend, `/api/*`, and `/ws` on the same port.

| Setting | Value |
| --- | --- |
| Build | `npm ci --include=dev` followed by `npm run build` |
| Start | `npm run start` |
| Health check | `/api/health` |
| Frontend output | `dist/public` |
| Server output | `dist/index.js` |

`NODE_ENV=production` selects static frontend serving. Render supplies `PORT`; local development defaults to 5000. `SESSION_SECRET` is reserved and is not currently used for authentication. No database connection is required by the running service.

Telemetry runs and their metadata are written to `data/runs/<experiment_id>/<run_id>.json` and loaded at startup. Processed CSV files go to `data/processed`. These files survive local restarts, but storage on the deployed service is ephemeral unless a persistent disk is configured. The legacy `/api/anomaly-points` history stays in memory. New experiment assignments also rely on frontend state until metadata can be saved against an existing run.

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

Check `/api/health` and `/` on the chosen port. The deployed dashboard is at <https://gravitymapper.onrender.com/> and uses `wss://gravitymapper.onrender.com/ws`. A sleeping service can delay the first request; the dashboard reconnects after a disconnect. Telemetry endpoints currently have no device authentication.
