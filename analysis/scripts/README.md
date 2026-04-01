# Analysis Scripts

Batch processing scripts for GADV sensor data.

## Planned Scripts

| Script | Purpose |
|--------|---------|
| `preprocess.py` | Clean raw CSV exports, remove outliers, apply sensor calibration |
| `compute_anomaly.py` | Calculate local gravity anomaly relative to WGS-84 ellipsoid baseline |
| `compare_grace.py` | Align survey transect data with GRACE/GRACE-FO satellite gravity grids |
| `export_report.py` | Generate summary statistics and figures for a given experiment |

## Usage

```bash
python preprocess.py --input ../../data/raw/session_001.csv --output ../../data/processed/session_001_clean.csv
```
