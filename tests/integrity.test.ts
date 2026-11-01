import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsvContent, parseCsvRows } from "../app/server/csvProcessor";
import { runToRawCsv } from "../app/server/runProcessor";
import { getAnomalyValue } from "../app/client/src/lib/runStatistics";

const run = {
  experiment_id: "E1",
  run_id: "R1",
  points: [{
    timestamp: "2026-11-02T00:00:00Z",
    latitude: 28.67,
    longitude: 77.09,
    anomalyValue: -12,
  }],
};

test("run processing never fabricates missing sensor measurements or flags", () => {
  const row = parseCsvRows(runToRawCsv(run))[0];
  for (const missing of [
    "ax_raw", "ay_raw", "az_raw", "gx_raw", "gy_raw", "gz_raw",
    "temp_mpu", "temp_bmp", "pressure_hpa", "altitude_baro_m",
    "gps_alt_m", "gps_fix_quality", "gps_satellites",
    "platform_stationary", "isolation_active",
  ]) {
    assert.equal(row[missing], "", `${missing} should remain missing`);
  }
  assert.equal(row.gps_lat, "28.67");
  assert.equal(row.gps_lon, "77.09");
  assert.equal(row.timestamp_utc, "2026-11-02T00:00:00.000Z");
});

test("explicit sensor readings and zero/false flags survive processing unchanged", () => {
  const rows = parseCsvRows(runToRawCsv({
    experiment_id: "E1", run_id: "R2", points: [{
      timestamp: "2026-11-02T00:00:01Z", latitude: 28.67, longitude: 77.09,
      ax: 0, ay: -0.002, az: 0.997, pressure: 1001.5,
      platformStationary: false, fixQuality: 1, anomalyValue: 0,
      source_fields: {
        temp_mpu: "27.5", temp_bmp: "22.8", altitude_baro_m: "215.4",
        gps_alt_m: "216.7", isolation_active: "0",
      },
    }],
  }));
  assert.equal(rows[0].ax_raw, "0");
  assert.equal(rows[0].az_raw, "0.997");
  assert.equal(rows[0].pressure_hpa, "1001.5");
  assert.equal(rows[0].platform_stationary, "0");
  assert.equal(rows[0].gps_fix_quality, "1");
  assert.equal(rows[0].isolation_active, "0");
  assert.equal(rows[0].altitude_baro_m, "215.4");
  assert.equal(rows[0].gps_alt_m, "216.7");
  assert.equal(rows[0].temp_mpu, "27.5");
  assert.equal(rows[0].temp_bmp, "22.8");
});

test("an absent or invalid timestamp never turns into wall-clock time", () => {
  assert.throws(() => runToRawCsv({ ...run, points: [{ timestamp: "", latitude: 28, longitude: 77 }] }), /sample 1.*no timestamp/);
  assert.throws(() => runToRawCsv({ ...run, points: [{ timestamp: "not a date", latitude: 28, longitude: 77 }] }), /sample 1.*invalid timestamp/);
});

test("a rejected final anomaly never falls back to a less-corrected column", () => {
  const header = "timestamp,gps_lat,gps_lon,anomaly_final_mgal,anomaly_best_mgal,anomaly_value_mgal";
  const prefix = "2026-11-02T00:00:00Z,28.67,77.09,";
  assert.throws(
    () => parseCsvContent(`${header}\n${prefix},999,123\n`, "missing-final.csv"),
    /anomaly_final_mgal/,
  );
  const accepted = parseCsvContent(`${header}\n${prefix}0,999,123\n`, "valid-final.csv");
  assert.equal(accepted.points[0].anomalyValue, 0);
  assert.throws(
    () => parseCsvContent("timestamp,gps_lat,gps_lon,anomaly_best_mgal,anomaly_value_mgal\n2026-11-02,28.67,77.09,,123\n", "missing-best.csv"),
    /anomaly_best_mgal/,
  );
});

test("run statistics never treat an intermediate smoothed value as a final anomaly", () => {
  assert.equal(getAnomalyValue({ anomalyValue: NaN, anomalySmoothed: 19 } as any), null);
  assert.equal(getAnomalyValue({ anomalyValue: undefined, anomalySmoothed: 19 } as any), null);
  assert.equal(getAnomalyValue({ anomalyValue: -3, anomalySmoothed: 19 } as any), -3);
});
