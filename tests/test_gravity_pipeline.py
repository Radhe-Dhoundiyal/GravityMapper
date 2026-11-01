"""Regression checks: missing source measurements must never yield anomalies."""

import unittest

import numpy as np
import pandas as pd

from analysis.scripts import gravity_pipeline as gp


class GravityIntegrityTests(unittest.TestCase):
    def _frame(self):
        return pd.DataFrame({
            "gps_lat": [28.67, 28.67, np.nan, 28.67],
            "gps_lon": [77.09, 77.09, 77.09, 77.09],
            "gps_fix_quality": [1, 0, 1, 1],
            "g_vert_mgal": [980000.0, 980000.0, 980000.0, np.nan],
            "free_air_corr_mgal": [66.0, 66.0, 66.0, 66.0],
            "platform_stationary": [1, 1, 1, 1],
        })

    def test_only_complete_corrected_anomalies_are_preferred(self):
        df = self._frame()
        gp.latitude_correction(df)
        gp.compute_anomaly(df)

        self.assertTrue(np.isfinite(df.loc[0, "anomaly_proxy_mgal"]))
        self.assertAlmostEqual(
            df.loc[0, "anomaly_proxy_mgal"],
            df.loc[0, "g_vert_mgal"] - df.loc[0, "g_wgs84_mgal"] + 66.0,
        )

        # Missing fix, latitude or vertical sensor output disqualifies the
        # corrected anomaly, even if the diagnostic proxy is finite.
        for index in (1, 2, 3):
            self.assertTrue(pd.isna(df.loc[index, "anomaly_best_mgal"]))
        self.assertTrue(np.isfinite(df.loc[1, "anomaly_no_lat_mgal"]))
        self.assertTrue(np.isfinite(df.loc[2, "anomaly_no_lat_mgal"]))

    def test_smoothing_never_fills_missing_or_nonstationary_samples(self):
        df = self._frame()
        gp.latitude_correction(df)
        gp.compute_anomaly(df)
        df["platform_stationary"] = [1, 1, 1, 0]
        gp.apply_static_filter(df)
        gp.smooth(df, sample_rate_hz=1, window_s=3)
        gp.mad_rejection(df)

        self.assertTrue(np.isfinite(df.loc[0, "anomaly_final_mgal"]))
        for index in (1, 2, 3):
            self.assertTrue(pd.isna(df.loc[index, "anomaly_smoothed_mgal"]))
            self.assertTrue(pd.isna(df.loc[index, "anomaly_final_mgal"]))

    def test_zero_or_missing_accelerometer_values_are_not_replaced(self):
        df = pd.DataFrame({
            "ax_raw": [0.0, 0.0],
            "ay_raw": [0.0, 0.0],
            "az_raw": [1.0, np.nan],
        })
        gp.tilt_compensation(df)
        self.assertTrue(np.isfinite(df.loc[0, "g_vert_mgal"]))
        self.assertTrue(pd.isna(df.loc[1, "g_vert_mgal"]))

    def test_no_gps_fix_is_not_inferred_from_coordinates(self):
        df = pd.DataFrame({
            "gps_lat": [28.67, 28.67, 95.0],
            "gps_lon": [77.09, np.nan, 77.09],
            "gps_fix_quality": [0, 1, 1],
        })
        gp.latitude_correction(df)
        self.assertTrue(df["g_wgs84_mgal"].isna().all())


if __name__ == "__main__":
    unittest.main()
