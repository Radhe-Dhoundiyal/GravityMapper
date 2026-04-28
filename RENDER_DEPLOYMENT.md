# Deploying GADV to Render

Single-service deployment: one Render Web Service runs the Express backend, the WebSocket bridge, and serves the built React frontend — all from one Node process.

---

## TL;DR

| Setting | Value |
|---|---|
| Service type | **Web Service** (Node) |
| Build command | `npm ci --include=dev && npx vite build && npx esbuild app/server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` |
| Start command | `node dist/index.js` |
| Health check path | `/api/health` |
| Auto-deploy | Yes (on push to main) |
| Plan | Free works for testing |

These values are also encoded in `render.yaml` at the repo root, so you can either point Render at the YAML (Blueprint deploy) or paste the commands manually in the dashboard — both produce the same service.

---

## What gets deployed

```
┌─ Render Web Service (single dyno) ──────────────────────────────────────┐
│                                                                         │
│   node dist/index.js   (binds to $PORT, host 0.0.0.0)                   │
│       │                                                                 │
│       ├── HTTP   /                       → dist/public/index.html (SPA) │
│       ├── HTTP   /api/health             → liveness probe               │
│       ├── HTTP   /api/telemetry  (POST)  → ESP32/Wokwi fallback         │
│       ├── HTTP   /api/anomaly-points     → legacy REST                  │
│       ├── HTTP   /api/upload-csv  (POST) → CSV processor (Python)       │
│       └── WS     /ws                     → live telemetry bridge        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The build produces:

- `dist/public/` — Vite-bundled React frontend (HTML/JS/CSS/assets)
- `dist/index.js` — esbuild-bundled Express server (single file, `--packages=external` keeps `node_modules` outside the bundle)

---

## One-time Render setup

### Option A — Blueprint deploy (recommended)

1. Push the repo to GitHub.
2. Render dashboard → **New** → **Blueprint** → connect the repo.
3. Render reads `render.yaml`, creates the `gadv-web-dashboard` service automatically with the correct build/start/health settings.
4. Click **Apply** and wait for the first deploy (~3–5 minutes on free tier).

### Option B — Manual Web Service

1. Render dashboard → **New** → **Web Service** → connect the repo.
2. Fill in:
   - **Name**: `gadv-web-dashboard` (or anything — drives the URL)
   - **Runtime**: Node
   - **Region**: any (Oregon / Frankfurt / Singapore)
   - **Build Command** (paste exactly):
     ```
     npm ci --include=dev && npx vite build && npx esbuild app/server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
     ```
   - **Start Command**:
     ```
     node dist/index.js
     ```
   - **Health Check Path**: `/api/health`
3. Add env vars:
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = (Generate)
4. Click **Create Web Service**.

---

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | Must be `production` so the server uses `serveStatic` (not Vite middleware) |
| `PORT` | injected | Render sets this automatically; do not override |
| `SESSION_SECRET` | optional | Reserved for future cookie/session support |

No database URL is required — runs/experiments live in browser state, and the legacy 4-field anomaly history uses in-memory storage (`MemStorage`). If you later swap to Postgres, add `DATABASE_URL` here.

---

## Final URLs

After Render finishes the first deploy, your service is reachable at:

```
https://<service-name>.onrender.com/
```

For the default `gadv-web-dashboard` name that's `https://gadv-web-dashboard.onrender.com`. Replace below with your actual subdomain.

| Resource | URL |
|---|---|
| Dashboard UI | `https://<service-name>.onrender.com/` |
| Health probe | `https://<service-name>.onrender.com/api/health` |
| Telemetry POST (ESP32/Wokwi fallback) | `https://<service-name>.onrender.com/api/telemetry` |
| Live WebSocket | `wss://<service-name>.onrender.com/ws` |
| Legacy REST | `https://<service-name>.onrender.com/api/anomaly-points` |

### Quick smoke tests

```bash
# Liveness
curl https://<service-name>.onrender.com/api/health
# → {"ok":true,"service":"gadv","time":"..."}

# Push a test telemetry point
curl -X POST https://<service-name>.onrender.com/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{"type":"newAnomalyPoint","data":{
        "device_id":"rover-001","experiment_id":"EXP-001","run_id":"RUN-001",
        "latitude":51.501,"longitude":-0.123,"anomalyValue":0.85,
        "timestamp":"2026-04-25T01:00:00Z","ax":0.01,"az":0.99,
        "pressure":1013,"temperature":21,"satellites":9}}'
# → {"ok":true,"broadcast":<open dashboards>}
```

If a dashboard tab is open at the same time, the test point will appear on the map within 1 s.

---

## Local build verification

Run the same build Render runs:

```bash
bash build-render.sh
NODE_ENV=production PORT=5000 node dist/index.js
```

Then visit `http://localhost:5000`. If everything works locally, it will work on Render.

---

## Free-tier gotchas

- **Cold starts after 15 min idle.** First request after sleep takes ~30 s. Wokwi sketches should hit `/api/health` once at boot to wake the dyno.
- **Volatile in-memory storage.** Restarts (deploys, sleep cycles) wipe the legacy anomaly history. Recorded runs live in browser state and survive page refreshes only as long as the tab is open.
- **WebSocket idle timeout ≈ 10 min.** Idle dashboards reconnect via the existing 5 s reconnect loop in `useWebSocket`. Dashboards actively recording at 2 Hz never go idle.
- **Build minutes are limited.** Free tier ≈ 500 build min/month. Each deploy uses ~3 min of build time.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails: `vite: command not found` | `NODE_ENV=production` on `npm ci` skipped devDeps | Build command must include `--include=dev` (already in render.yaml) |
| Build fails: `Cannot find module 'app/server/index.ts'` | Wrong working directory | Render runs at repo root by default; no rootDir override needed |
| 502 on first request | Cold start | Wait 30 s and retry, or add an external pinger (e.g. UptimeRobot) hitting `/api/health` every 10 min |
| WebSocket fails with 1006 | Mixed content (page on https, ws:// requested) | Always use `wss://` in production — never `ws://` |
| `dist/public` missing after build | `vite build` didn't run | Inspect Render build logs; the build command must complete all three steps |
| `/api/telemetry` returns 400 | Payload missing required fields | Required: `latitude`, `longitude`, `anomalyValue`, `timestamp`. All other fields optional. |

---

## What was removed from this setup

- **`render.js`** (deleted) — was a forked entry point with its own Express + WebSocket server that bypassed all schema validation, `/api/health`, and `/api/telemetry`. Production now uses `dist/index.js` (the bundled `app/server/index.ts`) as the single source of truth.
- **Multiple esbuild entry points** — collapsed to a single `app/server/index.ts` entry; esbuild walks the import graph itself.
