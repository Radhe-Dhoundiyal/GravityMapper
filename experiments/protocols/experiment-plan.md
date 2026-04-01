# GADV Experiment Plan

Gravitational Anomaly Detection Vehicle — Experiment Protocols E1–E6

All experiments use the standard sensor stack (ESP32 + MPU-6050 + BMP280 + NEO-6M) unless otherwise noted. Raw data is stored in `data/raw/` using the naming convention `YYYY-MM-DD_E<N>_<location-slug>_run<R>.csv`.

---

## E1 — Stationary Noise Floor

### Objective
Characterise the intrinsic noise floor of the sensor system when the platform is completely stationary, undisturbed, and on a rigid surface. This provides the calibration baseline for all subsequent experiments.

### Setup
- Sensor node placed on a solid concrete or granite surface indoors
- No personnel within 1 metre during recording
- WiFi antenna oriented vertically
- Vibration isolation foam engaged (standard configuration)
- All logging running at full 100 Hz

### Controlled Variables
- Location (same point, no movement)
- Ambient temperature (record `temp_bmp` and `temp_mpu` throughout)
- Sensor orientation (Z-axis pointing up, within ±1° of vertical, verified with spirit level)

### Measured Variables
- `az_raw` (primary)
- `gx_raw`, `gy_raw`, `gz_raw` (motion check)
- `temp_mpu` (thermal drift monitor)
- `pressure_hpa` (environmental stability)

### Procedure
1. Power on the sensor node and allow 10-minute warm-up
2. Place on calibration surface and wait 2 minutes for mechanical settling
3. Record a continuous 10-minute session (60,000 samples at 100 Hz)
4. Repeat three times on separate days at the same location
5. Label runs: `E1_lab-bench_run01`, `E1_lab-bench_run02`, `E1_lab-bench_run03`

### Outputs
- Three raw CSV files in `data/raw/`
- Allan deviation plot (from `analysis/notebooks/01_sensor_calibration.ipynb`)
- Power spectral density of `az_raw`
- Estimated bias offset and noise density for use in preprocessing calibration step

### Success Criterion
Standard deviation of `anomaly_value_mgal` (computed from static `az_raw` samples after tilt correction) is **< 15 mGal** across all three runs, with run-to-run mean variation **< 5 mGal**.

---

## E2 — Isolation vs No Isolation

### Objective
Quantify the noise reduction provided by passive vibration isolation (foam, rubber, or spring mounts) compared to direct hard mounting on a rigid surface. Establishes whether isolation should be mandatory for field deployments.

### Setup
- **Condition A**: Sensor mounted directly on hard surface (no isolation)
- **Condition B**: Sensor mounted on 20 mm open-cell foam pad
- Same location, same time of day for both conditions
- Location: indoor concrete floor or outdoor concrete slab

### Controlled Variables
- Location (identical GPS coordinates)
- Session duration (5 minutes per condition)
- Sensor orientation
- Ambient vibration environment (same building, same time of day)

### Measured Variables
- `az_raw` standard deviation
- `anomaly_value_mgal` standard deviation
- Frequency content of `az_raw` (PSD comparison)
- `isolation_active` flag (0 for Condition A, 1 for Condition B)

### Procedure
1. Run Condition A (no isolation) — 5 minutes, label `E2_concrete_no-isolation_run01`
2. Without moving the node's horizontal position, insert foam pad beneath it
3. Wait 2 minutes for settling
4. Run Condition B (with isolation) — 5 minutes, label `E2_concrete_isolation_run01`
5. Repeat the full sequence twice more for statistical confidence

### Outputs
- Six raw CSV files (three repetitions × two conditions)
- Side-by-side boxplot of anomaly distribution for each condition
- PSD overlay plot showing frequency-domain noise reduction
- Isolation benefit ratio: σ(no isolation) / σ(isolation)

### Success Criterion
Isolation reduces the standard deviation of `anomaly_value_mgal` by a factor of **≥ 1.5** (at least 33% noise reduction) in at least two of three repetition pairs.

---

## E3 — Smooth vs Rough Motion

### Objective
Characterise the magnitude of motion-induced artefacts on the gravity estimate during rover traversal over two surface types. Determines whether the static-only filter is sufficient to suppress all motion noise, or whether motion data should be discarded entirely.

