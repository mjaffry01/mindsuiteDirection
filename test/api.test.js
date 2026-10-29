'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');
const { snapToMonday } = require('../src/plan');

async function withServer(fn, opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms365-'));
  const app = createApp({ dataDir, user: '', password: '', engineScheduler: false, ...opts });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, dataDir);
  } finally {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('serves the 365-day plan', async () => {
  await withServer(async (base) => {
    const plan = await (await fetch(`${base}/api/plan`)).json();
    assert.equal(plan.days.length, 365);
    assert.equal(plan.deps.length, 10);
  });
});

test('ticking a task is saved to disk and reported in progress', async () => {
  await withServer(async (base, dataDir) => {
    const put = await fetch(`${base}/api/tasks/1-0`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"done":true}' });
    assert.equal(put.status, 200);
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.done['1-0'], 1);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
    assert.equal(onDisk.done['1-0'], 1);
    const prog = await (await fetch(`${base}/api/progress`)).json();
    assert.equal(prog.done, 1);
    await fetch(`${base}/api/tasks/1-0`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"done":false}' });
    const after = await (await fetch(`${base}/api/state`)).json();
    assert.equal(after.done['1-0'], undefined);
  });
});

test('rejects unknown tasks and bad input', async () => {
  await withServer(async (base) => {
    const unknown = await fetch(`${base}/api/tasks/999-0`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"done":true}' });
    assert.equal(unknown.status, 404);
    const bad = await fetch(`${base}/api/tasks/1-0`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"done":"yes"}' });
    assert.equal(bad.status, 400);
    const badJson = await fetch(`${base}/api/tasks/1-0`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(badJson.status, 400);
  });
});

test('start date snaps to the Monday of that week', async () => {
  assert.equal(snapToMonday('2026-11-05'), '2026-11-02');
  assert.equal(snapToMonday('2026-02-30'), null);
  await withServer(async (base) => {
    const res = await (await fetch(`${base}/api/state/start`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"start":"2027-01-07"}' })).json();
    assert.equal(res.start, '2027-01-04');
  });
});

test('basic auth protects the app when configured', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/plan`)).status, 401);
    const ok = await fetch(`${base}/api/plan`, { headers: { Authorization: 'Basic ' + Buffer.from('director:secret').toString('base64') } });
    assert.equal(ok.status, 200);
  }, { user: 'director', password: 'secret' });
});

test('toolkit records can be created, edited and deleted', async () => {
  await withServer(async (base, dataDir) => {
    const json = { 'Content-Type': 'application/json' };
    const created = await fetch(`${base}/api/toolkit/deals`, { method: 'POST', headers: json, body: JSON.stringify({ company: 'Acme', region: 'Gulf', service: 'Applied AI', value: 450, stage: 'Proposal' }) });
    assert.equal(created.status, 201);
    const deal = await created.json();
    const edited = await fetch(`${base}/api/toolkit/deals/${deal.id}`, { method: 'PUT', headers: json, body: JSON.stringify({ ...deal, stage: 'Negotiation' }) });
    assert.equal((await edited.json()).stage, 'Negotiation');
    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'toolkit.json'), 'utf8'));
    assert.equal(onDisk.deals[0].stage, 'Negotiation');
    const sum = await (await fetch(`${base}/api/toolkit/summary`)).json();
    assert.equal(sum.pipeline.open, 450);
    await fetch(`${base}/api/toolkit/deals/${deal.id}`, { method: 'DELETE' });
    assert.equal((await (await fetch(`${base}/api/toolkit`)).json()).deals.length, 0);
  });
});

test('toolkit rejects bad records', async () => {
  await withServer(async (base) => {
    const json = { 'Content-Type': 'application/json' };
    const missing = await fetch(`${base}/api/toolkit/deals`, { method: 'POST', headers: json, body: JSON.stringify({ region: 'Gulf' }) });
    assert.equal(missing.status, 400);
    const badRegion = await fetch(`${base}/api/toolkit/leads`, { method: 'POST', headers: json, body: JSON.stringify({ company: 'X', region: 'Mars', source: 'Event', date: '2027-01-05' }) });
    assert.equal(badRegion.status, 400);
    const sentless = await fetch(`${base}/api/toolkit/proposals`, { method: 'POST', headers: json, body: JSON.stringify({ company: 'X', value: 10, service: 'ERP', requested: '2027-01-05', status: 'Sent' }) });
    assert.equal(sentless.status, 400);
    const unknown = await fetch(`${base}/api/toolkit/secrets`, { method: 'POST', headers: json, body: '{}' });
    assert.equal(unknown.status, 404);
  });
});

test('proposal turnaround counts working days only', () => {
  const { workingDays } = require('../src/toolkit');
  assert.equal(workingDays('2027-01-08', '2027-01-11'), 1);
  assert.equal(workingDays('2027-01-04', '2027-01-07'), 3);
});

test('every department has a definition and KPIs, and all 176 services are assigned once', async () => {
  await withServer(async (base) => {
    const deps = await (await fetch(`${base}/api/departments`)).json();
    assert.equal(deps.length, 10);
    for (const d of deps) {
      assert.ok(d.def && d.def.summary, `${d.id} has a definition`);
      assert.ok(d.def.kpis.length >= 6, `${d.id} has KPIs`);
    }
    const services = deps.flatMap((d) => (d.def.services || []).flatMap((g) => g[1]));
    assert.equal(services.length, 176);
    assert.equal(new Set(services).size, 176);
  });
});
