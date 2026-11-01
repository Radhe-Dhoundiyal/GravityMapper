import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseCsvContent, parseCsvRows } from "../app/server/csvProcessor";
import { publicRun, publicTelemetryPoint } from "../app/server/publicData";

test("CSV parsing preserves quoted source fields and negative values", () => {
  const csv = '\uFEFFexperiment_id,run_id,timestamp,gps_lat,gps_lon,anomaly_final_mgal,notes\r\nE1,R1,2026-01-01T00:00:00Z,28,77,-120,"note, with ""quotes"""\r\n';
  const parsed = parseCsvContent(csv, "example.csv");
  assert.equal(parsed.points[0].anomalyValue, -120);
  assert.equal(parsed.points[0].source_fields.notes, 'note, with "quotes"');
  assert.throws(() => parseCsvRows('a,a\n1,2'));
  assert.throws(() => parseCsvContent('timestamp,gps_lat,gps_lon,anomaly_final_mgal\nbad,28,77,-1', 'bad.csv'));
  assert.throws(() => parseCsvContent('run_id,timestamp,gps_lat,gps_lon,anomaly_final_mgal\nA,2026-01-01,28,77,1\nB,2026-01-01,28,77,2', 'mixed.csv'));
});

test("public projections allow only dashboard fields", () => {
  const point = { latitude: 28, longitude: 77, anomalyValue: -12, timestamp: '2026-01-01T00:00:00Z', device_id: 'private-device', notes: 'private-note', source_fields: { private_column: 'private-value' }, source_observation: { token: 'private-token' } };
  const result = publicRun({ experiment_id: 'E1', run_id: 'R1', device_id: 'private-device', start_time: point.timestamp,
    source_sha256: 'private-hash', provenance: { reported_origin: 'private-origin', independently_verified: false },
    run_metadata: { notes: 'private-note' }, experiment_metadata: { name: 'Public name', operator: 'private-operator' },
    points: [point], processed_points: [point] });
  assert.equal(result.points[0].anomalyValue, -12);
  assert.equal(result.experiment_metadata.name, 'Public name');
  assert.equal(JSON.stringify(result).includes('private-'), false);
  assert.equal(publicTelemetryPoint(point).source_fields, undefined);
  assert.equal(point.source_fields.private_column, 'private-value');
});

