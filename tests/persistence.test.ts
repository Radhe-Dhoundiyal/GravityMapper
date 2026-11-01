import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseCsvContent, parseCsvRows } from "../app/server/csvProcessor";

test("CSV parsing preserves quoted source fields and negative values", () => {
  const csv = '\uFEFFexperiment_id,run_id,timestamp,gps_lat,gps_lon,anomaly_final_mgal,notes\r\nE1,R1,2026-01-01T00:00:00Z,28,77,-120,"note, with ""quotes"""\r\n';
  const parsed = parseCsvContent(csv, "example.csv");
  assert.equal(parsed.points[0].anomalyValue, -120);
  assert.equal(parsed.points[0].source_fields.notes, 'note, with "quotes"');
  assert.throws(() => parseCsvRows('a,a\n1,2'));
  assert.throws(() => parseCsvContent('timestamp,gps_lat,gps_lon,anomaly_final_mgal\nbad,28,77,-1', 'bad.csv'));
  assert.throws(() => parseCsvContent('run_id,timestamp,gps_lat,gps_lon,anomaly_final_mgal\nA,2026-01-01,28,77,1\nB,2026-01-01,28,77,2', 'mixed.csv'));
});

test("PostgreSQL transactions, API persistence, originals, conflicts, and authentication", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /_test$/, "Use a dedicated *_test database");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.GADV_WRITE_TOKEN = randomUUID() + randomUUID();
  const { pool } = await import("../app/server/database");
  const { migrateDatabase } = await import("../app/server/migrate");
  const { registerRoutes } = await import("../app/server/routes");
  const { runStorage, PostgresRunStorage } = await import("../app/server/runStorage");
  const { sensorDataPointSchema } = await import("../app/shared/schema");
  await migrateDatabase();
  await migrateDatabase();
  const prefix = `test-${randomUUID()}`;
  const runId = `${prefix}-run`, exp = `${prefix}-experiment`;
  const app = express(); app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const original = `experiment_id,run_id,device_id,timestamp,gps_lat,gps_lon,anomaly_final_mgal,quality_note\r\n${exp},${runId},device,2026-07-20T01:45:00Z,28.6715449,77.0947035,-2703.34,"comma, preserved"\r\n`;
  const upload = async (csv = original, authorized = true, filename = 'source.csv') => {
    const form = new FormData(); form.append('file', new Blob([csv]), filename);
    form.append('reported_origin', 'User-reported field measurements');
    return fetch(base + '/api/upload-csv', { method: 'POST', headers: authorized ? { Authorization: `Bearer ${process.env.GADV_WRITE_TOKEN}` } : {}, body: form });
  };
  try {
    await t.test('unauthorized uploads and mutations are rejected', async () => {
      assert.equal((await upload(original, false)).status, 401);
      assert.equal((await fetch(base + '/api/anomaly-points', { method: 'DELETE' })).status, 401);
      const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
      await new Promise<void>(resolve => ws.addEventListener('open', () => resolve()));
      const rejected = new Promise<any>(resolve => ws.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.type === 'error') resolve(data); }));
      ws.send(JSON.stringify({ type: 'newAnomalyPoint', data: { latitude: 28, longitude: 77, anomalyValue: 1, timestamp: new Date().toISOString() } }));
      assert.match((await rejected).message, /token/); ws.close();
    });
    await t.test('upload commits original bytes and observations', async () => {
      const response = await upload(); assert.equal(response.status, 200);
      const result = await response.json(); assert.equal(result.saved, true); assert.equal(result.duplicate, false);
      const bytes = await fetch(`${base}/api/runs/${runId}/original.csv`);
      assert.equal(await bytes.text(), original);
      const stored = await runStorage.getRun(exp, runId);
      assert.equal(stored.points[0].timestamp, '2026-07-20T01:45:00Z');
      assert.equal(stored.points[0].anomalyValue, -2703.34);
      assert.equal(stored.provenance?.independently_verified, false);
    });
    await t.test('separate client loads and storage instance read PostgreSQL', async () => {
      const a = await (await fetch(base + '/api/runs')).json();
      const b = await new PostgresRunStorage().listRuns();
      assert.equal(a.find((run: any) => run.run_id === runId).points.length, 1);
      assert.equal(b.find(run => run.run_id === runId)?.points.length, 1);
    });
    await t.test('duplicate and concurrent uploads are idempotent', async () => {
      const response = await upload(); assert.equal((await response.json()).duplicate, true);
      const responses = await Promise.all([upload(), upload()]);
      for (const response of responses) { assert.equal(response.status, 200); assert.equal((await response.json()).duplicate, true); }
      assert.equal((await runStorage.getRun(exp, runId)).points.length, 1);
    });
    await t.test('changed measurements conflict and roll back', async () => {
      const response = await upload(original.replace('-2703.34', '999'));
      assert.equal(response.status, 409);
      assert.equal((await runStorage.getRun(exp, runId)).points[0].anomalyValue, -2703.34);
    });
    await t.test('invalid CSV never produces a saved run', async () => {
      assert.equal((await upload(original.replace('28.6715449', '999'))).status, 400);
      assert.equal((await upload(original, true, 'invalid.txt')).status, 400);
    });
    await t.test('metadata and assignments persist independently of source IDs', async () => {
      await runStorage.updateExperimentMetadata(exp + '-assigned', { name: 'Assigned' });
      await runStorage.updateRunMetadata(exp, runId, { notes: 'retained note', assigned_experiment_id: exp + '-assigned' });
      const run = (await new PostgresRunStorage().listRuns()).find(run => run.run_id === runId)!;
      assert.equal(run.experiment_id, exp); assert.equal(run.assigned_experiment_id, exp + '-assigned');
      assert.equal(run.experiment_metadata?.name, 'Assigned'); assert.equal(run.run_metadata?.notes, 'retained note');
    });
    await t.test('telemetry retries do not duplicate or overwrite observations', async () => {
      const raw = { experiment_id: exp, run_id: prefix + '-live', device_id: 'device', latitude: 28, longitude: 77, timestamp: '2026-01-01T00:00:00Z', anomalyValue: 1 };
      const point = sensorDataPointSchema.parse(raw);
      await runStorage.appendTelemetryPoint(point, raw); await runStorage.appendTelemetryPoint(point, raw);
      assert.equal((await runStorage.getRun(exp, raw.run_id)).points.length, 1);
      await assert.rejects(() => runStorage.appendTelemetryPoint({ ...point, anomalyValue: 2 }, { ...raw, anomalyValue: 2 }));
    });
    await t.test('raw CSV processing retains the exact source file', async () => {
      const template = await readFile(new URL('../data/raw/sample_log_template.csv', import.meta.url), 'utf8');
      const csv = template.replaceAll('2025-04-01_E1_lab-bench_run01', prefix + '-raw').replaceAll(',E1,', `,${exp},`);
      const response = await upload(csv); assert.equal(response.status, 200);
      const result = await response.json(); assert.equal(result.source, 'raw'); assert.equal(result.saved, true);
      assert.equal(await (await fetch(`${base}/api/runs/${prefix}-raw/original.csv`)).text(), csv);
    });
    await t.test('Process Run saves derived output without replacing observations', async () => {
      const before = await runStorage.getRun(exp, prefix + '-live');
      const response = await fetch(base + '/api/process-run', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GADV_WRITE_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ experiment_id: exp, run_id: prefix + '-live' }) });
      assert.equal(response.status, 200);
      const after = await runStorage.getRun(exp, prefix + '-live');
      assert.deepEqual(after.points, before.points);
      assert.ok(after.processed_points?.length);
      assert.equal(after.processing_status, 'processed');
    });
    await t.test('database failures do not acknowledge a save', async () => {
      const client = await pool!.connect();
      await client.query('ALTER TABLE gm_uploads RENAME TO gm_uploads_offline');
      try { assert.notEqual((await upload(original.replaceAll(runId, prefix + '-failed'))).status, 200); }
      finally { await client.query('ALTER TABLE gm_uploads_offline RENAME TO gm_uploads'); client.release(); }
      assert.equal((await runStorage.listRuns()).some(run => run.run_id === prefix + '-failed'), false);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool!.query('DELETE FROM gm_uploads WHERE run_id LIKE $1', [prefix + '%']);
    await pool!.query('DELETE FROM gm_runs WHERE id LIKE $1', [prefix + '%']);
    await pool!.query('DELETE FROM gm_experiments WHERE id LIKE $1', [prefix + '%']);
    await pool!.end();
  }
});
