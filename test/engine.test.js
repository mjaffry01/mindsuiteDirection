'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');
const { parseFeed, parseJsonArray } = require('../src/engine');

const recent = new Date(Date.now() - 2 * 864e5).toUTCString();
// One stand-in server playing OpenRouter, Brave Search and an RSS feed.
function mockWorld() {
  const seen = { or: [], brave: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url.startsWith('/brave/news/search')) {
        seen.brave.push({ url: req.url, token: req.headers['x-subscription-token'] });
        return json(200, { results: [{ title: 'Emirates Freight launches ERP tender', url: 'https://news.example/ef-erp', description: 'Dubai logistics firm Emirates Freight issued a tender for a new ERP system.', age: recent }] });
      }
      if (req.url === '/feed.xml') {
        res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
        return res.end(`<rss><channel><item><title>Pune Steel announces ERP migration</title><link>https://feed.example/pune-steel</link><pubDate>${recent}</pubDate><description><![CDATA[<p>Pune Steel will move to a new ERP system next year.</p>]]></description></item><item><title>Weather update</title><link>https://feed.example/weather</link><description>Rain</description></item></channel></rss>`);
      }
      if (req.url === '/or/api/v1/chat/completions') {
        const j = JSON.parse(body);
        seen.or.push(j);
        const prompt = j.messages[1].content;
        if (j.plugins) {
          // Web search: two answers, only one backed by a citation.
          return json(200, { model: j.model, choices: [{ message: { content: JSON.stringify([
            { company: 'Gulf Commercial Bank', country: 'UAE', industry: 'Banking', signal_type: 'digital_initiative', summary: 'Announced a generative AI programme for branches.', why_now: 'Budget is approved and they are choosing partners.', interest: 'Applied AI', roles: ['Head of Digital', 'CIO'], evidence_url: 'https://news.example/gcb-ai', published: recent, confidence: 0.9 },
            { company: 'Made Up Corp', country: 'UAE', signal_type: 'funding', summary: 'x', why_now: 'x', interest: 'Applied AI', evidence_url: 'https://not-cited.example/x', confidence: 0.9 },
          ]), annotations: [{ type: 'url_citation', url_citation: { url: 'https://news.example/gcb-ai', title: 'GCB AI' } }] } }] });
        }
        const out = [];
        if (prompt.includes('https://news.example/ef-erp')) out.push({ company: 'Emirates Freight LLC', country: 'United Arab Emirates', industry: 'Logistics', signal_type: 'tender', summary: 'Issued an ERP tender.', why_now: 'Tender is open now.', interest: 'ERP', roles: ['CFO', 'IT Director'], evidence_url: 'https://news.example/ef-erp', published: recent, confidence: 0.85 });
        if (prompt.includes('https://feed.example/pune-steel')) out.push({ company: 'Pune Steel', country: 'India', industry: 'Manufacturing', signal_type: 'digital_initiative', summary: 'Moving to a new ERP.', why_now: 'Planning next year.', interest: 'ERP', roles: ['CIO'], evidence_url: 'https://feed.example/pune-steel', published: recent, confidence: 0.7 });
        if (prompt.includes('https://news.example/ef-erp')) out.push({ company: 'Low Confidence Ltd', country: 'India', signal_type: 'other', evidence_url: 'https://news.example/ef-erp', confidence: 0.2 });
        return json(200, { model: j.model, choices: [{ message: { content: '```json\n' + JSON.stringify(out) + '\n```' } }] });
      }
      json(404, {});
    });
  });
  return new Promise((r) => server.listen(0, () => { const base = `http://127.0.0.1:${server.address().port}`; r({ server, seen, base }); }));
}