### Setup
- **Surface A**: Smooth indoor corridor or tarmac (low vibration)
- **Surface B**: Grass, gravel path, or cobblestone (high vibration)
- Rover traverses a 10 m straight transect at approximately 0.3 m/s
- A stationary reference measurement is taken at each end of the transect before and after traversal

### Controlled Variables
- Traverse speed (~0.3 m/s, timed)
- Traverse path (same line, marked with tape)
- Sensor orientation on rover
- Isolation foam engaged

### Measured Variables
- `az_raw` during traversal (should be discarded by `platform_stationary` filter)
- `anomaly_value_mgal` at static start/end points
- `gx_raw`, `gy_raw`, `gz_raw` during traversal (motion characterisation)
- RMS vibration amplitude per surface type

### Procedure
1. Mark start and end points of a 10 m transect on each surface
2. Record 1-minute static reading at start point
3. Drive rover at measured pace to end point (~33 seconds)
4. Record 1-minute static reading at end point
5. Return rover to start and repeat (5 traversals per surface)
6. Label: `E3_smooth_run01` through `E3_rough_run05`

### Outputs
- Raw CSV files for all traversals
- Time-series plot showing `az_raw` during motion vs static phases
- Histogram of motion-phase anomaly values (expected: wide, noisy)
- Comparison of static-phase anomaly values before/after traversal (expected: consistent)
- RMS vibration amplitude table by surface type and frequency band

### Success Criterion
Static anomaly estimates at start and end points agree within **±20 mGal** across all five traversals on both surfaces. Motion-phase samples are confirmed to be excluded by the `platform_stationary` filter.

---

## E4 — Altitude Correction Verification

### Objective
Validate the free-air correction model (+0.3086 mGal per metre of elevation) by measuring the same sensor at multiple known altitudes and comparing the measured anomaly change against the theoretical prediction.

### Setup
- A staircase, hillside, or building with multiple accessible floors spanning at least 10 m of elevation
- GPS altitude recorded at each level, cross-checked against barometric altitude
- Sensor stationary at each measurement point for 3 minutes

### Controlled Variables
- Horizontal position (ideally directly above/below — use GPS to verify < 2 m lateral drift)
- Sensor orientation
- Time of day (minimise thermal drift between levels)

### Measured Variables
- `gps_alt_m` at each level
- `altitude_baro_m` at each level
- `anomaly_value_mgal` (raw, before free-air correction)
- `temp_bmp` (atmospheric stability check)

### Procedure
1. Select location with ≥ 4 distinct elevation levels, each separated by ≥ 2.5 m
2. Record GPS and barometric altitude at each level
3. Take a 3-minute static measurement at each level (working upward, then downward)
4. Label runs: `E4_staircase_L1` through `E4_staircase_L4`
5. Repeat the full ascent/descent cycle twice

### Outputs
- Plot of raw `g_vert_mgal` vs altitude — expected linear trend with slope ≈ −0.3086 mGal/m
- R² of linear regression
- Comparison of GPS vs barometric altitude (systematic offset, if any)
- Residual plot after applying free-air correction

### Success Criterion
Linear regression of raw gravity reading vs altitude achieves **R² ≥ 0.85** with a slope within **±20%** of the theoretical −0.3086 mGal/m. This confirms the free-air model is capturing real altitude-dependent gravity variation.

---

## E5 — Repeatability Loop

### Objective
Assess the run-to-run repeatability of the full pipeline across multiple sessions at the same location and same conditions, without changing anything between runs. This is the primary validation of instrument reliability.

### Setup
- Single fixed outdoor location (compact well-defined area, e.g., a specific floor tile or ground mark)
- Same sensor, same orientation, same isolation pad
- Sessions spread across different times and days to sample environmental variability

### Controlled Variables
- Sensor position (return to same GPS coordinate within < 0.5 m, verified with chalk mark)
- Session duration (5 minutes per run)
- Sensor orientation (Z-axis vertical, spirit-level verified)
- Isolation configuration (foam pad, standard configuration)

### Measured Variables
- `anomaly_value_mgal` mean and standard deviation per run
- `temp_mpu` and `temp_bmp` (environmental state)
- `gps_hdop` (positioning quality per session)

