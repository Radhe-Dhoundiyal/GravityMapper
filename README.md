# GravityMapper

GravityMapper is the mapping and data-analysis app for GADV, my rover project. It brings GPS routes, sensor readings, and run comparisons together in one dashboard. The mechanical CAD, electronics, and PCB work are kept separately.

[![GravityMapper displaying the selected District Park CSV run and its 192 mapped samples](docs/media/district-park-run.png)](docs/media/district-park-run.png)

District Park, Paschim Vihar, New Delhi — field-route CSV `RUN-DISTPARK-20260720-004` (192 samples) mapped in GravityMapper. Approximate expected offset: ±15 mGal; the plotted anomaly values are uncalibrated.

[Live dashboard](https://gravitymapper.onrender.com/)

## Why I Built It

I built GravityMapper to bring incoming rover readings, their locations, and run comparisons into one place. Seeing a stream of numbers is useful, but plotting it on a map and recording it as a run makes changes easier to inspect. The same interface supports live telemetry, synthetic examples, and imported CSV files.

## What It Does

The dashboard receives telemetry over WebSocket or HTTP, records runs, groups them into experiments, and displays statistics and plots. Maps can show points, interpolated heatmaps, gradients, and detected regions. A survey grid helps track coverage. Data and summaries can be exported as CSV, JSON, or a Markdown report.

The Python pipeline processes raw sensor logs with tilt compensation, altitude and latitude corrections, smoothing, and outlier filtering. Processed CSV files can also be imported directly.

## Application Preview

[![GravityMapper run analysis with a time-series plot and sample statistics](docs/media/run-analysis.png)](docs/media/run-analysis.png)

A built-in synthetic run showing statistics and a time-series plot. These are example values, not field measurements. Open either image for full-size labels.

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

The anomaly values are sensor-derived estimates, not calibrated gravity measurements. Heatmaps, gradients, and region scores help explore the data; they are not geological findings. Built-in synthetic runs are demonstrations.

## How It Developed

GravityMapper started as a map of anomaly points. I later expanded the idea to include named runs and experiments, CSV imports, time-series plots, and run comparisons.

During telemetry testing, incoming points sometimes failed to appear in the live view. The WebSocket and display-state handling were corrected. Later checks exposed misleading anomaly values when sensor or GPS inputs were missing, so the processing now leaves incomplete corrected results blank. Run storage and regression tests were also added.

## License

See [acknowledgments](ACKNOWLEDGMENTS.md) for development credits and [LICENSE](LICENSE) for licensing.
