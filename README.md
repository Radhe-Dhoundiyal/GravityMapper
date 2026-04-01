# GADV — Gravitational Anomaly Detection Vehicle

GADV is an open-source scientific research platform for mapping local gravitational anomalies using low-cost MEMS sensors, satellite positioning, and a real-time web dashboard. The project investigates whether consumer-grade hardware can detect statistically meaningful gravitational mass anomalies when compared against GRACE satellite gravity baselines.

## Repository Structure

```
gadv/
├── app/                    # Web dashboard (monorepo)
│   ├── client/             # React + Vite frontend
│   ├── server/             # Node.js + Express backend
│   └── shared/             # Shared TypeScript schemas
│
├── hardware/               # ESP32 sensor node
│   ├── sensors/            # Sensor specs and calibration
│   ├── circuit/            # Schematics and PCB files
│   └── rover/              # Mobile platform design
│
├── analysis/               # Data processing pipeline
│   ├── scripts/            # Batch processing scripts (Python)
│   └── notebooks/          # Jupyter analysis notebooks
│
├── data/                   # Survey datasets
│   ├── raw/                # Unmodified field exports
│   └── processed/          # Cleaned and calibrated data
│
├── experiments/            # Field work
│   ├── protocols/          # Standardised measurement procedures
│   └── logs/               # Per-experiment field records
│
├── docs/                   # Technical documentation
│   ├── architecture.md     # System architecture
│   ├── methodology.md      # Signal processing and anomaly calculation
│   └── system-overview.md  # Full system description
│
└── paper/                  # Research manuscript
    └── gadv_paper_draft.md # Working draft
```

## Web Dashboard

The dashboard receives real-time data from the ESP32 sensor node via WebSocket, displays colour-coded anomaly readings on an interactive Leaflet map, and provides CSV/JSON data export.

### Running in Development

```bash
NODE_ENV=development tsx app/server/index.ts
```

Or press **Run** in Replit — the workflow is pre-configured.

### Deploying to Render

```bash
./build-render.sh          # Test the build locally
```

Then follow `RENDER_DEPLOYMENT.md` for full Render setup. The `render.yaml` service definition is already configured.

## ESP32 Integration

The ESP32 firmware connects to the dashboard WebSocket endpoint (`/ws`) and streams data in the following format:

```json
{
  "type": "anomalyData",
  "data": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "anomalyValue": 1.25,
    "timestamp": "2025-04-01T10:30:00.000Z"
  }
}
```

See `hardware/` for sensor wiring, circuit schematics, and rover platform design.

## Research Goals

- Demonstrate sub-10 mGal anomaly detection with hardware costing under $100
- Produce geo-referenced gravity maps comparable to published geological surveys
- Provide an open platform for citizen science gravity research

See `docs/methodology.md` for the full signal processing approach and uncertainty budget, and `paper/gadv_paper_draft.md` for the evolving research manuscript.

## Licence

MIT — see `LICENSE` for details.
