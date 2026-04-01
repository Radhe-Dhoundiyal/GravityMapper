#!/usr/bin/env python3
"""
gravity_pipeline.py — GADV Analysis Pipeline
=============================================
Processes raw rover sensor logs and computes gravity-proxy anomaly values.

Input  : CSV files in data/raw/ following the schema in data/README.md
Output : Processed CSVs in data/processed/  +  data/processed/run_summary.csv

Usage
-----
  # Process a single file
  python gravity_pipeline.py data/raw/2025-04-01_E1_lab-bench_run01.csv

  # Process all files in data/raw/
  python gravity_pipeline.py --batch

  # Override smoothing window (seconds)
  python gravity_pipeline.py --batch --smooth-window 5.0

  # Skip the platform_stationary filter (e.g. for motion characterisation)
  python gravity_pipeline.py data/raw/some_file.csv --no-static-filter

Pipeline steps
--------------
  1  Load CSV and validate schema
  2  Convert accelerometer readings from g to m/s²
  3  Tilt compensation  → corrected vertical acceleration
  4  Free-air altitude correction  (+0.3086 mGal/m)
  5  WGS-84 / Somigliana latitude correction
  6  Compute gravity anomaly proxy  [mGal]
  7  Moving-average smoothing  (default 7.5-second window)
  8  MAD outlier rejection  (3 × MAD threshold)
  9  Summary metrics  (mean, std, N, duration)
  10 Export processed CSV + append row to run_summary.csv
"""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PIPELINE_VERSION = "1.0.0"

G_MS2 = 9.80665          # standard gravity [m/s²]
MGAL_PER_MS2 = 100_000   # 1 m/s² = 100 000 mGal

FREE_AIR_GRADIENT = 0.3086   # mGal per metre of elevation

# WGS-84 Somigliana coefficients
WGS84_GE = 9.780_326_771_4   # equatorial gravity [m/s²]
WGS84_K  = 0.001_931_851_386_39
WGS84_E2 = 0.006_694_379_990_14

DEFAULT_SAMPLE_RATE_HZ = 100.0   # ESP32 / MPU-6050 default
DEFAULT_SMOOTH_WINDOW_S = 7.5    # smoothing window in seconds
MAD_THRESHOLD = 3.0              # outlier rejection: |z| > threshold × MAD

REQUIRED_COLUMNS = [
    "timestamp_utc", "run_id", "experiment_id", "sample_index",
    "ax_raw", "ay_raw", "az_raw",
    "gx_raw", "gy_raw", "gz_raw",
    "temp_mpu", "pressure_hpa", "temp_bmp", "altitude_baro_m",
    "gps_lat", "gps_lon", "gps_alt_m",
    "gps_hdop", "gps_fix_quality", "gps_satellites",
    "platform_stationary", "isolation_active",
    "anomaly_value_mgal", "notes",
]

# Paths (relative to repo root)
REPO_ROOT   = Path(__file__).resolve().parents[2]
RAW_DIR     = REPO_ROOT / "data" / "raw"
PROC_DIR    = REPO_ROOT / "data" / "processed"
SUMMARY_CSV = PROC_DIR / "run_summary.csv"

SUMMARY_COLUMNS = [
    "run_id", "experiment_id", "date", "location", "isolation_active",
    "n_samples_raw", "n_samples_static", "n_samples_after_mad",
    "run_duration_s",
    "anomaly_mean_mgal", "anomaly_std_mgal",
    "anomaly_min_mgal", "anomaly_max_mgal",
    "mean_temp_mpu", "gps_fix_fraction",
    "smooth_window_s", "mad_threshold",
    "preprocessing_version", "git_hash",
    "processed_at_utc",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _git_hash() -> str:
    """Return the short HEAD commit hash, or 'unknown' if git is unavailable."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, cwd=REPO_ROOT, timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def _file_hash(path: Path) -> str:
    """SHA-256 of the raw input file (first 8 hex chars)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:8]