### Procedure
1. Physically mark the measurement spot on the ground
2. Conduct 10 independent 5-minute sessions:
   - Mix of different times of day (morning, afternoon, evening)
   - At least 3 sessions on different calendar days
3. Do not change sensor calibration or firmware between sessions
4. Label: `E5_fixed-point_run01` through `E5_fixed-point_run10`
5. After all sessions, compute mean and standard deviation across the 10 run means

### Outputs
- Table of per-run mean ± σ `anomaly_value_mgal`
- Run-mean scatter plot with overall mean and ±1σ band
- ANOVA or Kruskal-Wallis test for run-to-run significance
- Thermal correlation plot: anomaly mean vs `temp_mpu`

### Success Criterion
The maximum deviation of any single run mean from the overall 10-run mean is **< 20 mGal**. At least 9 of 10 runs fall within ±2σ of the overall mean (approximately expected under a normal distribution).

---

## E6 — Controlled Mass Experiment

### Objective
Determine whether the platform can detect the gravitational signal from a known mass placed at a known distance. This is the most direct test of the platform's detection sensitivity and the primary validation of the primary research hypothesis.

### Setup
- Known mass: ≥ 50 kg (e.g., a water container of known volume, or stacked steel plates)
- Sensor placed directly above the mass centre at a vertical separation of 0.3–0.5 m
- Reference measurement taken at the same point with mass removed
- Experiment conducted indoors on a concrete floor to avoid wind and wildlife interference

### Controlled Variables
- Sensor position (fixed, no movement between mass-present and mass-absent conditions)
- Mass value (measured on a scale, ±0.5 kg)
- Vertical separation distance (measured with tape, ±5 mm)
- All other environmental conditions

### Measured Variables
- `anomaly_value_mgal` with mass present vs absent
- `temp_mpu` and `temp_bmp` (thermal stability check)
- `platform_stationary` flag (confirm no movement)

### Theoretical Signal
The gravitational acceleration contribution of a point mass M at distance r is:

```
Δg = G × M / r²   [m/s²]
```

Converting: for M = 50 kg, r = 0.5 m → Δg ≈ **1.3 × 10⁻⁸ m/s² = 0.0013 mGal**

> **Note**: This expected signal (0.001 mGal) is far below the noise floor established in E1 (~15 mGal). E6 therefore serves to establish the detection limit and motivate future instrument improvements, rather than expected to produce a positive detection with current hardware.

### Procedure
1. Record 10-minute baseline (mass absent), label `E6_mass-absent_run01`
2. Place mass on floor directly beneath sensor
3. Wait 5 minutes for mechanical and thermal stabilisation
4. Record 10-minute session (mass present), label `E6_mass-present_run01`
5. Remove mass and take second 5-minute baseline, label `E6_mass-absent_run02`
6. Repeat full cycle twice more

### Outputs
- Boxplot: anomaly distribution for mass-present vs mass-absent conditions
- Welch's t-test result (p-value, effect size Cohen's d)
- Estimated minimum detectable mass at 0.5 m (derived from noise floor and SNR target of 3)
- Discussion of gap between theoretical signal and instrument noise floor

### Success Criterion
Primary: Welch's t-test shows **p < 0.05** for the difference between mass-present and mass-absent anomaly distributions.

Accepted fallback: If p ≥ 0.05, the experiment still succeeds if the computed upper bound on minimum detectable mass is below **5,000 kg at 0.5 m** (demonstrating the instrument is at least sensitive to geologically plausible density contrasts at the scale of a small boulder or infrastructure feature).

---

## Experiment Dependency Order

```
E1 (Noise Floor)
  └─ E2 (Isolation benefit — needs E1 σ as reference)
       └─ E5 (Repeatability — uses isolation configuration confirmed in E2)
            └─ E6 (Mass detection — requires stable baseline from E5)

E1 (Noise Floor)
  └─ E3 (Motion artefact — independent of E2, uses E1 static reference)

E1 (Noise Floor)
  └─ E4 (Altitude correction — independent, uses E1 calibration offsets)
```

E1 must be completed before any other experiment. E2 should be completed before E5 and E6. E3 and E4 can be run in parallel after E1.
