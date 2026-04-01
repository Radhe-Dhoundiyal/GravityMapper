# Data

This directory holds all measurement data collected by the GADV platform. Raw files are never modified after collection. All derived files are stored in `processed/`.

---

## Directory Structure

```
data/
├── raw/                  # Unmodified files directly from the sensor node or dashboard export
│   ├── sample_log_template.csv   # Column reference template (do not fill in)
│   └── YYYY-MM-DD_E<N>_<location>_run<R>.csv
│
└── processed/            # Output of analysis/scripts/preprocess.py
    ├── run_summary.csv   # Per-run aggregate statistics
    └── YYYY-MM-DD_E<N>_<location>_run<R>_processed.csv
```

---

## Run Naming Convention

Every data file (raw and processed) follows a strict naming pattern:

```
YYYY-MM-DD_E<N>_<location-slug>_run<R>.csv
```

| Field | Format | Example |
|-------|--------|---------|
| `YYYY-MM-DD` | ISO 8601 date | `2025-04-01` |
| `E<N>` | Experiment identifier (E1–E6) | `E1`, `E5` |
| `<location-slug>` | Short lowercase location label, hyphens only | `lab-bench`, `campus-north`, `staircase-L3` |
| `run<R>` | Two-digit run counter, zero-padded | `run01`, `run12` |

**Examples:**

```
2025-04-01_E1_lab-bench_run01.csv
2025-04-03_E2_concrete-floor_no-isolation_run02.csv
2025-04-10_E5_fixed-point_run07.csv
```

---

## CSV Column Schema

All raw files contain the following columns. Empty or unavailable values are written as `NaN`.

| Column | Type | Unit | Description |
|--------|------|------|-------------|
| `timestamp_utc` | string | ISO 8601 | UTC time of sample. Source: ESP32 NTP sync or GPS PPS |
| `run_id` | string | — | Matches the filename stem (e.g., `2025-04-01_E1_lab-bench_run01`) |
| `experiment_id` | string | — | Experiment label: `E1` through `E6` |
| `sample_index` | integer | — | Sequential counter from 0, reset at start of each run |
| `ax_raw` | float | g | MPU-6050 X-axis acceleration, raw counts converted to g |
| `ay_raw` | float | g | MPU-6050 Y-axis acceleration |
| `az_raw` | float | g | MPU-6050 Z-axis acceleration (primary gravity channel) |
| `gx_raw` | float | °/s | MPU-6050 gyroscope X (roll rate) |
| `gy_raw` | float | °/s | MPU-6050 gyroscope Y (pitch rate) |
| `gz_raw` | float | °/s | MPU-6050 gyroscope Z (yaw rate) |
| `temp_mpu` | float | °C | MPU-6050 internal die temperature |
| `pressure_hpa` | float | hPa | BMP280 barometric pressure |
| `temp_bmp` | float | °C | BMP280 ambient temperature |
| `altitude_baro_m` | float | m | Altitude from BMP280 using ISA model (reference: sea-level pressure at session start) |
| `gps_lat` | float | decimal degrees | WGS-84 latitude. NaN if GPS fix quality = 0 |
| `gps_lon` | float | decimal degrees | WGS-84 longitude. NaN if GPS fix quality = 0 |
| `gps_alt_m` | float | m | GPS ellipsoidal height. NaN if no fix |
| `gps_hdop` | float | — | Horizontal dilution of precision. Lower is better. NaN if no fix |
| `gps_fix_quality` | integer | — | 0 = no fix, 1 = standard GPS, 2 = DGPS |
| `gps_satellites` | integer | — | Number of satellites used in position solution |
| `platform_stationary` | integer | — | 1 if ‖ω‖ < 0.5 °/s on all three axes for the preceding 200 ms; else 0 |
| `isolation_active` | integer | — | 1 if vibration isolation pad is engaged; 0 if hard-mounted |
| `anomaly_value_mgal` | float | mGal | Computed free-air anomaly. NaN if GPS fix quality = 0 or platform not stationary |
| `notes` | string | — | Optional per-sample text annotation (e.g., `mass_placed`, `wind_gust`) |

---

## Experiment Labels

The `experiment_id` column uses the following values:

| Value | Experiment | Description |
|-------|-----------|-------------|
| `E1` | Stationary Noise Floor | Static calibration, no disturbance |
| `E2` | Isolation vs No Isolation | Paired comparison with/without vibration isolation |
| `E3` | Smooth vs Rough Motion | Traversal over two surface types |
| `E4` | Altitude Correction | Multi-elevation free-air model validation |
| `E5` | Repeatability Loop | 10 repeated sessions at fixed point |
| `E6` | Controlled Mass | Known mass placed beneath sensor |
| `CAL` | Calibration | Ad-hoc calibration or warm-up sessions |

---

## Processed Data and Run Summary

After running `analysis/scripts/preprocess.py`, a `run_summary.csv` is updated in `data/processed/` with one row per run:

| Column | Description |
|--------|-------------|
| `run_id` | Matches raw filename stem |
| `experiment_id` | E1–E6 |
| `date` | Session date |
| `location` | Location slug |
| `n_samples_raw` | Total samples in raw file |
| `n_samples_static` | Samples passing `platform_stationary` filter |
| `anomaly_mean_mgal` | Mean of `anomaly_value_mgal` for static samples |
| `anomaly_std_mgal` | Standard deviation |
| `anomaly_min_mgal` | Minimum |
| `anomaly_max_mgal` | Maximum |
| `gps_fix_fraction` | Fraction of samples with GPS fix quality ≥ 1 |
| `mean_temp_mpu` | Mean MPU-6050 die temperature |
| `isolation_active` | Isolation configuration (0 or 1) |
| `preprocessing_version` | Git commit hash of preprocess.py at time of processing |
| `notes` | Free text from session log |

---

## Data Management Policy

- **Never edit files in `data/raw/`** after they have been created. If a collection error occurred, document it in `experiments/logs/` and note it in the `notes` column of the processed file.
- Files larger than **10 MB** should not be committed to the git repository. Add them to `.gitignore` and store on a shared drive or cloud bucket.
- Small reference files and template files (like `sample_log_template.csv`) may be committed.
- Always run `preprocess.py` before using data in analysis notebooks. Do not analyse raw files directly.
