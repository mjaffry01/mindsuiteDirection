'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');

// A stand-in for OpenRouter that records what it receives.
function mockOpenRouter(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
      const [status, payload] = handler(calls[calls.length - 1]);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((r) => server.listen(0, () => r({ server, calls, url: `http://127.0.0.1:${server.address().port}/api/v1` })));
}

async function withServer(fn, opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mso-'));
  const app = createApp({ dataDir, user: '', password: '', engineScheduler: false, ...opts });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
const send = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const lead = { company: 'Gulf Commercial Bank', contact: 'Aisha Khan', title: 'Head of Digital', email: 'aisha@gcb.ae', country: 'UAE', region: 'India', source: 'Event', date: '2027-01-04', interest: 'Applied AI' };

test('leads saved from the app are scored, get their region, and duplicates are refused', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/api/toolkit/leads`, send('POST', lead));
    const saved = await r.json();
    assert.equal(r.status, 201);
    assert.equal(saved.region, 'Gulf');
    assert.equal(saved.status, 'New');
    assert.ok(saved.score >= 60);
    const dup = await fetch(`${base}/api/toolkit/leads`, send('POST', { ...lead, company: 'Gulf Commercial Bank PJSC' }));
    assert.equal(dup.status, 409);
    assert.equal((await dup.json()).duplicateId, saved.id);
  });
});

test('team settings change the score and re-score existing leads', async () => {
  await withServer(async (base) => {
    const saved = await (await fetch(`${base}/api/toolkit/leads`, send('POST', { ...lead, industry: 'Banking' }))).json();
    const set = await (await fetch(`${base}/api/settings/sales`, send('PUT', { owners: ['Ravi', 'Sara'], industries: ['Banking'], priority: ['Gulf', 'Mars'] }))).json();
    assert.deepEqual(set.priority, ['Gulf']);
    const after = (await (await fetch(`${base}/api/toolkit`)).json()).leads.find((l) => l.id === saved.id);
    assert.ok(after.score > saved.score, 'industry match adds points');
    assert.match(after.scoreReasons, /Target industry/);
  });
});

test('sequences and activities are validated', async () => {
  await withServer(async (base) => {
    const saved = await (await fetch(`${base}/api/toolkit/leads`, send('POST', lead))).json();
    const bad = await fetch(`${base}/api/toolkit/leads/${saved.id}`, send('PUT', { ...saved, seq: { id: 'nope', step: 0, start: '2027-01-04' } }));
    assert.equal(bad.status, 400);
    const ok = await fetch(`${base}/api/toolkit/leads/${saved.id}`, send('PUT', { ...saved, seq: { id: 'gulf', step: 0, start: '2027-01-04' }, owner: 'Ravi' }));
    assert.equal(ok.status, 200);
    assert.equal((await fetch(`${base}/api/toolkit/activities`, send('POST', { leadId: saved.id, type: 'Replied', date: '2027-01-05' }))).status, 201);
    assert.equal((await fetch(`${base}/api/toolkit/activities`, send('POST', { leadId: 'missing', type: 'Replied', date: '2027-01-05' }))).status, 400);
    assert.equal((await fetch(`${base}/api/toolkit/activities`, send('POST', { leadId: saved.id, type: 'Carrier pigeon', date: '2027-01-05' }))).status, 400);
    const lib = await (await fetch(`${base}/api/outreach/library`)).json();
    assert.equal(Object.keys(lib.SEQ).length, 5);
  });
});

test('AI drafting is off until an OpenRouter key is set', async () => {
  await withServer(async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/ai/status`)).json(), { enabled: false, provider: 'OpenRouter', model: null, researchModel: null, keySource: null });
    const saved = await (await fetch(`${base}/api/toolkit/leads`, send('POST', lead))).json();
    const r = await fetch(`${base}/api/ai/draft`, send('POST', { leadId: saved.id }));
    assert.equal(r.status, 503);
  }, { openrouterKey: '' });
});

test('AI drafts go through OpenRouter with the key on the server only', async () => {
  const mock = await mockOpenRouter(() => [200, { model: 'test/model-1', choices: [{ message: { content: 'Hi Aisha, [draft]' } }] }]);
  try {
    await withServer(async (base) => {
      const status = await (await fetch(`${base}/api/ai/status`)).json();
      assert.deepEqual(status, { enabled: true, provider: 'OpenRouter', model: 'test/model-1', researchModel: 'test/model-1', keySource: 'company' });
      assert.ok(!JSON.stringify(status).includes('sk-or-test-secret'), 'status never reveals the key');
      const saved = await (await fetch(`${base}/api/toolkit/leads`, send('POST', lead))).json();
      const noStep = await fetch(`${base}/api/ai/draft`, send('POST', { leadId: saved.id }));
      assert.equal(noStep.status, 400);
      await fetch(`${base}/api/toolkit/leads/${saved.id}`, send('PUT', { ...saved, seq: { id: 'gulf', step: 2, start: '2027-01-04' }, owner: 'Ravi' }));
      const out = await (await fetch(`${base}/api/ai/draft`, send('POST', { leadId: saved.id }))).json();
      assert.equal(out.text, 'Hi Aisha, [draft]');
      assert.equal(out.model, 'test/model-1');
      assert.ok(!JSON.stringify(out).includes('sk-or-test-secret'));
      const call = mock.calls[0];
      assert.equal(call.url, '/api/v1/chat/completions');
      assert.equal(call.headers.authorization, 'Bearer sk-or-test-secret');
      assert.equal(call.body.model, 'test/model-1');
      assert.match(call.body.messages[1].content, /Gulf Commercial Bank/);
      assert.match(call.body.messages[1].content, /Email, Lead with the problem/);
    }, { openrouterKey: 'sk-or-test-secret', openrouterModel: 'test/model-1', openrouterBaseUrl: mock.url });
  } finally { mock.server.close(); }
});

test('OpenRouter errors become clear messages', async () => {
  const mock = await mockOpenRouter(() => [402, { error: { message: 'Insufficient credits' } }]);
  try {
    await withServer(async (base) => {
      const saved = await (await fetch(`${base}/api/toolkit/leads`, send('POST', lead))).json();
      await fetch(`${base}/api/toolkit/leads/${saved.id}`, send('PUT', { ...saved, seq: { id: 'inbound', step: 0, start: '2027-01-04' } }));
      const r = await fetch(`${base}/api/ai/draft`, send('POST', { leadId: saved.id }));
      assert.equal(r.status, 502);
      assert.match((await r.json()).error, /out of credits/);
    }, { openrouterKey: 'sk-or-test-secret', openrouterBaseUrl: mock.url });
  } finally { mock.server.close(); }
});