test("PostgreSQL transactions, API persistence, originals, conflicts, and authentication", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /_test$/, "Use a dedicated *_test database");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.GADV_WRITE_TOKEN = randomUUID() + randomUUID();
  const adminHeaders = () => ({ Authorization: `Bearer ${process.env.GADV_WRITE_TOKEN}` });
  const { pool } = await import("../app/server/database");
  const { migrateDatabase } = await import("../app/server/migrate");
  const { registerRoutes } = await import("../app/server/routes");
  const { runStorage, PostgresRunStorage } = await import("../app/server/runStorage");
  const { sensorDataPointSchema } = await import("../app/shared/schema");
  await migrateDatabase();
  await migrateDatabase();
  const prefix = `test-${randomUUID()}`;
  const runId = `${prefix}-run`, exp = `${prefix}-experiment`;
  const deviceId = `${prefix}-device`, deviceToken = randomUUID() + randomUUID();
  const otherDeviceId = `${prefix}-other-device`, otherDeviceToken = randomUUID() + randomUUID();
  process.env.GADV_DEVICE_TOKENS = JSON.stringify({ [deviceId]: deviceToken, [otherDeviceId]: otherDeviceToken });
  const deviceHeaders = { Authorization: `Bearer ${deviceToken}`, 'Content-Type': 'application/json' };
  const devicePoint = { device_id: deviceId, experiment_id: exp, run_id: prefix + '-http-device', timestamp: '2026-01-01T00:00:00Z', latitude: 28, longitude: 77, anomalyValue: 1, source_fields: { private_column: 'private-value' } };
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
  async function websocketExchange(packet: Record<string, any>) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
    const messages: Record<string, any>[] = [];
    let timeout: ReturnType<typeof setTimeout>;
    try {
      await new Promise<void>((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('WebSocket response timed out')), 15000);
        ws.addEventListener('open', () => ws.send(JSON.stringify(packet)));
        ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
        ws.addEventListener('message', event => {
          const message = JSON.parse(String(event.data)); messages.push(message);
          if (['saved', 'error', 'dataCleared'].includes(message.type)) resolve();
        });
      });
      return messages;
    } finally { clearTimeout(timeout!); ws.close(); }
  }
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
      const bytes = await fetch(`${base}/api/runs/${runId}/original.csv`, { headers: adminHeaders() });
      assert.equal(await bytes.text(), original);
      assert.match(bytes.headers.get('cache-control')!, /no-store/);
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
    await t.test('original downloads reject anonymous, invalid, device, query-token, and HEAD access', async () => {
      const url = `${base}/api/runs/${runId}/original.csv`;
      for (const headers of [{}, { Authorization: 'Bearer invalid' }, deviceHeaders]) assert.equal((await fetch(url, { headers })).status, 401);
      assert.equal((await fetch(url, { method: 'HEAD' })).status, 401);
      assert.equal((await fetch(url + '?token=' + process.env.GADV_WRITE_TOKEN)).status, 401);
      assert.equal((await fetch(url, { headers: adminHeaders(), method: 'HEAD' })).status, 200);
    });
    await t.test('ESP32 bare HTTP and Wokwi wrapped telemetry accept per-device credentials', async () => {
      const bare = await fetch(base + '/api/telemetry', { method: 'POST', headers: deviceHeaders, body: JSON.stringify(devicePoint) });
      assert.equal(bare.status, 200); assert.equal((await bare.json()).saved, true);
      const wrapped = await fetch(base + '/api/telemetry', { method: 'POST', headers: deviceHeaders,
        body: JSON.stringify({ type: 'newAnomalyPoint', data: { ...devicePoint, run_id: prefix + '-wokwi', runMode: 'simulated' } }) });
      assert.equal(wrapped.status, 200);
      assert.equal((await runStorage.getRun(exp, prefix + '-wokwi')).mode, 'simulated');
      assert.equal((await runStorage.getRun(exp, devicePoint.run_id)).points.length, 1);
    });
    await t.test('device credentials cannot impersonate other devices or append to another device run', async () => {
      const impersonated = await fetch(base + '/api/telemetry', { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ ...devicePoint, device_id: otherDeviceId }) });
      assert.equal(impersonated.status, 401);
      const conflict = await fetch(base + '/api/telemetry', { method: 'POST', headers: { ...deviceHeaders, Authorization: `Bearer ${otherDeviceToken}` }, body: JSON.stringify({ ...devicePoint, device_id: otherDeviceId }) });
      assert.equal(conflict.status, 409);
      const imported = await fetch(base + '/api/telemetry', { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ ...devicePoint, run_id: runId }) });
      assert.equal(imported.status, 409);
      assert.equal((await runStorage.getRun(exp, runId)).points[0].anomalyValue, -2703.34);
    });
    await t.test('device WebSocket telemetry persists and broadcasts only dashboard fields', async () => {
      const messages = await websocketExchange({ type: 'newAnomalyPoint', token: deviceToken, data: { ...devicePoint, run_id: prefix + '-ws-device' } });
      assert.equal(messages.at(-1)?.type, 'saved');
      const broadcast = messages.find(message => message.type === 'newAnomalyPoint')!;
      assert.equal(broadcast.data.run_id, prefix + '-ws-device'); assert.equal(broadcast.data.anomalyValue, 1);
      assert.equal(broadcast.data.device_id, undefined); assert.equal(broadcast.data.source_fields, undefined);
      assert.equal(broadcast.data.source_observation, undefined);
      const stored = await runStorage.getRun(exp, prefix + '-ws-device');
      assert.equal(stored.points.length, 1); assert.equal(stored.points[0].source_fields?.private_column, 'private-value');
      const publicStored = (await (await fetch(base + '/api/runs')).json()).find((run: any) => run.run_id === prefix + '-ws-device');
      assert.equal(publicStored.points[0].source_observation, undefined);
      const clear = await websocketExchange({ type: 'clearData', token: deviceToken });
      assert.equal(clear.at(-1)?.type, 'error'); assert.match(clear.at(-1)?.message, /administrative token/);
      const adminClear = await websocketExchange({ type: 'clearData', token: process.env.GADV_WRITE_TOKEN });
      assert.equal(adminClear.at(-1)?.type, 'dataCleared');
      assert.equal((await runStorage.getRun(exp, prefix + '-ws-device')).points.length, 1);
    });
    await t.test('device tokens cannot upload, process, edit metadata, delete, or write legacy history', async () => {
      for (const [method, path] of [['POST', '/api/upload-csv'], ['POST', '/api/process-run'], ['PATCH', `/api/runs/${exp}/${runId}/metadata`], ['PATCH', `/api/experiments/${exp}/metadata`], ['DELETE', `/api/experiments/${exp}`], ['DELETE', '/api/anomaly-points'], ['POST', '/api/anomaly-points']]) {
        assert.equal((await fetch(base + path, { method, headers: deviceHeaders, ...(method !== 'DELETE' ? { body: '{}' } : {}) })).status, 401);
      }
    });
    await t.test('device telemetry works without an administrative token; original downloads remain closed', async () => {
      const admin = process.env.GADV_WRITE_TOKEN;
      delete process.env.GADV_WRITE_TOKEN;
      try {
        const response = await fetch(base + '/api/telemetry', { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ ...devicePoint, run_id: prefix + '-device-only' }) });
        assert.equal(response.status, 200);
        assert.equal((await fetch(`${base}/api/runs/${runId}/original.csv`, { headers: deviceHeaders })).status, 503);
      } finally { process.env.GADV_WRITE_TOKEN = admin; }
    });
    await t.test('malformed or short device credentials fail closed without breaking admin telemetry', async () => {
      const configuration = process.env.GADV_DEVICE_TOKENS;
      try {
        for (const value of ['{invalid', JSON.stringify({ [deviceId]: 'short' }), 'null']) {
          process.env.GADV_DEVICE_TOKENS = value;
          assert.equal((await fetch(base + '/api/telemetry', { method: 'POST', headers: deviceHeaders, body: JSON.stringify(devicePoint) })).status, 401);
        }
        assert.equal((await fetch(base + '/api/telemetry', { method: 'POST', headers: { ...adminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...devicePoint, run_id: prefix + '-admin-telemetry' }) })).status, 200);
      } finally { process.env.GADV_DEVICE_TOKENS = configuration; }
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
      await runStorage.updateExperimentMetadata(exp + '-assigned', { name: 'Assigned', operator: 'private-operator', notes: 'private-notes' });
      await runStorage.updateRunMetadata(exp, runId, { notes: 'retained note', assigned_experiment_id: exp + '-assigned' });
      const run = (await new PostgresRunStorage().listRuns()).find(run => run.run_id === runId)!;
      assert.equal(run.experiment_id, exp); assert.equal(run.assigned_experiment_id, exp + '-assigned');
      assert.equal(run.experiment_metadata?.name, 'Assigned'); assert.equal(run.run_metadata?.notes, 'retained note');
    });
    await t.test('public runs and experiments omit private metadata; admin reads retain full access', async () => {
      const response = await fetch(base + '/api/runs');
      const stored = (await response.json()).find((run: any) => run.run_id === runId);
      assert.equal(stored.points.length, 1); assert.equal(stored.points[0].anomalyValue, -2703.34);
      assert.equal(stored.device_id, undefined); assert.equal(stored.source_sha256, undefined);
      assert.equal(stored.provenance, undefined); assert.equal(stored.run_metadata, undefined);
      assert.equal(stored.points[0].source_fields, undefined); assert.equal(stored.points[0].device_id, undefined);
      assert.deepEqual(stored.experiment_metadata, { name: 'Assigned' });
      assert.match(response.headers.get('cache-control')!, /no-store/);
      assert.match(response.headers.get('vary')!, /Authorization/);
      const publicExperiments = await (await fetch(base + '/api/experiments')).json();
      assert.equal(publicExperiments.find((item: any) => item.experiment_id === exp + '-assigned').operator, undefined);
      const full = (await (await fetch(base + '/api/runs', { headers: adminHeaders() })).json()).find((run: any) => run.run_id === runId);
      assert.equal(full.device_id, 'device'); assert.equal(full.run_metadata.notes, 'retained note');
      assert.equal(full.experiment_metadata.operator, 'private-operator'); assert.equal(full.points[0].source_fields.quality_note, 'comma, preserved');
      const deviceView = (await (await fetch(base + '/api/runs', { headers: deviceHeaders })).json()).find((run: any) => run.run_id === runId);
      assert.equal(deviceView.points[0].source_fields, undefined);
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
      assert.equal(await (await fetch(`${base}/api/runs/${prefix}-raw/original.csv`, { headers: adminHeaders() })).text(), csv);
    });
    await t.test('Process Run refuses incomplete sensor input without replacing observations', async () => {
      // This telemetry has coordinates and a reported anomaly, but no
      // accelerometer triad, GPS-fix quality, or measured altitude.
      const before = await runStorage.getRun(exp, prefix + '-live');
      const response = await fetch(base + '/api/process-run', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GADV_WRITE_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ experiment_id: exp, run_id: prefix + '-live' }) });
      assert.notEqual(response.status, 200, "Incomplete input must not produce a processed anomaly");
      const after = await runStorage.getRun(exp, prefix + '-live');
      assert.deepEqual(after.points, before.points);
      assert.equal(after.processed_points, undefined);
      assert.notEqual(after.processing_status, 'processed');
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
