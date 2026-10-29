'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const { indexPlan, snapToMonday, progress } = require('./plan');
const { JsonStore } = require('./store');
const crypto = require('crypto');
const toolkit = require('./toolkit');
const { createLeadsApi, parseKeys } = require('./leadsApi');
const L = require('./leads');
const O = require('./outreach');
const { createAi } = require('./ai');
const { createEngine, DEFAULT_ENGINE } = require('./engine');
const { createVault } = require('./secrets');

function createApp(options = {}) {
  const root = path.join(__dirname, '..');
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(root, 'data');
  const plan = JSON.parse(fs.readFileSync(options.planFile || path.join(root, 'data', 'plan.json'), 'utf8'));
  const index = indexPlan(plan);
  const planStore = new JsonStore(path.join(dataDir, 'state.json'), { start: '2026-11-02', done: {} });
  const kitStore = new JsonStore(path.join(dataDir, 'toolkit.json'), { ...toolkit.EMPTY, salesSettings: { owners: [], industries: [], priority: ['Gulf', 'US', 'Europe'] }, engine: DEFAULT_ENGINE, engineRuns: [] });
  const ai = createAi(options);
  const vault = createVault(dataDir, options.secretKey ?? process.env.SECRET_KEY);
  const aiStore = new JsonStore(path.join(dataDir, 'ai-settings.json'), { users: {} });
  aiStore.load();
  const allowUserKeys = String(options.allowUserKeys ?? process.env.AI_ALLOW_USER_KEYS ?? '1') !== '0';
  // The key and models to use for a rep: their own if they saved one, else the company's.
  function credsFor(u) {
    const mine = (aiStore.get().users || {})[u] || {};
    const ownKey = allowUserKeys ? vault.open(mine.key) : null;
    const companyModel = ai.companyModel();
    return {
      user: u, apiKey: ownKey || null, source: ownKey ? 'yours' : ai.companyKeySet() ? 'company' : null,
      model: mine.model || companyModel, researchModel: mine.researchModel || mine.model || process.env.ENGINE_WEB_MODEL || companyModel,
    };
  }
  planStore.load();
  kitStore.load();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Login. Each rep signs in with their own name and password, set in
  // APP_USERS ("Ravi:password1,Sara:password2"); APP_USER and APP_PASSWORD add
  // one more account. The public lead form and its script stay open; webhooks
  // use X-API-Key instead. With no accounts set, everyone is "local".
  const accounts = new Map();
  String(options.users ?? process.env.APP_USERS ?? '').split(',').map((x) => x.trim()).filter(Boolean).forEach((entry) => {
    const i = entry.indexOf(':');
    if (i > 0 && entry.slice(i + 1)) accounts.set(entry.slice(0, i).trim(), entry.slice(i + 1));
  });
  const user = options.user ?? process.env.APP_USER;
  const pass = options.password ?? process.env.APP_PASSWORD;
  if (user && pass) accounts.set(user, pass);
  const leadKeys = parseKeys(options.apiKeys ?? process.env.LEAD_API_KEYS);
  const OPEN = [/^\/api\/public\//, /^\/embed\//, /^\/forms\//, /^\/api\/leads\/openapi\.json$/, /^\/healthz$/, /^\/api\/webhooks\//];
  const KEYED = [/^\/api\/leads\/(import|score)$/];
  if (options.trustProxy ?? process.env.TRUST_PROXY) app.set('trust proxy', options.trustProxy ?? process.env.TRUST_PROXY);
  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  app.use((req, res, next) => {
    if (!accounts.size) { req.user = 'local'; return next(); }
    if (OPEN.some((r) => r.test(req.path))) return next();
    const key = req.get('x-api-key');
    if (key && KEYED.some((r) => r.test(req.path)) && leadKeys.some((k) => same(k.key, key))) { req.user = 'api'; return next(); }
    const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
    if (m) {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      const name = decoded.slice(0, i), pw = decoded.slice(i + 1);
      let ok = false;
      for (const [u, p] of accounts) if (same(u, name) & same(p, pw)) ok = true;
      if (i > 0 && ok) { req.user = name; return next(); }
    }
    res.set('WWW-Authenticate', 'Basic realm="MindSuite"').status(401).send('Sign in required');
  });

  // Live updates for every open page: "state" for plan ticks, "toolkit" for sales records.
  const clients = new Set();
  function send(event, payload) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(msg);
  }
  const broadcastState = () => send('state', { start: planStore.get().start, done: planStore.get().done });
  const broadcastToolkit = () => send('toolkit', kitPayload());
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 25000);
  heartbeat.unref();

  function kitPayload() {
    const d = kitStore.get();
    return { ...Object.fromEntries(toolkit.COLLECTIONS.map((c) => [c, d[c] || []])), settings: d.salesSettings };
  }

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  // ---- 365-day plan ----
  app.get('/api/plan', (req, res) => res.json(plan));

  app.get('/api/state', (req, res) => {
    const { start, done, updatedAt } = planStore.get();
    res.json({ start, done, updatedAt });
  });

  app.put('/api/tasks/:id', wrap(async (req, res) => {
    const { id } = req.params;
    if (!index.has(id)) return res.status(404).json({ error: `No task with id ${id}` });
    if (typeof req.body?.done !== 'boolean') return res.status(400).json({ error: 'Send {"done": true} or {"done": false}' });
    await planStore.update((s) => {
      if (req.body.done) s.done[id] = 1;
      else delete s.done[id];
    });
    broadcastState();
    res.json({ id, done: req.body.done });
  }));

  app.put('/api/state/start', wrap(async (req, res) => {
    const monday = snapToMonday(req.body?.start);
    if (!monday) return res.status(400).json({ error: 'Send a valid date as {"start": "YYYY-MM-DD"}' });
    await planStore.update((s) => {
      s.start = monday;
    });
    broadcastState();
    res.json({ start: monday });
  }));

  app.get('/api/progress', (req, res) => res.json(progress(plan, index, planStore.get())));

  // Department definitions, KPIs and the services each department delivers.
  app.get('/api/departments', (req, res) => res.json(plan.deps));

  app.get('/api/tasks', (req, res) => {
    const { day, dept } = req.query;
    const state = planStore.get();
    let tasks = [...index.values()];
    if (day) tasks = tasks.filter((t) => t.day === Number(day));
    if (dept) tasks = tasks.filter((t) => t.dept === dept);
    res.json(tasks.map((t) => ({ ...t, done: Boolean(state.done[t.id]) })));
  });

  // ---- Sales and marketing toolkit ----
  app.get('/api/toolkit', (req, res) => res.json(kitPayload()));
  app.get('/api/toolkit/summary', (req, res) => res.json(toolkit.summary(kitPayload())));

  function checkCollection(req, res) {
    if (req.params.collection === 'prospects') { res.status(405).json({ error: 'Prospects come from the lead engine. Use /api/prospects/:id/accept, /reject or /assign.' }); return false; }
    if (toolkit.COLLECTIONS.includes(req.params.collection)) return true;
    res.status(404).json({ error: `Unknown collection. Use one of: ${toolkit.COLLECTIONS.join(', ')}` });
    return false;
  }

  app.post('/api/toolkit/:collection', wrap(async (req, res) => {
    if (!checkCollection(req, res)) return;
    let { record, error } = toolkit.clean(req.params.collection, req.body);
    if (error) return res.status(400).json({ error });
    if (req.params.collection === 'leads') {
      const p = L.prepareLead(record, kitStore.get().leads, kitStore.get().salesSettings, null, toolkit.REGIONS);
      if (p.error) return res.status(p.duplicate ? 409 : 400).json({ error: p.error, duplicateId: p.duplicate && p.duplicate.id });
      record = { status: 'New', ...p.lead };
    }
    if (req.params.collection === 'activities' && !kitStore.get().leads.some((l) => l.id === record.leadId)) return res.status(400).json({ error: 'That lead no longer exists' });
    const now = new Date().toISOString();
    const saved = { id: toolkit.newId(), ...record, created: now, updated: now };
    await kitStore.update((d) => {
      d[req.params.collection].push(saved);
    });
    broadcastToolkit();
    res.status(201).json(saved);
  }));

  app.put('/api/toolkit/:collection/:id', wrap(async (req, res) => {
    if (!checkCollection(req, res)) return;
    const list = kitStore.get()[req.params.collection];
    const existing = list.find((x) => x.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'That record no longer exists' });
    let { record, error } = toolkit.clean(req.params.collection, req.body);
    if (error) return res.status(400).json({ error });
    if (req.params.collection === 'leads') {
      const p = L.prepareLead(record, kitStore.get().leads, kitStore.get().salesSettings, existing.id, toolkit.REGIONS);
      if (p.error) return res.status(400).json({ error: p.error });
      record = p.lead;
    }
    const saved = { id: existing.id, ...record, created: existing.created, updated: new Date().toISOString() };
    await kitStore.update((d) => {
      const i = d[req.params.collection].findIndex((x) => x.id === existing.id);
      if (i >= 0) d[req.params.collection][i] = saved;
    });
    broadcastToolkit();
    res.json(saved);
  }));

  app.delete('/api/toolkit/:collection/:id', wrap(async (req, res) => {
    if (!checkCollection(req, res)) return;
    await kitStore.update((d) => {
      d[req.params.collection] = d[req.params.collection].filter((x) => x.id !== req.params.id);
    });
    broadcastToolkit();
    res.json({ deleted: req.params.id });
  }));

  // ---- Outreach: library, team settings and AI drafting ----
  app.get('/api/outreach/library', (req, res) => res.json({ LSTAT: O.LSTAT, OPEN_LSTAT: O.OPEN_LSTAT, DQ: O.DQ, ACT: O.ACT, OFFER_FOR: O.OFFER_FOR, TPL: O.TPL, SEQ: O.SEQ }));

  app.get('/api/settings/sales', (req, res) => res.json(kitStore.get().salesSettings));
  app.put('/api/settings/sales', wrap(async (req, res) => {
    const b = req.body || {};
    const list = (v, max) => (Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, max);
    const settings = { owners: list(b.owners, 50), industries: list(b.industries, 50), priority: list(b.priority, 5).filter((r) => toolkit.REGIONS.includes(r)) };
    await kitStore.update((d) => {
      d.salesSettings = settings;
      d.leads = d.leads.map((l) => { const s = L.scoreLead(l, settings); return { ...l, score: s.score, scoreReasons: s.reasons.join('; '), suggestedQualified: s.suggestedQualified }; });
    });
    broadcastToolkit();
    res.json(settings);
  }));

  app.get('/api/me', (req, res) => res.json({ user: req.user, signIn: accounts.size > 0 }));
  app.get('/api/ai/status', (req, res) => {
    const c = credsFor(req.user);
    res.json({ enabled: Boolean(c.source), provider: 'OpenRouter', model: c.source ? c.model : null, researchModel: c.source ? c.researchModel : null, keySource: c.source });
  });

  // ---- Each rep's own AI settings: model choices and their OpenRouter key ----
  const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._:-]+$/;
  app.get('/api/ai/settings', (req, res) => {
    const mine = (aiStore.get().users || {})[req.user] || {};
    res.json({
      user: req.user, allowUserKeys, hasKey: Boolean(mine.key), keyHint: mine.keyHint || null, model: mine.model || '', researchModel: mine.researchModel || '',
      companyKeySet: ai.companyKeySet(), companyModel: ai.companyModel(), updatedAt: mine.updatedAt || null,
    });
  });
  app.put('/api/ai/settings', wrap(async (req, res) => {
    if (req.user === 'api') return res.status(403).json({ error: 'Sign in as a rep to change AI settings.' });
    const b = req.body || {};
    const mine = { ...((aiStore.get().users || {})[req.user] || {}) };
    for (const k of ['model', 'researchModel']) {
      if (b[k] === undefined) continue;
      const v = String(b[k] || '').trim();
      if (v && !MODEL_ID.test(v)) return res.status(400).json({ error: `“${v}” doesn’t look like an OpenRouter model ID. Copy it from openrouter.ai/models, for example provider/model-name.` });
      mine[k] = v || undefined;
    }
    if (b.apiKey !== undefined) {
      if (b.apiKey === null || b.apiKey === '') { delete mine.key; delete mine.keyHint; }
      else {
        if (!allowUserKeys) return res.status(403).json({ error: 'Personal keys are turned off on this server.' });
        const k = String(b.apiKey).trim();
        if (!/^sk-or-[A-Za-z0-9_-]{16,200}$/.test(k)) return res.status(400).json({ error: 'That doesn’t look like an OpenRouter key. It should start with sk-or- and be copied in full.' });
        mine.key = vault.seal(k);
        mine.keyHint = `…${k.slice(-4)}`;
      }
    }
    mine.updatedAt = new Date().toISOString();
    await aiStore.update((d) => { d.users = { ...(d.users || {}), [req.user]: mine }; });
    res.json({ ok: true, hasKey: Boolean(mine.key), keyHint: mine.keyHint || null, model: mine.model || '', researchModel: mine.researchModel || '' });
  }));
  app.post('/api/ai/test', wrap(async (req, res) => {
    const c = credsFor(req.user);
    if (!c.source) return res.status(400).json({ error: 'Add your OpenRouter key first.' });
    const which = req.body && req.body.which === 'research' ? c.researchModel : c.model;
    try { res.json({ ...(await ai.test({ ...c, model: which })), keySource: c.source }); }
    catch (err) { res.status(err.status || 502).json({ error: err.message }); }
  }));
  app.get('/api/ai/models', wrap(async (req, res) => {
    try { res.json(await ai.listModels()); }
    catch (err) { res.status(502).json({ error: `Couldn’t load the model list from OpenRouter (${err.message}). You can still type a model ID.` }); }
  }));
  app.post('/api/ai/draft', wrap(async (req, res) => {
    const lead = kitStore.get().leads.find((l) => l.id === (req.body && req.body.leadId));
    if (!lead) return res.status(404).json({ error: 'That lead no longer exists' });
    try {
      const c = credsFor(req.user);
      if (!c.source) return res.status(503).json({ error: 'Add your OpenRouter key under My AI to draft with AI.' });
      res.json(await ai.draft({ ...lead, owner: lead.owner }, c));
    } catch (err) {
      res.status(err.status || 502).json({ error: err.message });
    }
  }));

  // ---- Lead engine: finds prospects and hands them to reps ----
  const notifyUrl = options.notifyWebhook ?? process.env.LEAD_NOTIFY_WEBHOOK;
  const postNotice = (text) => {
    if (!notifyUrl) return;
    fetch(notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch((err) => console.error('Notification failed:', err.message));
  };
  const engine = createEngine({ kitStore, ai, broadcast: broadcastToolkit, notify: postNotice, options });
  if (options.engineScheduler !== false) engine.start();
  app.locals.engine = engine;

  app.get('/api/engine', (req, res) => res.json(engine.status(credsFor(req.user))));
  app.put('/api/engine', wrap(async (req, res) => {
    const next = engine.cleanConfig(req.body || {});
    await kitStore.update((d) => { d.engine = next; });
    broadcastToolkit();
    res.json(engine.status(credsFor(req.user)));
  }));
  app.post('/api/engine/run', wrap(async (req, res) => {
    if (engine.status().running) return res.status(409).json({ error: 'The engine is already running.' });
    const c = credsFor(req.user);
    const job = engine.runOnce('manual', c.apiKey ? c : { ...c, apiKey: null });
    if (req.query.wait) return res.json((await job).run);
    job.catch((err) => console.error('Lead engine run failed:', err.message));
    res.status(202).json({ started: true });
  }));

  function findProspect(req, res) {
    const p = kitStore.get().prospects.find((x) => x.id === req.params.id);
    if (!p) { res.status(404).json({ error: 'That prospect no longer exists' }); return null; }
    return p;
  }
  app.post('/api/prospects/:id/accept', wrap(async (req, res) => {
    const p = findProspect(req, res); if (!p) return;
    if (p.status !== 'Suggested') return res.status(409).json({ error: `This prospect was already ${p.status.toLowerCase()}.` });
    const today = toolkit.todayIso();
    const seqId = req.body && req.body.sequence;
    const { record, error } = toolkit.clean('leads', {
      company: p.company, country: p.country, region: p.region, industry: p.industry, interest: p.interest, source: 'Outbound', date: today,
      status: 'New', owner: (req.body && req.body.owner) || p.owner || undefined, channel: 'Lead engine', touches: 1, lastTouch: today,
      notes: [p.summary, p.whyNow && `Why now: ${p.whyNow}`, p.roles && `Roles to approach: ${p.roles}.`, `Evidence: ${p.evidenceUrl}`].filter(Boolean).join(' '),
      ...(O.SEQ[seqId] ? { seq: { id: seqId, step: 0, start: today } } : {}),
    });
    if (error) return res.status(400).json({ error });
    const prep = L.prepareLead(record, kitStore.get().leads, kitStore.get().salesSettings, null, toolkit.REGIONS);
    if (prep.error) return res.status(409).json({ error: prep.error });
    const now = new Date().toISOString();
    const lead = { id: toolkit.newId(), ...prep.lead, created: now, updated: now };
    await kitStore.update((d) => {
      d.leads.push(lead);
      const i = d.prospects.findIndex((x) => x.id === p.id);
      if (i >= 0) d.prospects[i] = { ...d.prospects[i], status: 'Accepted', leadId: lead.id, owner: lead.owner || d.prospects[i].owner };
    });
    broadcastToolkit();
    res.status(201).json({ lead });
  }));
  app.post('/api/prospects/:id/reject', wrap(async (req, res) => {
    const p = findProspect(req, res); if (!p) return;
    const reason = String((req.body && req.body.reason) || 'Not a fit').slice(0, 120);
    await kitStore.update((d) => { const i = d.prospects.findIndex((x) => x.id === p.id); if (i >= 0) d.prospects[i] = { ...d.prospects[i], status: 'Rejected', rejectReason: reason }; });
    broadcastToolkit();
    res.json({ id: p.id, status: 'Rejected' });
  }));
  app.post('/api/prospects/:id/assign', wrap(async (req, res) => {
    const p = findProspect(req, res); if (!p) return;
    const owner = String((req.body && req.body.owner) || '').slice(0, 80);
    await kitStore.update((d) => { const i = d.prospects.findIndex((x) => x.id === p.id); if (i >= 0) d.prospects[i] = { ...d.prospects[i], owner }; });
    broadcastToolkit();
    res.json({ id: p.id, owner });
  }));

  // ---- Lead generation API ----
  app.use('/api', createLeadsApi({ kitStore, broadcast: broadcastToolkit, options }));

  // ---- shared ----
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('retry: 5000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}

module.exports = { createApp };
