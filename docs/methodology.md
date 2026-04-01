# GADV Methodology

Gravitational Anomaly Detection Vehicle — Research Methodology and Experimental Design

---

## 1. Research Question

**Can a low-cost mobile sensing platform built from consumer-grade MEMS components detect local gravitational mass anomalies, and if so, at what spatial resolution and sensitivity threshold?**

The platform cost target is under USD 150 in components. The comparison baseline is the GRACE/GRACE-FO satellite free-air gravity anomaly grid and the WGS-84 theoretical gravity model.

---

## 2. Hypotheses

### 2.1 Primary Hypothesis

A rover-mounted ESP32 node fusing MPU-6050 IMU, BMP280 barometric altimeter, and NEO-6M GPS can, under controlled stationary conditions, resolve gravity differences greater than **±15 mGal** between measurement points separated by at least **10 metres**, when vibration isolation and a multi-sample averaging window are applied.

This would represent a noise floor competitive with early analogue spring gravimeters and sufficient to detect shallow subsurface density contrasts of geological interest (e.g., voids, saturated zones, igneous intrusions).

### 2.2 Secondary (Fallback) Hypothesis

If the primary sensitivity target cannot be achieved, the platform can still serve as a **proof-of-concept educational instrument** that demonstrates the measurable effect of latitude correction (Somigliana formula), free-air altitude correction, and the directional alignment of the accelerometer Z-axis with local vertical — all phenomena reproducible in a controlled lab environment.

Success under the fallback hypothesis requires repeatable readings with a standard deviation below **±30 mGal** across five identical static trials at the same location.

---

## 3. Sensor Stack

| Sensor | Parameter Measured | Interface | Sampling Rate |
|--------|--------------------|-----------|---------------|
| MPU-6050 | 3-axis linear acceleration (±2g), 3-axis angular velocity | I2C (400 kHz) | 100 Hz |
| BMP280 | Barometric pressure, ambient temperature | I2C | 1 Hz |
| NEO-6M / NEO-M8N | Latitude, longitude, altitude, HDOP, fix quality | UART (9600 baud) | 1 Hz |
| ESP32 | Host MCU, WiFi, real-time clock | — | — |

### Derived Quantities

| Quantity | Formula | Unit |
|----------|---------|------|
| Vertical acceleration | `g_vert = az · cos(pitch) · cos(roll)` | m/s² |
| Free-air corrected anomaly | `Δg = g_meas − g_WGS84(φ) + 0.3086 × h` | mGal |
| Theoretical gravity | Somigliana 1980 international formula | mGal |

### Known Sensor Limitations

- **MPU-6050** is a ±2g / ±16g consumer accelerometer with ~400 µg/√Hz noise density. It is not a geodetic-grade gravimeter.
- **BMP280** altitude resolution is ~0.1 m under stable thermal conditions, contributing ~0.03 mGal error per sample.
- **NEO-6M** GPS height accuracy is ±3–5 m, contributing up to **~1.5 mGal** systematic free-air error. A differential or dual-frequency receiver would improve this significantly.

---

## 4. Data Logging Schema

Each measurement session produces one CSV file in `data/raw/`. The file naming convention is:

```
YYYY-MM-DD_E<N>_<location-slug>_run<R>.csv
```

Example: `2025-04-01_E1_lab-bench_run01.csv`

### CSV Column Schema

| Column | Type | Unit | Description |
|--------|------|------|-------------|
| `timestamp_utc` | string | ISO 8601 | UTC timestamp from ESP32 NTP or GPS |
| `run_id` | string | — | Unique run identifier (matches filename) |
| `experiment_id` | string | — | E1 through E6 |
| `sample_index` | integer | — | Sequential sample counter within run |
| `ax_raw` | float | g | MPU-6050 raw X-axis acceleration |
| `ay_raw` | float | g | MPU-6050 raw Y-axis acceleration |
| `az_raw` | float | g | MPU-6050 raw Z-axis acceleration |
| `gx_raw` | float | °/s | MPU-6050 gyroscope X |
| `gy_raw` | float | °/s | MPU-6050 gyroscope Y |
| `gz_raw` | float | °/s | MPU-6050 gyroscope Z |
| `temp_mpu` | float | °C | MPU-6050 internal die temperature |
| `pressure_hpa` | float | hPa | BMP280 barometric pressure |
| `temp_bmp` | float | °C | BMP280 ambient temperature |
| `altitude_baro_m` | float | m | Altitude derived from BMP280 (ISA model) |
| `gps_lat` | float | decimal degrees | WGS-84 latitude (NaN if no fix) |
| `gps_lon` | float | decimal degrees | WGS-84 longitude (NaN if no fix) |
| `gps_alt_m` | float | m | GPS ellipsoidal height (NaN if no fix) |
| `gps_hdop` | float | — | Horizontal dilution of precision |
| `gps_fix_quality` | integer | — | 0=no fix, 1=GPS, 2=DGPS |
| `gps_satellites` | integer | — | Number of satellites in use |
| `platform_stationary` | boolean | — | 1 if |ω| < 0.5 °/s on all axes |
| `isolation_active` | boolean | — | 1 if vibration isolation foam/spring is engaged |
| `anomaly_value_mgal` | float | mGal | Computed free-air corrected anomaly (NaN if insufficient fix) |
| `notes` | string | — | Optional per-sample annotation |

