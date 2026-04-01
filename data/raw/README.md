# Raw Data

Unmodified data files as exported from the GADV web dashboard or ESP32 firmware.

Do not edit or delete files in this directory. All processing should be done by scripts in `analysis/scripts/` which write their output to `data/processed/`.

Place exported CSV or JSON files here using the naming convention:

```
YYYY-MM-DD_<location>_<session-id>.csv
```

Example: `2025-04-01_campus-north_001.csv`