def _detect_sample_rate(df: pd.DataFrame) -> float:
    """
    Estimate the actual sample rate from the timestamp column.
    Falls back to DEFAULT_SAMPLE_RATE_HZ if timestamps cannot be parsed.
    """
    if "timestamp_utc" not in df.columns or len(df) < 2:
        return DEFAULT_SAMPLE_RATE_HZ
    try:
        ts = pd.to_datetime(df["timestamp_utc"], utc=True, errors="coerce")
        dt = ts.diff().dt.total_seconds().dropna()
        dt = dt[dt > 0]
        if dt.empty:
            return DEFAULT_SAMPLE_RATE_HZ
        median_dt = dt.median()
        return round(1.0 / median_dt, 1) if median_dt > 0 else DEFAULT_SAMPLE_RATE_HZ
    except Exception:
        return DEFAULT_SAMPLE_RATE_HZ


def _location_from_run_id(run_id: str) -> str:
    """Extract location slug from run_id. E.g. '2025-04-01_E1_lab-bench_run01' → 'lab-bench'."""
    parts = run_id.split("_")
    # parts: [date, experiment, location..., runNN]
    if len(parts) >= 4:
        return "_".join(parts[2:-1])   # everything between experiment and runNN
    return "unknown"


# ---------------------------------------------------------------------------
# Step 1 — Load and validate
# ---------------------------------------------------------------------------

def load_and_validate(path: Path) -> pd.DataFrame:
    """
    Load a raw CSV and verify all required columns are present.
    Raises ValueError with a descriptive message on failure.
    """
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    df = pd.read_csv(path, dtype=str)   # read everything as str first

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Schema validation failed for '{path.name}'.\n"
            f"Missing columns: {missing}\n"
            f"Found columns  : {list(df.columns)}"
        )

    # Cast numeric columns
    numeric_cols = [
        "sample_index",
        "ax_raw", "ay_raw", "az_raw",
        "gx_raw", "gy_raw", "gz_raw",
        "temp_mpu", "pressure_hpa", "temp_bmp", "altitude_baro_m",
        "gps_lat", "gps_lon", "gps_alt_m",
        "gps_hdop", "gps_fix_quality", "gps_satellites",
        "platform_stationary", "isolation_active",
        "anomaly_value_mgal",
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True, errors="coerce")
    df["notes"] = df["notes"].fillna("")

    return df


# ---------------------------------------------------------------------------
# Step 2 — Unit conversion: g → m/s²
# ---------------------------------------------------------------------------

def convert_units(df: pd.DataFrame) -> pd.DataFrame:
    """Convert accelerometer columns from g to m/s²."""
    for axis in ("ax_raw", "ay_raw", "az_raw"):
        df[f"{axis}_ms2"] = df[axis] * G_MS2
    return df


# ---------------------------------------------------------------------------
# Step 3 — Tilt compensation
# ---------------------------------------------------------------------------

def tilt_compensation(df: pd.DataFrame) -> pd.DataFrame:
    """
    Estimate pitch and roll from the accelerometer triad and project the
    acceleration vector onto the local vertical (Z) axis.

    pitch = arctan(ax / sqrt(ay² + az²))
    roll  = arctan(ay / sqrt(ax² + az²))
    g_vertical = az / (cos(pitch) × cos(roll))          [g]
    g_vert_ms2 = g_vertical × G_MS2                     [m/s²]
    g_vert_mgal = g_vert_ms2 × MGAL_PER_MS2             [mGal]

    Note: valid only for quasi-static conditions. The platform_stationary
    filter in step 4 ensures we only use tilt-compensated values when the
    platform is not moving.
    """
    ax = df["ax_raw"].to_numpy()
    ay = df["ay_raw"].to_numpy()
    az = df["az_raw"].to_numpy()

    with np.errstate(invalid="ignore", divide="ignore"):
        pitch = np.arctan2(ax, np.sqrt(ay**2 + az**2))     # radians
        roll  = np.arctan2(ay, np.sqrt(ax**2 + az**2))     # radians

        cos_pitch = np.cos(pitch)
        cos_roll  = np.cos(roll)
        denom = cos_pitch * cos_roll

        # Avoid division by near-zero (tilt > ~89°)
        g_vert_g = np.where(np.abs(denom) > 1e-4, az / denom, np.nan)

    df["pitch_deg"]    = np.degrees(pitch)
    df["roll_deg"]     = np.degrees(roll)
    df["g_vert_g"]     = g_vert_g
    df["g_vert_ms2"]   = g_vert_g * G_MS2
    df["g_vert_mgal"]  = g_vert_g * G_MS2 * MGAL_PER_MS2

    return df