---

## 5. Preprocessing Pipeline

Raw CSV files are processed by `analysis/scripts/preprocess.py`. The steps are applied in order:

### Step 1 — Load and Validate
- Read CSV, assert all required columns are present
- Parse `timestamp_utc` to `datetime64`
- Flag rows where GPS fix quality is 0

### Step 2 — Calibration Correction
- Subtract stored accelerometer bias offsets (from E1 stationary calibration)
- Apply scale-factor correction if determined from factory datasheet

### Step 3 — Tilt Compensation
- Compute pitch and roll from `ax_raw`, `ay_raw`, `az_raw` (assuming quasi-static)
- Project acceleration onto local vertical: `g_vert = az / cos(pitch) / cos(roll)`
- Convert to mGal: `g_vert_mgal = g_vert × 100000`

### Step 4 — Static Window Filtering
- Retain only samples where `platform_stationary == 1`
- Apply 2-second minimum static dwell requirement (≥ 200 samples at 100 Hz)

### Step 5 — Outlier Rejection
- Compute rolling median absolute deviation (MAD) over a 5-second window
- Reject samples where |sample − median| > 3 × MAD

### Step 6 — Free-Air Anomaly Calculation
- `g_WGS84(φ)` from Somigliana 1980: `g_WGS84 = 9.7803267714 × (1 + 0.00193185138639 × sin²φ) / sqrt(1 − 0.00669437999014 × sin²φ)`
- Free-air correction: `+0.3086 × h` mGal/m, where `h` is GPS altitude or barometric altitude
- `anomaly_processed = g_vert_mgal − g_WGS84_mgal + free_air_correction`

### Step 7 — Export
- Write cleaned data to `data/processed/<original_filename>_processed.csv`
- Write per-run summary statistics (mean, std, N) to `data/processed/run_summary.csv`

---

## 6. Experiment List

| ID | Name | Type | Status |
|----|------|------|--------|
| E1 | Stationary Noise Floor | Calibration | Planned |
| E2 | Isolation vs No Isolation | Controlled comparison | Planned |
| E3 | Smooth vs Rough Motion | Motion artefact | Planned |
| E4 | Altitude Correction Verification | Model validation | Planned |
| E5 | Repeatability Loop | Statistical validation | Planned |
| E6 | Controlled Mass Experiment | Detection sensitivity | Planned |

Full protocol for each experiment is in `experiments/protocols/experiment-plan.md`.

---

## 7. Evaluation Metrics

### 7.1 Noise Floor (E1)
- **Metric**: Standard deviation of `anomaly_value_mgal` over 300 static samples
- **Target**: σ < 15 mGal

### 7.2 Isolation Benefit (E2)
- **Metric**: Ratio of σ (no isolation) / σ (with isolation)
- **Target**: Ratio > 1.5 (isolation reduces noise by at least 33%)

### 7.3 Motion Artefact (E3)
- **Metric**: RMS difference between moving-platform anomaly estimate and static ground truth
- **Target**: RMS < 30 mGal on smooth surface, characterised (not required to pass) on rough

### 7.4 Altitude Model Accuracy (E4)
- **Metric**: Correlation (R²) between free-air anomaly change and predicted correction (+0.3086 mGal/m)
- **Target**: R² > 0.85 over a 10 m elevation change

### 7.5 Repeatability (E5)
- **Metric**: Max deviation from mean across 10 repeated runs at the same location
- **Target**: Max deviation < 20 mGal

### 7.6 Controlled Mass Detection (E6)
- **Metric**: Statistical significance (t-test, p < 0.05) of measured anomaly shift when a known mass is placed beneath the sensor
- **Target**: Detectable signal from ≥ 50 kg mass at ≤ 0.5 m distance

---

## 8. Current Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| MPU-6050 noise density (~400 µg/√Hz) | Sets fundamental noise floor ~5 mGal | Averaging over long static windows; consider ICM-42688 upgrade |
| Platform mechanical vibration | Adds ~10 mGal of correlated noise | Vibration isolation foam; static-only recording |
| GPS height error (±3–5 m) | Contributes ±1–1.5 mGal systematic error | Barometric correction as backup; DGPS for future work |
| Thermal drift of MPU-6050 | Sensitivity changes ~0.1% per °C | Log die temperature; apply post-hoc thermal model |
| No absolute calibration standard | Cannot verify mGal-level accuracy | Use known latitude / Bouguer plate as relative check |
| Single-axis tilt compensation only | Large tilts (> 15°) introduce nonlinear errors | Mount sensor on passive gimbal for field work |
| WiFi link dependency | Data lost if connection drops | Add SD card logging as fallback |
