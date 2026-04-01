# Data

Field survey data collected by the GADV platform.

## Subdirectories

### raw/
Unmodified CSV or JSON exports directly from the web dashboard or ESP32 firmware. Files are named by session date and identifier: `YYYY-MM-DD_session-ID.csv`. **Do not modify files in this directory.**

### processed/
Cleaned, calibrated, and resampled data files produced by `analysis/scripts/preprocess.py`. These files are safe to use as inputs for analysis notebooks and comparison against satellite baselines.

## File Format

Raw exports contain the following columns:

| Column | Unit | Description |
|--------|------|-------------|
| `timestamp` | ISO 8601 | UTC time of measurement |
| `latitude` | decimal degrees | WGS-84 latitude |
| `longitude` | decimal degrees | WGS-84 longitude |
| `anomaly_value` | mGal | Estimated gravity anomaly relative to baseline |

## Data Management

- Large datasets should not be committed to git. Add data files to `.gitignore` and use a shared storage location (e.g., cloud bucket or institutional server) for distribution.
- Small reference datasets (< 10 MB) used for unit tests may be committed.
