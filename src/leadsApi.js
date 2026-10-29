'use strict';
const express = require('express');
const crypto = require('crypto');
const toolkit = require('./toolkit');
const L = require('./leads');
const { openapi } = require('./leadsOpenapi');

// Parses LEAD_API_KEYS: "name:key:DefaultSource,name2:key2:Event"
function parseKeys(raw) {
  return String(raw || '').split(',').map((x) => x.trim()).filter(Boolean).map((entry) => {
    const [name, key, source] = entry.split(':');
    return { name, key, source: toolkit.SOURCES.includes(source) ? source : null };
  }).filter((k) => k.name && k.key && k.key.length >= 16);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createLeadsApi({ kitStore, broadcast, options = {} }) {
  const keys = parseKeys(options.apiKeys ?? process.env.LEAD_API_KEYS);
  const origins = String(options.formOrigins ?? process.env.LEAD_FORM_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const notifyUrl = options.notifyWebhook ?? process.env.LEAD_NOTIFY_WEBHOOK;
  const rateMax = Number(options.rateMax ?? process.env.LEAD_FORM_RATE_LIMIT ?? 5);
  const minFillMs = Number(options.minFillMs ?? 2500);
  const hits = new Map();

  function keyFor(req) {
    const given = req.get('x-api-key');
    return given ? keys.find((k) => safeEqual(k.key, given)) || null : null;
  }

  // Shared pipeline for every way a lead arrives: validate, detect region,
  // score, de-duplicate, save, notify.
  async function ingest(input, { channel, defaultSource, meeting = false }) {
    const today = toolkit.todayIso();
    const b = input || {};
    const contact = String(b.contact || b.name || [b.firstName, b.lastName].filter(Boolean).join(' ') || '').trim();
    let company = String(b.company || b.organisation || b.organization || '').trim();
    if (!company && L.isBusinessEmail(b.email)) company = L.emailDomain(b.email);
    if (!company) return { status: 400, body: { error: 'company is required (or a work email address)' } };
    if (b.email && !L.validEmail(b.email)) return { status: 400, body: { error: 'email is not a valid address' } };
    const { region, guessed } = L.detectRegion({ region: b.region, country: b.country, phone: b.phone }, toolkit.REGIONS);
    const source = toolkit.SOURCES.includes(b.source) ? b.source : defaultSource || 'Website';
    const draft = {
      company, contact, title: b.title, email: b.email ? String(b.email).trim().toLowerCase() : undefined, phone: b.phone, country: b.country,
      region, source, date: today, qualified: false, meeting: Boolean(meeting || b.meeting),
      interest: L.normalizeInterest(b.interest), timeline: L.normalizeTimeline(b.timeline),
      employees: Number.isFinite(Number(b.employees)) && b.employees !== '' && b.employees !== null && b.employees !== undefined ? Number(b.employees) : undefined,
      message: b.message, notes: [b.notes, guessed ? 'Region not detected; please check it.' : ''].filter(Boolean).join(' '),
      channel, externalId: b.externalId, utmSource: b.utmSource || b.utm_source, utmMedium: b.utmMedium || b.utm_medium,
      utmCampaign: b.utmCampaign || b.utm_campaign, referrer: b.referrer,
      consent: b.consent === true ? true : undefined, consentAt: b.consent === true ? new Date().toISOString() : undefined,
      touches: 1, lastTouch: today,
    };
    draft.status = draft.meeting ? 'Meeting booked' : 'New';
    const s = L.scoreLead(draft, kitStore.get().salesSettings || {});
    draft.score = s.score;
    draft.scoreReasons = s.reasons.join('; ');
    draft.suggestedQualified = s.suggestedQualified;
    const { record, error } = toolkit.clean('leads', draft);
    if (error) return { status: 400, body: { error } };

    const leads = kitStore.get().leads;
    const dup = L.findDuplicate(leads, record, today);
    let saved, duplicate = false;
    if (dup) {
      duplicate = true;
      const merged = { ...dup };
      for (const [k, v] of Object.entries(record)) {
        if (['date', 'touches', 'qualified', 'notes', 'source', 'channel'].includes(k)) continue;
        if ((merged[k] === undefined || merged[k] === '') && v !== undefined) merged[k] = v;
      }
      if (record.meeting) merged.meeting = true;
      if ((record.score || 0) > (merged.score || 0)) Object.assign(merged, { score: record.score, scoreReasons: record.scoreReasons, suggestedQualified: record.suggestedQualified });
      merged.touches = (dup.touches || 1) + 1;
      merged.lastTouch = today;
      merged.notes = [dup.notes, `Came in again via ${channel} (${source}) on ${today}.`, record.notes].filter(Boolean).join(' ').slice(-1000);
      merged.updated = new Date().toISOString();
      await kitStore.update((d) => { const i = d.leads.findIndex((x) => x.id === dup.id); if (i >= 0) d.leads[i] = merged; });
      saved = merged;
    } else {
      const now = new Date().toISOString();
      saved = { id: toolkit.newId(), ...record, created: now, updated: now };
      await kitStore.update((d) => { d.leads.push(saved); });
    }
    broadcast();
    notify(saved, duplicate);
    return { status: duplicate ? 200 : 201, body: { lead: saved, duplicate } };
  }

  function notify(lead, duplicate) {
    if (!notifyUrl || duplicate) return;
    const text = `New lead: ${lead.company} (${lead.region}, ${lead.source}), score ${lead.score}${lead.suggestedQualified ? ', likely qualified' : ''}. `
      + `${[lead.contact, lead.title].filter(Boolean).join(', ')}${lead.interest ? `. Interested in ${lead.interest}` : ''}.`;
    fetch(notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      .catch((err) => console.error('Lead notification failed:', err.message));
  }

  const router = express.Router();

  // ---- Public website form: no login, protected by origin list, rate limit, honeypot and timing ----
  function cors(req, res) {
    const origin = req.get('origin');
    if (!origin) return true;
    const sameHost = (() => { try { return new URL(origin).host === req.get('host'); } catch { return false; } })();
    if (sameHost || origins.includes('*') || origins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return true;
    }
    return false;
  }
  router.options('/public/leads', (req, res) => (cors(req, res) ? res.sendStatus(204) : res.sendStatus(403)));
  router.post('/public/leads', async (req, res, next) => {
    try {
      if (!cors(req, res)) return res.status(403).json({ error: 'This website isn’t allowed to send leads. Add it to LEAD_FORM_ORIGINS.' });
      const ip = req.ip || 'unknown';
      const now = Date.now();
      const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
      if (recent.length >= rateMax) {
        res.set('Retry-After', '600');
        return res.status(429).json({ error: 'Too many submissions from this address. Please try again in 10 minutes.' });
      }
      recent.push(now);
      hits.set(ip, recent);
      const b = req.body || {};
      const thanks = { ok: true, message: 'Thank you. We’ll reply within one working day.' };
      // Bots: fill the hidden field, or submit faster than a person could.
      if (b.website || (b._t && now - Number(b._t) < minFillMs)) return res.status(201).json(thanks);
      if (b.consent !== true) return res.status(400).json({ error: 'Please agree to be contacted about your enquiry.' });
      if (!b.email || !L.validEmail(b.email)) return res.status(400).json({ error: 'Please enter a valid work email address.' });
      const out = await ingest(b, { channel: 'Website form', defaultSource: toolkit.SOURCES.includes(b.source) ? b.source : 'Website' });
      if (out.status >= 400) return res.status(out.status).json(out.body);
      res.status(201).json(thanks);
    } catch (err) { next(err); }
  });

  // ---- Webhooks for other tools (Zapier, Make, LinkedIn lead forms via Zapier, event apps, partners) ----
  function requireKey(req, res) {
    if (!keys.length) { res.status(503).json({ error: 'No API keys are set. Add LEAD_API_KEYS to enable webhooks.' }); return null; }
    const k = keyFor(req);
    if (!k) { res.status(401).json({ error: 'Send a valid key in the X-API-Key header.' }); return null; }
    return k;
  }
  router.post('/webhooks/leads', async (req, res, next) => {
    try {
      const k = requireKey(req, res); if (!k) return;
      const items = Array.isArray(req.body) ? req.body : [req.body];
      if (items.length > 100) return res.status(400).json({ error: 'Send at most 100 leads per request.' });
      const results = [];
      for (const item of items) {
        const out = await ingest(item, { channel: `Webhook: ${k.name}`, defaultSource: k.source || 'Partner' });
        results.push(out.status >= 400 ? { error: out.body.error } : { id: out.body.lead.id, duplicate: out.body.duplicate, score: out.body.lead.score });
      }
      const failed = results.filter((r) => r.error).length;
      res.status(failed === results.length ? 400 : 201).json(Array.isArray(req.body) ? { results } : results[0]);
    } catch (err) { next(err); }
  });
  router.post('/webhooks/meetings', async (req, res, next) => {
    try {
      const k = requireKey(req, res); if (!k) return;
      const b = req.body || {};
      if (!b.email || !L.validEmail(b.email)) return res.status(400).json({ error: 'email is required' });
      const out = await ingest({ ...b, notes: [b.notes, b.scheduledAt ? `Meeting booked for ${b.scheduledAt}.` : 'Meeting booked.'].filter(Boolean).join(' ') },
        { channel: `Meeting webhook: ${k.name}`, defaultSource: k.source || 'Website', meeting: true });
      if (out.status >= 400) return res.status(out.status).json(out.body);
      res.status(out.status).json({ id: out.body.lead.id, meeting: true, duplicate: out.body.duplicate });
    } catch (err) { next(err); }
  });

  // ---- Bulk import, export, scoring preview, stats ----
  const COLS = ['company', 'contact', 'title', 'email', 'phone', 'country', 'region', 'source', 'interest', 'timeline', 'employees', 'message', 'notes', 'externalId'];
  router.post('/leads/import', express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }), async (req, res, next) => {
    try {
      const k = keyFor(req);
      if (typeof req.body !== 'string' || !req.body.trim()) return res.status(400).json({ error: 'Send the CSV file as the request body with Content-Type: text/csv' });
      const rows = L.parseCsv(req.body);
      if (rows.length < 2) return res.status(400).json({ error: 'The CSV needs a header row and at least one lead' });
      if (rows.length > 2001) return res.status(400).json({ error: 'Import at most 2,000 leads at a time' });
      const header = rows[0].map((h) => h.trim().replace(/\s+/g, '').toLowerCase());
      const idx = Object.fromEntries(COLS.map((c) => [c, header.indexOf(c.toLowerCase())]));
      if (idx.company < 0 && idx.email < 0) return res.status(400).json({ error: `The header row needs a company or email column. Columns you can use: ${COLS.join(', ')}` });
      const defaultSource = toolkit.SOURCES.includes(req.query.source) ? req.query.source : (k && k.source) || 'Outbound';
      const summary = { created: 0, duplicates: 0, errors: [] };
      for (let r = 1; r < rows.length; r++) {
        const item = {};
        for (const c of COLS) if (idx[c] >= 0 && rows[r][idx[c]] !== undefined && rows[r][idx[c]].trim() !== '') item[c] = rows[r][idx[c]].trim();
        const out = await ingest(item, { channel: `CSV import${k ? `: ${k.name}` : ''}`, defaultSource });
        if (out.status >= 400) summary.errors.push({ row: r + 1, error: out.body.error });
        else if (out.body.duplicate) summary.duplicates++;
        else summary.created++;
      }
      res.status(summary.created ? 201 : 200).json(summary);
    } catch (err) { next(err); }
  });

  router.post('/leads/score', (req, res) => {
    const b = req.body || {};
    const { region } = L.detectRegion({ region: b.region, country: b.country, phone: b.phone }, toolkit.REGIONS);
    res.json({ region, ...L.scoreLead({ ...b, region }) });
  });

  router.get('/leads/export.csv', (req, res) => {
    const cols = ['date', 'company', 'contact', 'title', 'email', 'phone', 'country', 'region', 'source', 'channel', 'interest', 'timeline', 'employees', 'score',
      'suggestedQualified', 'qualified', 'meeting', 'touches', 'utmSource', 'utmMedium', 'utmCampaign', 'notes'];
    const lines = [cols.join(',')].concat(kitStore.get().leads.map((l) => cols.map((c) => L.csvCell(l[c])).join(',')));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mindsuite-leads-${toolkit.todayIso()}.csv"` });
    res.send('\uFEFF' + lines.join('\r\n'));
  });

  router.get('/leads/stats', (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const list = kitStore.get().leads.filter((l) => (l.date || '') >= since);
    const count = (f) => list.reduce((m, l) => { const k = f(l); m[k] = (m[k] || 0) + 1; return m; }, {});
    res.json({
      days, total: list.length, bySource: count((l) => l.source), byRegion: count((l) => l.region),
      byScore: count((l) => (l.score >= 60 ? '60 and above' : l.score >= 40 ? '40–59' : 'Below 40')),
      qualified: list.filter((l) => l.qualified).length, meetings: list.filter((l) => l.meeting).length,
    });
  });

  router.get('/leads/openapi.json', (req, res) => res.json(openapi(`${req.protocol}://${req.get('host')}`)));

  return router;
}

module.exports = { createLeadsApi, parseKeys };
