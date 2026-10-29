'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');

// Stand-in OpenRouter: records which key each request used.
function mockOpenRouter() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/api/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'b-vendor/fast', name: 'B Fast', context_length: 128000, pricing: { prompt: '0.0000002', completion: '0.0000008' } }, { id: 'a-vendor/smart', name: 'A Smart', pricing: { prompt: '0.000003', completion: '0.000015' } }] }));
      }
      const j = JSON.parse(body || '{}');
      calls.push({ auth: req.headers.authorization, model: j.model, plugins: j.plugins });
      if (req.headers.authorization === 'Bearer sk-or-revoked-key-0000000000') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{}'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: j.model, choices: [{ message: { content: j.plugins ? '[]' : 'OK draft' } }] }));
    });
  });
  return new Promise((r) => server.listen(0, () => r({ server, calls, url: `http://127.0.0.1:${server.address().port}/api/v1` })));
}
async function withApp(opts, fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msm-'));
  const app = createApp({ dataDir, engineScheduler: false, user: '', password: '', ...opts });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, dataDir); } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
const as = (who) => ({ Authorization: 'Basic ' + Buffer.from(`${who}:${who.toLowerCase()}-pw`).toString('base64') });
const req = (method, who, body) => ({ method, headers: { 'Content-Type': 'application/json', ...as(who) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const RAVI_KEY = 'sk-or-ravi-personal-key-1111111111';

test('each rep signs in with their own account', async () => {
  await withApp({ users: 'Ravi:ravi-pw,Sara:sara-pw' }, async (base) => {
    assert.equal((await fetch(`${base}/api/me`)).status, 401);
    assert.deepEqual(await (await fetch(`${base}/api/me`, req('GET', 'Ravi'))).json(), { user: 'Ravi', signIn: true });
    const wrong = await fetch(`${base}/api/me`, { headers: { Authorization: 'Basic ' + Buffer.from('Ravi:sara-pw').toString('base64') } });
    assert.equal(wrong.status, 401);
  });
});

test('a rep’s key is encrypted on disk, never returned, and private to them', async () => {
  const mock = await mockOpenRouter();
  try {
    await withApp({ users: 'Ravi:ravi-pw,Sara:sara-pw', openrouterKey: '', openrouterBaseUrl: mock.url }, async (base, dataDir) => {
      const bad = await fetch(`${base}/api/ai/settings`, req('PUT', 'Ravi', { apiKey: 'not-a-key' }));
      assert.equal(bad.status, 400);
      const badModel = await fetch(`${base}/api/ai/settings`, req('PUT', 'Ravi', { model: 'no slash here' }));
      assert.equal(badModel.status, 400);
      const saved = await (await fetch(`${base}/api/ai/settings`, req('PUT', 'Ravi', { apiKey: RAVI_KEY, model: 'a-vendor/smart', researchModel: 'b-vendor/fast' }))).json();
      assert.deepEqual(saved, { ok: true, hasKey: true, keyHint: '…1111', model: 'a-vendor/smart', researchModel: 'b-vendor/fast' });

      const mine = await (await fetch(`${base}/api/ai/settings`, req('GET', 'Ravi'))).json();
      assert.equal(mine.hasKey, true);
      assert.ok(!JSON.stringify(mine).includes(RAVI_KEY));
      const hers = await (await fetch(`${base}/api/ai/settings`, req('GET', 'Sara'))).json();
      assert.equal(hers.hasKey, false);
      assert.deepEqual(await (await fetch(`${base}/api/ai/status`, req('GET', 'Sara'))).json(), { enabled: false, provider: 'OpenRouter', model: null, researchModel: null, keySource: null });

      for (const f of fs.readdirSync(dataDir)) {
        const text = fs.readFileSync(path.join(dataDir, f), 'utf8');
        assert.ok(!text.includes(RAVI_KEY), `${f} must not contain the key in plain text`);
      }
      const kit = await (await fetch(`${base}/api/toolkit`, req('GET', 'Ravi'))).text();
      assert.ok(!kit.includes('ravi-personal'), 'shared data never carries keys');
    });
  } finally { mock.server.close(); }
});

test('drafts, key tests and research use the signed-in rep’s own key and models', async () => {
  const mock = await mockOpenRouter();
  try {
    await withApp({ users: 'Ravi:ravi-pw,Sara:sara-pw', openrouterKey: 'sk-or-company-key-9999999999', openrouterModel: 'company/default', openrouterBaseUrl: mock.url }, async (base) => {
      await fetch(`${base}/api/ai/settings`, req('PUT', 'Ravi', { apiKey: RAVI_KEY, model: 'a-vendor/smart', researchModel: 'b-vendor/fast' }));
      const lead = await (await fetch(`${base}/api/toolkit/leads`, req('POST', 'Ravi', { company: 'Gulf Bank', region: 'Gulf', source: 'Event', date: '2027-01-04' }))).json();
      await fetch(`${base}/api/toolkit/leads/${lead.id}`, req('PUT', 'Ravi', { ...lead, seq: { id: 'inbound', step: 0, start: '2027-01-04' } }));

      await fetch(`${base}/api/ai/draft`, req('POST', 'Ravi', { leadId: lead.id }));
      assert.deepEqual(mock.calls.at(-1), { auth: `Bearer ${RAVI_KEY}`, model: 'a-vendor/smart', plugins: undefined });
      await fetch(`${base}/api/ai/draft`, req('POST', 'Sara', { leadId: lead.id }));
      assert.deepEqual(mock.calls.at(-1), { auth: 'Bearer sk-or-company-key-9999999999', model: 'company/default', plugins: undefined });

      const t = await (await fetch(`${base}/api/ai/test`, req('POST', 'Ravi', { which: 'research' }))).json();
      assert.deepEqual(t, { ok: true, model: 'b-vendor/fast', keySource: 'yours' });

      await fetch(`${base}/api/engine`, req('PUT', 'Ravi', { sources: { web: true, brave: false, rss: false }, hunts: [{ id: 'h', name: 'H', query: 'q', regions: ['Gulf'], interest: 'ERP' }] }));
      await fetch(`${base}/api/engine/run?wait=1`, req('POST', 'Ravi'));
      const research = mock.calls.at(-1);
      assert.equal(research.auth, `Bearer ${RAVI_KEY}`);
      assert.equal(research.model, 'b-vendor/fast');
      assert.ok(research.plugins);

      // Removing the key falls back to the company key.
      await fetch(`${base}/api/ai/settings`, req('PUT', 'Ravi', { apiKey: null }));
      assert.equal((await (await fetch(`${base}/api/ai/status`, req('GET', 'Ravi'))).json()).keySource, 'company');
    });
  } finally { mock.server.close(); }
});

test('a rejected key gives a clear message, and the model list is sorted with prices', async () => {
  const mock = await mockOpenRouter();
  try {
    await withApp({ openrouterKey: '', openrouterBaseUrl: mock.url }, async (base) => {
      await fetch(`${base}/api/ai/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: 'sk-or-revoked-key-0000000000' }) });
      const r = await fetch(`${base}/api/ai/test`, { method: 'POST' });
      assert.equal(r.status, 502);
      assert.match((await r.json()).error, /rejected the API key/);
      const models = await (await fetch(`${base}/api/ai/models`)).json();
      assert.deepEqual(models.map((m) => m.id), ['a-vendor/smart', 'b-vendor/fast']);
      assert.equal(models[1].promptPrice, 0.2);
      assert.equal(models[1].completionPrice, 0.8);
    });
  } finally { mock.server.close(); }
});