# ---------------------------------------------------------------------------
# Step 4 — Free-air altitude correction
# ---------------------------------------------------------------------------

def altitude_correction(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply the free-air correction: +0.3086 mGal per metre of altitude.

    Altitude source priority:
      1. GPS ellipsoidal height (gps_alt_m)  — only when fix quality ≥ 1
      2. Barometric altitude (altitude_baro_m) — always available

    The correction is defined relative to the geoid (h = 0).
    A positive altitude reduces gravity; the correction adds back the deficit.

    free_air_correction_mgal = +0.3086 × h   [mGal]
    """
    gps_valid = df["gps_fix_quality"].fillna(0) >= 1
    altitude = np.where(gps_valid, df["gps_alt_m"], df["altitude_baro_m"])
    altitude = np.where(np.isnan(altitude), df["altitude_baro_m"], altitude)

    df["altitude_used_m"] = altitude
    df["free_air_corr_mgal"] = FREE_AIR_GRADIENT * altitude

    return df


# ---------------------------------------------------------------------------
# Step 5 — WGS-84 Somigliana latitude correction
# ---------------------------------------------------------------------------

def latitude_correction(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute theoretical gravity at each GPS latitude using the closed-form
    Somigliana (1980) formula, converting to mGal.

    g_WGS84(φ) = ge × (1 + k × sin²φ) / sqrt(1 − e² × sin²φ)   [m/s²]

    Where:
        ge   = 9.780 326 771 4  m/s²
        k    = 0.001 931 851 386 39
        e²   = 0.006 694 379 990 14

    When GPS latitude is unavailable (no fix), the column is NaN and the
    anomaly calculation will also be NaN for those rows.
    """
    lat_rad = np.radians(df["gps_lat"].to_numpy())
    sin2 = np.sin(lat_rad) ** 2

    with np.errstate(invalid="ignore"):
        g_wgs84_ms2 = WGS84_GE * (1.0 + WGS84_K * sin2) / np.sqrt(1.0 - WGS84_E2 * sin2)

    df["g_wgs84_ms2"]   = g_wgs84_ms2
    df["g_wgs84_mgal"]  = g_wgs84_ms2 * MGAL_PER_MS2

    return df


# ---------------------------------------------------------------------------
# Step 6 — Gravity anomaly proxy
# ---------------------------------------------------------------------------

def compute_anomaly(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute the free-air gravity anomaly proxy:

        Δg = g_vert_mgal − g_wgs84_mgal + free_air_corr_mgal

    When GPS latitude is unavailable (NaN g_wgs84_mgal), fall back to
    a latitude-uncorrected proxy using only the tilt-compensated reading
    and the free-air correction, labelled anomaly_no_lat_mgal.
    """
    df["anomaly_proxy_mgal"] = (
        df["g_vert_mgal"]
        - df["g_wgs84_mgal"]
        + df["free_air_corr_mgal"]
    )

    # Fallback when no GPS fix
    df["anomaly_no_lat_mgal"] = df["g_vert_mgal"] + df["free_air_corr_mgal"]

    # Use full anomaly where available, fallback otherwise
    df["anomaly_best_mgal"] = df["anomaly_proxy_mgal"].where(
        df["g_wgs84_mgal"].notna(), df["anomaly_no_lat_mgal"]
    )

    return df


# ---------------------------------------------------------------------------
# Step 7 — Static-window filtering
# ---------------------------------------------------------------------------

def apply_static_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Retain only samples where platform_stationary == 1.
    Marks filtered rows with anomaly_static_mgal = NaN.
    """
    static_mask = df["platform_stationary"].fillna(0) == 1
    df["anomaly_static_mgal"] = df["anomaly_best_mgal"].where(static_mask, np.nan)
    df["static_mask"] = static_mask.astype(int)
    return df


# ---------------------------------------------------------------------------
# Step 8 — Moving-average smoothing
# ---------------------------------------------------------------------------

def smooth(df: pd.DataFrame, sample_rate_hz: float, window_s: float) -> pd.DataFrame:
    """
    Apply a centred moving-average over `window_s` seconds to the static anomaly.
    Only static samples contribute; NaN values are skipped by min_periods=1.

    The window is converted to the nearest odd number of samples so that the
    centred window is symmetric.
    """
    window_samples = int(round(window_s * sample_rate_hz))
    if window_samples % 2 == 0:
        window_samples += 1          # ensure odd → symmetric centred window
    window_samples = max(window_samples, 1)

    df["anomaly_smoothed_mgal"] = (
        df["anomaly_static_mgal"]
        .rolling(window=window_samples, center=True, min_periods=1)
        .mean()
    )

    df.attrs["smooth_window_samples"] = window_samples
    df.attrs["smooth_window_s"] = window_s
    return df


# ---------------------------------------------------------------------------
# Step 9 — MAD outlier rejection
# ---------------------------------------------------------------------------

def mad_rejection(df: pd.DataFrame, threshold: float = MAD_THRESHOLD) -> pd.DataFrame:
    """
    Reject outliers using the Median Absolute Deviation (MAD) of the
    smoothed static anomaly column.

    A sample is rejected if:
        |value − median| > threshold × MAD

    where MAD = median(|values − median(values)|).

    Rejected samples are set to NaN in anomaly_final_mgal.
    """
    vals = df["anomaly_smoothed_mgal"].dropna()

    if vals.empty:
        df["anomaly_final_mgal"] = np.nan
        df["outlier_flag"] = 0
        return df

    median_val = vals.median()
    mad = (vals - median_val).abs().median()

    if mad == 0:
        # All values identical — no outliers
        df["anomaly_final_mgal"] = df["anomaly_smoothed_mgal"]
        df["outlier_flag"] = 0
        return df

    z_mad = (df["anomaly_smoothed_mgal"] - median_val).abs() / mad
    outlier_mask = (z_mad > threshold) & df["anomaly_smoothed_mgal"].notna()

    df["outlier_flag"] = outlier_mask.astype(int)
    df["anomaly_final_mgal"] = df["anomaly_smoothed_mgal"].where(~outlier_mask, np.nan)

    return df


# ---------------------------------------------------------------------------
# Step 10 — Summary metrics
# ---------------------------------------------------------------------------

def compute_summary(
    df: pd.DataFrame,
    run_id: str,
    smooth_window_s: float,
    git_hash: str,
) -> dict[str, Any]:
    """
    Build a summary row dict for run_summary.csv.
    """
    n_raw    = len(df)
    n_static = int(df["static_mask"].sum()) if "static_mask" in df.columns else 0
    final    = df["anomaly_final_mgal"].dropna()
    n_final  = len(final)

    # Run duration from timestamps
    ts = df["timestamp_utc"].dropna()
    if len(ts) >= 2:
        duration_s = (ts.iloc[-1] - ts.iloc[0]).total_seconds()
    else:
        duration_s = n_raw / DEFAULT_SAMPLE_RATE_HZ

    parts = run_id.split("_")
    date_str = parts[0] if parts else ""

    return {
        "run_id":                run_id,
        "experiment_id":         df["experiment_id"].dropna().iloc[0] if "experiment_id" in df.columns and len(df) else "",
        "date":                  date_str,
        "location":              _location_from_run_id(run_id),
        "isolation_active":      int(df["isolation_active"].dropna().mode().iloc[0]) if "isolation_active" in df.columns and df["isolation_active"].notna().any() else "",
        "n_samples_raw":         n_raw,
        "n_samples_static":      n_static,
        "n_samples_after_mad":   n_final,
        "run_duration_s":        round(duration_s, 2),
        "anomaly_mean_mgal":     round(final.mean(), 4) if n_final else float("nan"),
        "anomaly_std_mgal":      round(final.std(),  4) if n_final > 1 else float("nan"),
        "anomaly_min_mgal":      round(final.min(),  4) if n_final else float("nan"),
        "anomaly_max_mgal":      round(final.max(),  4) if n_final else float("nan"),
        "mean_temp_mpu":         round(df["temp_mpu"].mean(), 2) if "temp_mpu" in df.columns else float("nan"),
        "gps_fix_fraction":      round((df["gps_fix_quality"].fillna(0) >= 1).mean(), 4),
        "smooth_window_s":       smooth_window_s,
        "mad_threshold":         MAD_THRESHOLD,
        "preprocessing_version": PIPELINE_VERSION,
        "git_hash":              git_hash,
        "processed_at_utc":      datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------

def export_processed(df: pd.DataFrame, raw_path: Path) -> Path:
    """Write the processed DataFrame to data/processed/<stem>_processed.csv."""
    PROC_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PROC_DIR / f"{raw_path.stem}_processed.csv"

    # Select output columns — keep all original cols plus computed ones
    extra_cols = [
        "pitch_deg", "roll_deg",
        "g_vert_g", "g_vert_ms2", "g_vert_mgal",
        "altitude_used_m", "free_air_corr_mgal",
        "g_wgs84_ms2", "g_wgs84_mgal",
        "anomaly_proxy_mgal", "anomaly_no_lat_mgal", "anomaly_best_mgal",
        "static_mask", "anomaly_static_mgal",
        "anomaly_smoothed_mgal",
        "outlier_flag", "anomaly_final_mgal",
    ]
    out_cols = list(df.columns) + [c for c in extra_cols if c in df.columns and c not in df.columns]
    # Deduplicate while preserving order
    seen: set[str] = set()
    out_cols = [c for c in out_cols if not (c in seen or seen.add(c))]  # type: ignore[func-returns-value]

    df.to_csv(out_path, index=False, columns=out_cols)
    return out_path


def upsert_summary(summary_row: dict[str, Any]) -> None:
    """
    Append or update a row in run_summary.csv.
    If a row with the same run_id already exists, it is replaced.
    """
    PROC_DIR.mkdir(parents=True, exist_ok=True)
    new_row = pd.DataFrame([summary_row], columns=SUMMARY_COLUMNS)

    if SUMMARY_CSV.exists():
        existing = pd.read_csv(SUMMARY_CSV)
        existing = existing[existing["run_id"] != summary_row["run_id"]]
        combined = pd.concat([existing, new_row], ignore_index=True)
    else:
        combined = new_row

    combined.to_csv(SUMMARY_CSV, index=False)


# ---------------------------------------------------------------------------
# Main pipeline function
# ---------------------------------------------------------------------------

def process_file(
    raw_path: Path,
    smooth_window_s: float = DEFAULT_SMOOTH_WINDOW_S,
    apply_static: bool = True,
    verbose: bool = True,
) -> dict[str, Any]:
    """
    Run the full pipeline for a single raw CSV file.
    Returns the summary dict.
    """
    git_hash = _git_hash()

    def log(msg: str) -> None:
        if verbose:
            print(msg)

    log(f"\n{'='*60}")
    log(f"  GADV Gravity Pipeline  v{PIPELINE_VERSION}")
    log(f"  Input  : {raw_path.name}")
    log(f"  Git    : {git_hash}")
    log(f"{'='*60}")

    # 1. Load and validate
    log("[1/9] Loading and validating schema ...")
    df = load_and_validate(raw_path)
    log(f"      {len(df):,} rows loaded. Schema OK.")

    # Detect sample rate
    sample_rate = _detect_sample_rate(df)
    log(f"      Detected sample rate: {sample_rate} Hz")

    # 2. Unit conversion
    log("[2/9] Converting accelerometer units: g → m/s² ...")
    df = convert_units(df)

    # 3. Tilt compensation
    log("[3/9] Applying tilt compensation ...")
    df = tilt_compensation(df)
    tilt_ok = df["g_vert_mgal"].notna().sum()
    log(f"      {tilt_ok:,} samples tilt-compensated.")

    # 4. Altitude correction
    log("[4/9] Applying free-air altitude correction (+0.3086 mGal/m) ...")
    df = altitude_correction(df)
    gps_frac = (df["gps_fix_quality"].fillna(0) >= 1).mean()
    log(f"      GPS fix available on {gps_frac:.1%} of samples.")
    if gps_frac < 0.5:
        log("      WARNING: <50% GPS fix — using barometric altitude for most samples.")

    # 5. Latitude correction
    log("[5/9] Computing WGS-84 Somigliana latitude correction ...")
    df = latitude_correction(df)

    # 6. Anomaly proxy
    log("[6/9] Computing gravity anomaly proxy [mGal] ...")
    df = compute_anomaly(df)

    # 7. Static filter
    if apply_static:
        log("[7/9] Applying platform_stationary filter ...")
        df = apply_static_filter(df)
        n_static = int(df["static_mask"].sum())
        log(f"      {n_static:,} / {len(df):,} samples pass static filter.")
        if n_static == 0:
            log("      WARNING: No static samples found. "
                "Check platform_stationary column or use --no-static-filter.")
    else:
        log("[7/9] Skipping static filter (--no-static-filter).")
        df["anomaly_static_mgal"] = df["anomaly_best_mgal"]
        df["static_mask"] = 1

    # 8. Smoothing
    log(f"[8/9] Applying moving-average smoothing ({smooth_window_s}s window) ...")
    df = smooth(df, sample_rate, smooth_window_s)

    # 9. MAD outlier rejection
    log(f"[9/9] MAD outlier rejection (threshold: {MAD_THRESHOLD}×MAD) ...")
    df = mad_rejection(df, MAD_THRESHOLD)
    n_outliers = int(df["outlier_flag"].sum()) if "outlier_flag" in df.columns else 0
    n_final    = int(df["anomaly_final_mgal"].notna().sum())
    log(f"      {n_outliers} outliers removed. {n_final:,} samples retained.")

    # Summary metrics
    summary = compute_summary(df, raw_path.stem, smooth_window_s, git_hash)
    log("")
    log("  ── Summary ───────────────────────────────────────")
    log(f"  Run          : {summary['run_id']}")
    log(f"  Experiment   : {summary['experiment_id']}")
    log(f"  Duration     : {summary['run_duration_s']} s")
    log(f"  Static N     : {summary['n_samples_static']:,} → MAD N: {summary['n_samples_after_mad']:,}")
    log(f"  Anomaly mean : {summary['anomaly_mean_mgal']} mGal")
    log(f"  Anomaly std  : {summary['anomaly_std_mgal']} mGal")
    log("  ──────────────────────────────────────────────────")

    # Export
    out_path = export_processed(df, raw_path)
    log(f"\n  Processed CSV : {out_path.relative_to(REPO_ROOT)}")

    upsert_summary(summary)
    log(f"  Run summary   : {SUMMARY_CSV.relative_to(REPO_ROOT)}")
    log("")

    return summary


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------

def process_batch(
    smooth_window_s: float = DEFAULT_SMOOTH_WINDOW_S,
    apply_static: bool = True,
    verbose: bool = True,
) -> list[dict[str, Any]]:
    """
    Process all CSV files in data/raw/ (excluding the template file).
    Returns a list of summary dicts.
    """
    csv_files = sorted(RAW_DIR.glob("*.csv"))
    skip_names = {"sample_log_template.csv"}
    csv_files = [f for f in csv_files if f.name not in skip_names]

    if not csv_files:
        print(f"No CSV files found in {RAW_DIR}")
        return []

    print(f"Found {len(csv_files)} file(s) to process.")
    summaries = []
    errors = []

    for path in csv_files:
        try:
            summary = process_file(path, smooth_window_s, apply_static, verbose)
            summaries.append(summary)
        except (FileNotFoundError, ValueError, KeyError) as exc:
            print(f"\n  ERROR processing {path.name}: {exc}")
            errors.append((path.name, str(exc)))

    print(f"\nBatch complete: {len(summaries)} succeeded, {len(errors)} failed.")
    if errors:
        print("Failed files:")
        for name, err in errors:
            print(f"  {name}: {err}")

    return summaries


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="GADV Gravity Pipeline — process raw sensor logs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "input",
        nargs="?",
        type=Path,
        help="Path to a single raw CSV file. Omit when using --batch.",
    )
    p.add_argument(
        "--batch",
        action="store_true",
        help="Process all CSV files in data/raw/ (excluding template).",
    )
    p.add_argument(
        "--smooth-window",
        type=float,
        default=DEFAULT_SMOOTH_WINDOW_S,
        metavar="SECONDS",
        help=f"Moving-average window in seconds (default: {DEFAULT_SMOOTH_WINDOW_S}).",
    )
    p.add_argument(
        "--no-static-filter",
        action="store_true",
        help="Skip the platform_stationary filter (use all samples).",
    )
    p.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress per-step progress output.",
    )
    return p


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    verbose = not args.quiet
    apply_static = not args.no_static_filter

    if args.batch:
        process_batch(
            smooth_window_s=args.smooth_window,
            apply_static=apply_static,
            verbose=verbose,
        )
    elif args.input:
        process_file(
            raw_path=args.input.resolve(),
            smooth_window_s=args.smooth_window,
            apply_static=apply_static,
            verbose=verbose,
        )
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