async function withApp(world, fn, opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mse-'));
  const app = createApp({ dataDir, user: '', password: '', engineScheduler: false, openrouterKey: 'sk-or-test', openrouterBaseUrl: `${world.base}/or/api/v1`, braveKey: 'brave-test', braveBaseUrl: `${world.base}/brave`, ...opts });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
const send = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ERP_HUNT = { id: 'erp', name: 'ERP projects', query: 'ERP tender OR ERP migration', regions: ['Gulf', 'India'], interest: 'ERP', active: true };
const AI_HUNT = { id: 'ai', name: 'Gulf AI', query: 'bank generative AI', regions: ['Gulf'], interest: 'Applied AI', active: true };

test('feed and JSON helpers cope with real-world formats', () => {
  const items = parseFeed('<rss><item><title>A &amp; B</title><link>https://x.example/a</link><description><![CDATA[<b>hi</b>]]></description></item></rss>');
  assert.deepEqual(items[0], { title: 'A & B', url: 'https://x.example/a', published: '', snippet: 'hi' });
  assert.deepEqual(parseJsonArray('Here you go:\n```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  assert.deepEqual(parseJsonArray('no json'), []);
});

test('the engine explains what it needs before it can run', async () => {
  const world = await mockWorld();
  try {
    await withApp(world, async (base) => {
      const run = await (await fetch(`${base}/api/engine/run?wait=1`, { method: 'POST' })).json();
      assert.match(run.errors[0], /OPENROUTER_API_KEY/);
    }, { openrouterKey: '' });
    await withApp(world, async (base) => {
      await fetch(`${base}/api/engine`, send('PUT', { sources: { web: false, brave: false, rss: false } }));
      const run = await (await fetch(`${base}/api/engine/run?wait=1`, { method: 'POST' })).json();
      assert.match(run.errors[0], /No sources are ready/);
    });
  } finally { world.server.close(); }
});

test('a run finds, checks, de-duplicates, scores and routes prospects to reps', async () => {
  const world = await mockWorld();
  try {
    await withApp(world, async (base) => {
      await fetch(`${base}/api/settings/sales`, send('PUT', { owners: ['Ravi', 'Sara'], industries: ['Logistics'], priority: ['Gulf'] }));
      // Pune Steel is already a lead, so it must be skipped.
      await fetch(`${base}/api/toolkit/leads`, send('POST', { company: 'Pune Steel Pvt Ltd', region: 'India', source: 'Event', date: '2027-01-04' }));
      const cfg = await (await fetch(`${base}/api/engine`, send('PUT', { hunts: [ERP_HUNT, AI_HUNT, { name: 'bad', query: 'x', regions: ['Mars'] }], feeds: [`${world.base}/feed.xml`, 'ftp://nope'], regionOwners: { Gulf: 'Sara', Mars: 'X' }, intervalMinutes: 5 }))).json();
      assert.equal(cfg.hunts.length, 2);
      assert.deepEqual(cfg.feeds, [`${world.base}/feed.xml`]);
      assert.deepEqual(cfg.regionOwners, { Gulf: 'Sara' });
      assert.equal(cfg.intervalMinutes, 30);
      assert.deepEqual(cfg.sourcesReady, { web: true, brave: true, rss: true });

      const run = await (await fetch(`${base}/api/engine/run?wait=1`, { method: 'POST' })).json();
      assert.deepEqual(run.errors, []);
      const kit = await (await fetch(`${base}/api/toolkit`)).json();
      const names = kit.prospects.map((p) => p.company).sort();
      assert.deepEqual(names, ['Emirates Freight LLC', 'Gulf Commercial Bank']);
      const ef = kit.prospects.find((p) => p.company === 'Emirates Freight LLC');
      assert.equal(ef.region, 'Gulf');
      assert.equal(ef.owner, 'Sara');
      assert.equal(ef.signalType, 'tender');
      assert.equal(ef.status, 'Suggested');
      assert.match(ef.scoreReasons, /Tender or RFP/);
      assert.match(ef.scoreReasons, /Target industry: Logistics/);
      assert.ok(ef.score >= 70);
      assert.equal(run.added, 2);
      assert.ok(run.skipped >= 3, 'uncited, low-confidence and already-known prospects are skipped');
      assert.equal(world.seen.brave[0].token, 'brave-test');
      assert.ok(world.seen.or.some((r) => r.plugins && r.plugins[0].id === 'web'));
      const status = await (await fetch(`${base}/api/engine`)).json();
      assert.equal(status.runs[0].id, run.id);

      // A second run adds nothing new.
      const again = await (await fetch(`${base}/api/engine/run?wait=1`, { method: 'POST' })).json();
      assert.equal(again.added, 0);
    });
  } finally { world.server.close(); }
});

test('reps accept prospects into leads, reject them with a reason, and rejections teach the engine', async () => {
  const world = await mockWorld();
  try {
    await withApp(world, async (base) => {
      await fetch(`${base}/api/engine`, send('PUT', { hunts: [AI_HUNT], sources: { web: true, brave: false, rss: false } }));
      await fetch(`${base}/api/engine/run?wait=1`, { method: 'POST' });
      const [p] = (await (await fetch(`${base}/api/toolkit`)).json()).prospects;
      assert.equal((await fetch(`${base}/api/toolkit/prospects/${p.id}`, send('PUT', p))).status, 405);
      const acc = await fetch(`${base}/api/prospects/${p.id}/accept`, send('POST', { sequence: 'gulf', owner: 'Ravi' }));
      assert.equal(acc.status, 201);
      const { lead } = await acc.json();
      assert.equal(lead.channel, 'Lead engine');
      assert.equal(lead.owner, 'Ravi');
      assert.equal(lead.seq.id, 'gulf');
      assert.match(lead.notes, /Evidence: https:\/\/news\.example\/gcb-ai/);
      assert.equal((await fetch(`${base}/api/prospects/${p.id}/accept`, send('POST', {}))).status, 409);

      await fetch(`${base}/api/engine`, send('PUT', { hunts: [ERP_HUNT], sources: { web: false, brave: true, rss: false } }));
      await fetch(`${base}/api/engine/run?wait=1`, { method: 'POST' });
      const ef = (await (await fetch(`${base}/api/toolkit`)).json()).prospects.find((x) => x.company.startsWith('Emirates'));
      await fetch(`${base}/api/prospects/${ef.id}/reject`, send('POST', { reason: 'Too small for us' }));
      await fetch(`${base}/api/engine/run?wait=1`, { method: 'POST' });
      const last = world.seen.or[world.seen.or.length - 1].messages[1].content;
      assert.match(last, /Too small for us/);
    });
  } finally { world.server.close(); }
});
