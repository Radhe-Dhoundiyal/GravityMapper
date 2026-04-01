# Methodology

## Research Question

Can a low-cost mobile MEMS-based platform detect statistically significant local gravitational mass anomalies when compared against a satellite gravity baseline?

## Sensor Fusion Approach

Raw accelerometer readings are corrupted by platform dynamics (rover motion, vibration) and sensor noise. The following pipeline is applied onboard the ESP32:

1. **High-pass filter** — remove low-frequency platform tilt using complementary filter with gyroscope
2. **Low-pass filter** — remove high-frequency vibration above 5 Hz
3. **Static window detection** — only record gravity estimates when platform is stationary (|ω| < threshold)
4. **Averaging** — median of N=20 static samples per measurement point

## Gravity Anomaly Calculation

The estimated vertical acceleration `g_meas` is compared against the theoretical gravity `g_WGS84` at the observed latitude using the Somigliana formula, corrected for elevation using the free-air gradient:

```
Δg = g_meas − g_WGS84(φ) + 0.3086 × h   [mGal]
```

where `φ` is geodetic latitude and `h` is ellipsoidal height in metres.

## Baseline Comparison

Survey anomaly maps are compared against GRACE/GRACE-FO satellite free-air anomaly grids (1 arcminute resolution) using RMS difference as the primary figure of merit. Analysis code is in `analysis/scripts/compare_grace.py`.

## Uncertainty Budget

| Source | Magnitude (mGal) |
|--------|-----------------|
| Accelerometer noise floor | ~5 |
| Platform dynamics residual | ~10 |
| GNSS position error (height) | ~1 |
| Sensor calibration | ~3 |
| **Total (RSS)** | **~12** |

GRACE resolution is ~1 mGal at 300 km spatial scales. Detecting sub-mGal local anomalies remains the primary technical challenge and motivation for this research.
