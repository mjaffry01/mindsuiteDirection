'use strict';
// The lead engine: an agent that keeps looking for companies showing a buying
// signal, checks them against the ideal client profile, removes ones already
// known, scores them and hands them to the right rep for review.
//
// It finds COMPANIES and the reason to call them now, from public news and the
// sources you configure. It does not collect people's personal contact details
// or scrape LinkedIn: reps find the right person through the channels you're
// licensed to use, and every prospect is reviewed by a person before it
// becomes a lead.
const crypto = require('crypto');
const L = require('./leads');
const toolkit = require('./toolkit');

const SIGNALS = {
  tender: { label: 'Tender or RFP', pts: 15 }, digital_initiative: { label: 'Digital or AI initiative', pts: 12 },
  funding: { label: 'New funding', pts: 10 }, expansion: { label: 'Expansion', pts: 10 }, hiring: { label: 'Hiring for tech roles', pts: 8 },
  regulation: { label: 'New regulation or audit', pts: 8 }, leadership_change: { label: 'New tech leader', pts: 6 },
  partnership: { label: 'New partnership', pts: 5 }, other: { label: 'Other signal', pts: 3 },
};
const REGION_LOCALE = { India: ['IN', 'en-IN'], Gulf: ['AE', 'en-AE'], US: ['US', 'en-US'], Europe: ['GB', 'en-GB'], Asia: ['SG', 'en-SG'] };

const DEFAULT_ENGINE = {
  enabled: false,
  intervalMinutes: 360,
  sources: { web: true, brave: true, rss: true },
  feeds: [],
  regionOwners: {},
  hunts: [
    { id: 'gulf-ai', name: 'Gulf banks and insurers starting AI projects', query: 'bank OR insurer launches AI assistant OR generative AI OR digital transformation', regions: ['Gulf'], interest: 'Applied AI', active: true },
    { id: 'erp-me-in', name: 'ERP projects and tenders in the Gulf and India', query: 'ERP implementation OR ERP migration OR tender ERP system', regions: ['Gulf', 'India'], interest: 'ERP', active: true },
    { id: 'saas-funding', name: 'SaaS companies that just raised funding', query: 'SaaS startup raises Series A OR Series B funding', regions: ['US', 'Europe'], interest: 'Product Engineering', active: true },
    { id: 'cloud-migration', name: 'Companies moving to the cloud', query: 'cloud migration OR moves to AWS OR moves to Azure company announces', regions: ['India', 'Gulf', 'Asia'], interest: 'Cloud & Platform', active: true },
    { id: 'cyber-compliance', name: 'Firms facing new security rules or incidents', query: 'cybersecurity compliance deadline OR data breach company OR new cyber regulation', regions: ['Gulf', 'Europe'], interest: 'Cyber', active: false },
  ],
};

function cleanEngineConfig(b, prev) {
  const out = { ...prev };
  if (typeof b.enabled === 'boolean') out.enabled = b.enabled;
  if (b.intervalMinutes !== undefined) out.intervalMinutes = Math.min(1440, Math.max(30, Number(b.intervalMinutes) || 360));
  if (b.sources && typeof b.sources === 'object') out.sources = { web: Boolean(b.sources.web), brave: Boolean(b.sources.brave), rss: Boolean(b.sources.rss) };
  if (Array.isArray(b.feeds)) out.feeds = b.feeds.map((u) => String(u).trim()).filter((u) => /^https?:\/\//.test(u)).slice(0, 30);
  if (b.regionOwners && typeof b.regionOwners === 'object') {
    out.regionOwners = Object.fromEntries(Object.entries(b.regionOwners).filter(([r, o]) => toolkit.REGIONS.includes(r) && typeof o === 'string' && o.trim()).map(([r, o]) => [r, o.trim().slice(0, 80)]));
  }
  if (Array.isArray(b.hunts)) {
    out.hunts = b.hunts.slice(0, 20).map((h, i) => ({
      id: String(h.id || `hunt-${i}-${Date.now().toString(36)}`).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || `hunt-${i}`,
      name: String(h.name || 'Untitled hunt').slice(0, 120),
      query: String(h.query || '').slice(0, 300),
      regions: (Array.isArray(h.regions) ? h.regions : []).filter((r) => toolkit.REGIONS.includes(r)),
      interest: toolkit.DEPARTMENTS.includes(h.interest) ? h.interest : 'Not sure',
      active: h.active !== false,
    })).filter((h) => h.query && h.regions.length);
  }
  return out;
}

function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }

