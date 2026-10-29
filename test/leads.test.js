'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');
const L = require('../src/leads');

const KEY = 'zapier:abcdefghijklmnop1234:Partner';
async function withServer(fn, opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msl-'));
  const app = createApp({ dataDir, user: '', password: '', apiKeys: KEY, formOrigins: 'https://www.mindsuite.in', minFillMs: 0, engineScheduler: false, ...opts });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
const json = (body, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const leads = async (base) => (await (await fetch(`${base}/api/toolkit`)).json()).leads;

test('region detection uses region, country, then phone', () => {
  const R = ['India', 'Gulf', 'US', 'Europe', 'Asia'];
  assert.equal(L.detectRegion({ country: 'United Arab Emirates' }, R).region, 'Gulf');
  assert.equal(L.detectRegion({ country: 'de' }, R).region, 'Europe');
  assert.equal(L.detectRegion({ phone: '+1 415 555 0100' }, R).region, 'US');
  assert.deepEqual(L.detectRegion({}, R), { region: 'India', guessed: true });
});

test('scoring rewards the ideal client profile', () => {
  const hi = L.scoreLead({ region: 'Gulf', email: 'cio@bank.ae', title: 'CIO', employees: 800, interest: 'Applied AI', timeline: 'Within 3 months', message: 'We want an AI Value Sprint for our customer support workflow.' });
  assert.ok(hi.score >= 80 && hi.suggestedQualified);
  const lo = L.scoreLead({ region: 'India', email: 'someone@gmail.com' });
  assert.ok(lo.score < 40 && !lo.suggestedQualified);
});

test('website form saves a scored lead from an allowed site and blocks others', async () => {
  await withServer(async (base) => {
    const form = { name: 'Aisha Khan', email: 'aisha@gulfbank.ae', company: 'Gulf Bank', title: 'Head of Digital', country: 'AE', interest: 'AI', timeline: 'Within 3 months', message: 'Looking for a knowledge assistant for our branch staff.', consent: true, _t: Date.now() - 10000 };
    const ok = await fetch(`${base}/api/public/leads`, json(form, { Origin: 'https://www.mindsuite.in' }));
    assert.equal(ok.status, 201);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://www.mindsuite.in');
    const [lead] = await leads(base);
    assert.equal(lead.region, 'Gulf');
    assert.equal(lead.interest, 'Applied AI');
    assert.equal(lead.source, 'Website');
    assert.ok(lead.score >= 60 && lead.suggestedQualified && lead.consent);
    const blocked = await fetch(`${base}/api/public/leads`, json(form, { Origin: 'https://evil.example' }));
    assert.equal(blocked.status, 403);
    const noConsent = await fetch(`${base}/api/public/leads`, json({ ...form, consent: false }));
    assert.equal(noConsent.status, 400);
  });
});

test('honeypot submissions look accepted but are not saved', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/api/public/leads`, json({ name: 'Bot', email: 'bot@spam.biz', company: 'Spam', consent: true, website: 'http://spam' }));
    assert.equal(r.status, 201);
    assert.equal((await leads(base)).length, 0);
  });
});

test('website form is rate limited per address', async () => {
  await withServer(async (base) => {
    const f = { email: 'a@acme.com', company: 'Acme', consent: true };
    for (let i = 0; i < 2; i++) assert.notEqual((await fetch(`${base}/api/public/leads`, json(f))).status, 429);
    assert.equal((await fetch(`${base}/api/public/leads`, json(f))).status, 429);
  }, { rateMax: 2 });
});

test('webhooks need a key, de-duplicate, and accept batches', async () => {
  await withServer(async (base) => {
    const one = { name: 'Tom Reid', email: 'tom@northwind.co.uk', company: 'Northwind Ltd', title: 'CTO', country: 'UK' };
    assert.equal((await fetch(`${base}/api/webhooks/leads`, json(one))).status, 401);
    const k = { 'X-API-Key': 'abcdefghijklmnop1234' };
    const first = await (await fetch(`${base}/api/webhooks/leads`, json(one, k))).json();
    assert.equal(first.duplicate, false);
    const again = await (await fetch(`${base}/api/webhooks/leads`, json({ ...one, phone: '+44 20 7946 0000' }, k))).json();
    assert.equal(again.duplicate, true);
    const list = await leads(base);
    assert.equal(list.length, 1);
    assert.equal(list[0].touches, 2);
    assert.equal(list[0].source, 'Partner');
    assert.equal(list[0].phone, '+44 20 7946 0000');
    const batch = await (await fetch(`${base}/api/webhooks/leads`, json([{ company: 'A Co', email: 'x@aco.com' }, { email: 'bad' }], k))).json();
    assert.equal(batch.results.length, 2);
    assert.ok(batch.results[1].error);
  });
});

test('meeting webhook marks the lead as meeting booked', async () => {
  await withServer(async (base) => {
    const k = { 'X-API-Key': 'abcdefghijklmnop1234' };
    await fetch(`${base}/api/webhooks/leads`, json({ email: 'ravi@acme.in', company: 'Acme India', country: 'India' }, k));
    const r = await (await fetch(`${base}/api/webhooks/meetings`, json({ email: 'ravi@acme.in', scheduledAt: '2027-01-12T10:00:00+05:30' }, k))).json();
    assert.equal(r.duplicate, true);
    const [lead] = await leads(base);
    assert.equal(lead.meeting, true);
    assert.match(lead.notes, /Meeting booked/);
  });
});

test('CSV import creates leads, skips duplicates and reports bad rows', async () => {
  await withServer(async (base) => {
    const csv = 'Company,Contact,Title,Email,Country\n"Contoso, Inc",Jane Doe,VP Engineering,jane@contoso.com,US\nContoso Inc,Jane D,,jane@contoso.com,US\n,,,not-an-email,\nFabrikam,Ola,CEO,ola@fabrikam.no,Norway\n';
    const r = await (await fetch(`${base}/api/leads/import?source=Event`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv })).json();
    assert.deepEqual([r.created, r.duplicates, r.errors.length], [2, 1, 1]);
    const list = await leads(base);
    assert.equal(list.find((l) => l.company === 'Contoso, Inc').source, 'Event');
    assert.equal(list.find((l) => l.company === 'Fabrikam').region, 'Europe');
    const exported = await (await fetch(`${base}/api/leads/export.csv`)).text();
    assert.match(exported, /"Contoso, Inc"/);
  });
});

test('public form, script and API spec stay open when login is on; the rest needs login', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/embed/lead-form.js`)).status, 200);
    assert.equal((await fetch(`${base}/forms/contact`)).status, 200);
    assert.equal((await fetch(`${base}/api/leads/openapi.json`)).status, 200);
    assert.equal((await fetch(`${base}/api/public/leads`, json({ email: 'a@b.co', company: 'B', consent: true }))).status, 201);
    assert.equal((await fetch(`${base}/api/toolkit`)).status, 401);
    assert.equal((await fetch(`${base}/api/leads/export.csv`)).status, 401);
    const viaKey = await fetch(`${base}/api/leads/score`, json({ title: 'CTO' }, { 'X-API-Key': 'abcdefghijklmnop1234' }));
    assert.equal(viaKey.status, 200);
  }, { user: 'director', password: 'secret' });
});
