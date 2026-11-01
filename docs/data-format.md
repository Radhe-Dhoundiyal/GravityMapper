# Telemetry and CSV Data

## Live Telemetry

Send JSON to `POST /api/telemetry`, or send this envelope over `/ws`:

```json
{
  "type": "newAnomalyPoint",
  "data": {
    "device_id": "demo-device",
    "experiment_id": "SYNTHETIC-DEMO",
    "run_id": "demo-001",
    "timestamp": "2026-11-01T00:00:00Z",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "anomalyValue": 0.5
  }
}
```

This example is synthetic. The HTTP route also accepts the `data` object directly. Position, timestamp, and `anomalyValue` are required. Optional fields include `ax`, `ay`, `az` (g), `gx`, `gy`, `gz` (degrees/s), `pressure` (hPa), `temperature` (C), `altitude` (m), `speed` (m/s), `hdop`, `satellites`, `fixQuality`, `anomalySmoothed`, and `platformStationary`. The authoritative schema is `app/shared/schema.ts`.

The server writes full telemetry to `data/runs/<experiment_id>/<run_id>.json`; missing IDs default to `unassigned/live`. `GET /api/runs` returns saved runs. `POST /api/process-run` takes `experiment_id` and `run_id`, converts a stored run to raw CSV, and invokes the Python pipeline.

## CSV Workflow

Upload CSV files through the Runs tab or as multipart form field `file` to `POST /api/upload-csv` (50 MB limit). Raw uploads go through `analysis/scripts/gravity_pipeline.py`; processed CSVs containing markers such as `anomaly_final_mgal` are parsed directly. The server resolves anomaly columns in this order: `anomaly_final_mgal`, `anomaly_best_mgal`, then `anomaly_value_mgal` or `anomalyValue`.

`data/raw/sample_log_template.csv` is a synthetic format example, not a field record. Its header contains every required raw column. Acceleration uses g; gyroscope readings use degrees/s; pressure uses hPa; altitude uses meters; coordinates use decimal degrees. Flags such as `platform_stationary` use 0/1.

```sh
python -m pip install -r analysis/requirements.txt
python analysis/scripts/gravity_pipeline.py data/raw/sample_log_template.csv
python analysis/scripts/gravity_pipeline.py --batch
```

The pipeline writes `<input-stem>_processed.csv` and updates `run_summary.csv` under `data/processed/`. Batch mode skips the example template. Runtime data and generated outputs are ignored by Git. Built-in dashboard examples are also synthetic; processing and visualizing them does not turn them into measured data.
