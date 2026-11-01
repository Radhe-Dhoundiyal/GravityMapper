# GravityMapper

GravityMapper is the web-based telemetry, visualization, and data-analysis component of GADV, a broader rover engineering project. Mechanical CAD, electronics, and PCB development are maintained separately.

[Live dashboard](https://gravitymapper.onrender.com/)

## Why I Built It

I built GravityMapper to bring incoming rover readings, their locations, and run comparisons into one place. Seeing a stream of numbers is useful, but plotting it on a map and recording it as a run makes changes easier to inspect. The same interface supports live telemetry, synthetic examples, and imported CSV files.

## What It Does

The dashboard receives telemetry over WebSocket or HTTP, records runs, groups them into experiments, and displays statistics and plots. Maps can show points, interpolated heatmaps, gradients, and detected regions. A survey grid helps track coverage. Data and summaries can be exported as CSV, JSON, or a Markdown report.

The Python pipeline processes raw sensor logs with tilt compensation, altitude and latitude corrections, smoothing, and outlier filtering. Processed CSV files can also be imported directly.

## Technology and Layout

The frontend uses React, TypeScript, Vite, Leaflet, and Recharts. Express serves the API, the WebSocket bridge, and the built frontend. Python processing uses NumPy and pandas.

- `app/client/`: dashboard
- `app/server/`: API, telemetry, CSV processing, and PostgreSQL-backed run storage
- `app/shared/`: shared schemas and types
- `analysis/scripts/gravity_pipeline.py`: processing pipeline
- `data/raw/sample_log_template.csv`: synthetic CSV example

## Run Locally

Use Node.js 24 and npm 11. From the repository root:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open <http://localhost:5000>. In PowerShell, use `npm.cmd` if execution policy blocks `npm`.

Set `DATABASE_URL` to persistent PostgreSQL and `GADV_WRITE_TOKEN` to a random secret of at least 32 characters before migrating and starting. Enter the token through **Write access** in the Runs tab when uploading or editing data. Without database configuration, imports and recordings cannot be saved. See the deployment guide for setup and legacy JSON transfer.

For raw CSV processing and Process Run, install Python 3.11+ and the analysis requirements:

```sh
python -m pip install -r analysis/requirements.txt
python analysis/scripts/gravity_pipeline.py data/raw/sample_log_template.csv
```

Use `npm run check` and `npm run build` to check types and produce `dist/public` and `dist/index.js`. See the [deployment guide](RENDER_DEPLOYMENT.md) and [data reference](docs/data-format.md) for runtime details.

## Measurement Limits

Sensor-derived anomaly values are proxies, not calibrated gravitational measurements. Synthetic examples are demonstration data. Heatmaps, gradients, and relative region scores help inspect the input; they do not establish geological findings or detection accuracy.

## License

See [LICENSE](LICENSE).