// Minimal RSS/Atom reader: title, link, date, description.
function parseFeed(xml) {
  const items = [];
  const blocks = String(xml).match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const pick = (tag) => { const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(b); return m ? stripTags(m[1].replace(/<!\[CDATA\[|\]\]>/g, '')) : ''; };
    let link = pick('link');
    if (!link) { const m = /<link[^>]*href="([^"]+)"/i.exec(b); link = m ? m[1] : ''; }
    items.push({ title: pick('title'), url: link, published: pick('pubDate') || pick('updated') || pick('published'), snippet: pick('description') || pick('summary') });
  }
  return items.filter((i) => i.title && /^https?:\/\//.test(i.url));
}

// Pulls the first JSON array out of a model answer.
function parseJsonArray(text) {
  const t = String(text || '').replace(/```(?:json)?/g, '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  try { const v = JSON.parse(t.slice(a, b + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}

function createEngine({ kitStore, ai, broadcast, notify, options = {} }) {
  const braveKey = options.braveKey ?? process.env.BRAVE_SEARCH_API_KEY ?? '';
  const braveBase = options.braveBaseUrl ?? 'https://api.search.brave.com/res/v1';
  const maxPerHunt = Number(options.engineMaxPerHunt ?? process.env.ENGINE_MAX_PER_HUNT ?? 8);
  const webModel = options.engineWebModel ?? process.env.ENGINE_WEB_MODEL ?? '';
  let running = null;
  let timer = null;

  const config = () => ({ ...DEFAULT_ENGINE, ...(kitStore.get().engine || {}) });
  const sourcesReady = (cfg = config(), creds) => ({
    web: Boolean(cfg.sources.web && (ai.enabled() || (creds && creds.apiKey))),
    brave: Boolean(cfg.sources.brave && braveKey),
    rss: Boolean(cfg.sources.rss && cfg.feeds.length),
  });

  async function fetchText(url, headers = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'MindSuite-LeadEngine/1.0', ...headers }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
      return await r.text();
    } finally { clearTimeout(t); }
  }

  async function braveNews(hunt) {
    const out = [];
    for (const region of hunt.regions) {
      const [country] = REGION_LOCALE[region] || ['ALL'];
      const url = `${braveBase}/news/search?q=${encodeURIComponent(hunt.query)}&country=${country}&freshness=pm&count=${maxPerHunt}`;
      const body = JSON.parse(await fetchText(url, { Accept: 'application/json', 'X-Subscription-Token': braveKey }));
      for (const r of body.results || []) out.push({ title: stripTags(r.title), url: r.url, published: r.age || r.page_age || '', snippet: stripTags(r.description), region });
    }
    return out;
  }

  async function rssItems(hunt, cfg) {
    const words = hunt.query.toLowerCase().split(/\bor\b|[^a-z0-9&]+/).map((w) => w.trim()).filter((w) => w.length > 3);
    const out = [];
    for (const feed of cfg.feeds) {
      try {
        for (const it of parseFeed(await fetchText(feed))) {
          const hay = `${it.title} ${it.snippet}`.toLowerCase();
          if (words.some((w) => hay.includes(w))) out.push(it);
        }
      } catch (err) { out.errors = (out.errors || []).concat(`Feed ${feed}: ${err.message}`); }
    }
    return out;
  }

  function extractionMessages(hunt, items, rejections) {
    const system = 'You find sales prospects for MindSuite, an Indian technology services company (software engineering, applied AI, cloud and DevOps, ERP, cybersecurity). From the news items given, pick out COMPANIES that show a buying signal for MindSuite’s services. Use only facts stated in the items. Do not include any person’s name, email or phone number. Skip an item if the company is unclear, if it is a technology vendor that competes with MindSuite, or if it is not in one of the target regions. Answer with a JSON array only.';
    const user = [
      `Hunt: ${hunt.name}. Target regions: ${hunt.regions.join(', ')}. Most relevant MindSuite department: ${hunt.interest}.`,
      rejections.length ? `Reps rejected these recently; avoid similar suggestions: ${JSON.stringify(rejections)}` : '',
      `News items:\n${JSON.stringify(items.slice(0, 15).map((i, n) => ({ n, title: i.title, snippet: (i.snippet || '').slice(0, 400), url: i.url, published: i.published })))}`,
      'For each prospect return: {"company": string, "country": string, "industry": string, "signal_type": one of "tender","digital_initiative","funding","expansion","hiring","regulation","leadership_change","partnership","other", "summary": one sentence on what happened, "why_now": one sentence on why MindSuite should call now, "interest": one of "Product Engineering","Applied AI","Cloud & Platform","ERP","Cyber", "roles": up to 3 job titles to approach (titles only), "evidence_url": the url of the item, "published": date if given, "confidence": 0 to 1}. Return [] if nothing qualifies.',
    ].filter(Boolean).join('\n\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  async function webDiscover(hunt, rejections, creds) {
    const messages = extractionMessages(hunt, [], rejections);
    messages[1].content = messages[1].content.replace(/News items:\n\[\]/, `Search the web for news from the last 30 days matching: ${hunt.query}. Use only what your search results say, and use a result’s URL as evidence_url.`);
    const out = await ai.chat(messages, { maxTokens: 1800, temperature: 0.2, plugins: [{ id: 'web', max_results: maxPerHunt }], modelOverride: (creds && creds.researchModel) || webModel || undefined, timeout: 60000, creds });
    const cited = new Set(out.citations.map((c) => c.url));
    // Keep only prospects whose evidence is a page the search actually returned.
    return parseJsonArray(out.text).filter((p) => !cited.size || cited.has(p.evidence_url)).map((p) => ({ ...p, _source: 'Web search' }));
  }

  async function extract(hunt, items, rejections, label, creds) {
    if (!items.length) return [];
    const out = await ai.chat(extractionMessages(hunt, items, rejections), { maxTokens: 1800, temperature: 0.2, timeout: 60000, modelOverride: (creds && creds.researchModel) || undefined, creds });
    const urls = new Set(items.map((i) => i.url));
    return parseJsonArray(out.text).filter((p) => urls.has(p.evidence_url)).map((p) => ({ ...p, _source: label }));
  }

  function scoreProspect(p, settings) {
    let score = 0;
    const reasons = [];
    const add = (n, why) => { score += n; reasons.push(`${why} (+${n})`); };
    const priority = settings.priority && settings.priority.length ? settings.priority : ['Gulf', 'US', 'Europe'];
    if (priority.includes(p.region)) add(15, `Priority region: ${p.region}`); else add(10, `Target region: ${p.region}`);
    const inds = (settings.industries || []).map((x) => x.toLowerCase());
    const ind = String(p.industry || '').toLowerCase();
    if (ind && inds.some((x) => ind.includes(x) || x.includes(ind))) add(10, `Target industry: ${p.industry}`);
    if (p.interest && p.interest !== 'Not sure') add(15, `Fits ${p.interest}`);
    const sig = SIGNALS[p.signalType] || SIGNALS.other;
    add(sig.pts, sig.label);
    const conf = Math.max(0, Math.min(1, Number(p.confidence) || 0));
    if (conf) add(Math.round(conf * 30), `Signal strength ${Math.round(conf * 100)}%`);
    const pub = Date.parse(p.published);
    if (pub) { const days = (Date.now() - pub) / 864e5; if (days <= 7) add(15, 'In the news this week'); else if (days <= 30) add(8, 'In the news this month'); }
    return { score: Math.min(100, score), reasons: reasons.join('; ') };
  }

  function pickOwner(region, cfg, settings, data) {
    if (cfg.regionOwners[region]) return cfg.regionOwners[region];
    const owners = settings.owners || [];
    if (!owners.length) return '';
    const open = (o) => data.prospects.filter((p) => p.status === 'Suggested' && p.owner === o).length;
    return owners.slice().sort((a, b) => open(a) - open(b))[0];
  }

  async function runOnce(trigger = 'manual', creds = null) {
    if (running) return { busy: true, run: running };
    const cfg = config();
    const ready = sourcesReady(cfg, creds);
    const run = { id: crypto.randomUUID(), trigger, by: (creds && creds.user) || null, startedAt: new Date().toISOString(), found: 0, added: 0, skipped: 0, hunts: [], errors: [] };
    running = run;
    try {
      if (!ai.enabled() && !(creds && creds.apiKey)) throw new Error('The lead engine needs an OpenRouter key: add yours under My AI, or set OPENROUTER_API_KEY on the server.');
      if (!ready.web && !ready.brave && !ready.rss) throw new Error('No sources are ready. Turn on web search, add BRAVE_SEARCH_API_KEY, or add RSS feeds.');
      const data = kitStore.get();
      const settings = data.salesSettings || {};
      const rejections = data.prospects.filter((p) => p.status === 'Rejected').slice(-20).map((p) => ({ company: p.company, reason: p.rejectReason }));
      for (const hunt of cfg.hunts.filter((h) => h.active)) {
        const h = { id: hunt.id, name: hunt.name, found: 0, added: 0 };
        const raw = [];
        const attempt = async (label, fn) => { try { raw.push(...(await fn())); } catch (err) { run.errors.push(`${hunt.name}, ${label}: ${err.message}`); } };
        if (ready.web) await attempt('web search', () => webDiscover(hunt, rejections, creds));
        if (ready.brave) await attempt('Brave news', async () => extract(hunt, await braveNews(hunt), rejections, 'Brave news', creds));
        if (ready.rss) await attempt('RSS feeds', async () => { const items = await rssItems(hunt, cfg); (items.errors || []).forEach((e) => run.errors.push(e)); return extract(hunt, items, rejections, 'RSS feed', creds); });
        h.found = raw.length;
        run.found += raw.length;
        for (const p of raw.slice(0, maxPerHunt * 3)) {
          const company = String(p.company || '').trim();
          const url = String(p.evidence_url || '');
          if (!company || !/^https?:\/\//.test(url) || (Number(p.confidence) || 0) < 0.4) { run.skipped++; continue; }
          const det = L.detectRegion({ country: p.country }, toolkit.REGIONS);
          const region = det.guessed ? hunt.regions[0] : det.region;
          if (!hunt.regions.includes(region)) { run.skipped++; continue; }
          const key = L.normCompany(company);
          const cur = kitStore.get();
          const since = new Date(Date.now() - 180 * 864e5).toISOString();
          const known = cur.leads.some((l) => L.normCompany(l.company) === key)
            || cur.prospects.some((x) => (L.normCompany(x.company) === key && (x.foundAt || '') >= since) || x.evidenceUrl === url);
          if (known) { run.skipped++; continue; }
          const prospect = {
            id: crypto.randomUUID(), company: company.slice(0, 200), country: String(p.country || '').slice(0, 80), region, industry: String(p.industry || '').slice(0, 80),
            signalType: SIGNALS[p.signal_type] ? p.signal_type : 'other', summary: String(p.summary || '').slice(0, 400), whyNow: String(p.why_now || '').slice(0, 400),
            interest: toolkit.DEPARTMENTS.includes(p.interest) ? p.interest : hunt.interest, roles: (Array.isArray(p.roles) ? p.roles : []).map(String).slice(0, 3).join(', ').slice(0, 200),
            evidenceUrl: url.slice(0, 1000), published: String(p.published || '').slice(0, 40), confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)),
            source: p._source, huntId: hunt.id, huntName: hunt.name, status: 'Suggested', foundAt: new Date().toISOString(),
          };
          const s = scoreProspect(prospect, settings);
          prospect.score = s.score; prospect.scoreReasons = s.reasons;
          prospect.owner = pickOwner(region, cfg, settings, cur);
          await kitStore.update((d) => { d.prospects.push(prospect); });
          h.added++; run.added++;
        }
        run.hunts.push(h);
      }
    } catch (err) {
      run.errors.push(err.message);
    } finally {
      run.finishedAt = new Date().toISOString();
      running = null;
      await kitStore.update((d) => {
        d.engineRuns = [run, ...(d.engineRuns || [])].slice(0, 30);
        d.engine = { ...config(), lastRunAt: run.finishedAt };
      });
      broadcast();
      if (run.added && notify) {
        const byOwner = {};
        kitStore.get().prospects.filter((p) => p.status === 'Suggested' && (p.foundAt || '') >= run.startedAt).forEach((p) => { byOwner[p.owner || 'Unassigned'] = (byOwner[p.owner || 'Unassigned'] || 0) + 1; });
        notify(`Lead engine found ${run.added} new prospect${run.added === 1 ? '' : 's'}: ${Object.entries(byOwner).map(([o, n]) => `${o} ${n}`).join(', ')}.`);
      }
    }
    return { busy: false, run };
  }

  function nextRunAt() {
    const cfg = config();
    if (!cfg.enabled) return null;
    const last = Date.parse(cfg.lastRunAt || 0) || 0;
    return new Date(Math.max(Date.now(), last + cfg.intervalMinutes * 60000)).toISOString();
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      const cfg = config();
      if (!cfg.enabled || running) return;
      const last = Date.parse(cfg.lastRunAt || 0) || 0;
      if (Date.now() - last >= cfg.intervalMinutes * 60000) runOnce('schedule').catch((err) => console.error('Lead engine run failed:', err.message));
    }, 60000);
    timer.unref();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  function status(creds) {
    const cfg = config();
    return { ...cfg, running: Boolean(running), nextRunAt: nextRunAt(), sourcesReady: sourcesReady(cfg, creds), aiReady: ai.enabled() || Boolean(creds && creds.apiKey), braveKeySet: Boolean(braveKey), runs: kitStore.get().engineRuns || [], signals: Object.fromEntries(Object.entries(SIGNALS).map(([k, v]) => [k, v.label])) };
  }

  return { runOnce, start, stop, status, config, cleanConfig: (b) => cleanEngineConfig(b, config()) };
}

module.exports = { createEngine, parseFeed, parseJsonArray, DEFAULT_ENGINE, SIGNALS };
