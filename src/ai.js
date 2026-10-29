'use strict';
// AI message drafting through OpenRouter (https://openrouter.ai), which gives one
// API for many models. The API key is read from the environment on the server
// and is never sent to the browser or written to logs.
const { OFFER_FOR, fill, currentStep } = require('./outreach');

function createAi(options = {}) {
  const key = options.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? '';
  const model = options.openrouterModel ?? process.env.OPENROUTER_MODEL ?? 'openrouter/auto';
  const base = (options.openrouterBaseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const appUrl = options.appUrl ?? process.env.APP_URL ?? '';
  const timeoutMs = Number(options.aiTimeoutMs ?? 30000);
  const perMinute = Number(options.aiRateLimit ?? process.env.AI_RATE_LIMIT ?? 20);
  const recent = [];

  const enabled = () => Boolean(key);
  const status = () => ({ enabled: enabled(), provider: 'OpenRouter', model: enabled() ? model : null });

  function buildMessages(lead, step) {
    const system = 'You write sales outreach for MindSuite, an Indian technology services company (software engineering, applied AI, cloud and DevOps, ERP, cybersecurity) selling in India, the Gulf, the US, Europe and Asia. Sound like a thoughtful person, not a marketer. Use only the facts given about the lead; never invent facts, results, numbers or client names. Put anything the sender must check or fill in inside [square brackets]. Reply with the message only, with no preamble.';
    let format;
    if (step.st[1] === 'Email') format = 'An email: the first line is "Subject: ...", then a body under 120 words.';
    else if (step.st[1] === 'LinkedIn') format = step.st[3] === 'li_connect' ? 'A LinkedIn connection note under 280 characters.' : 'A LinkedIn message under 600 characters.';
    else format = 'A short call talk track: an opener, three discovery questions and a close.';
    const facts = {
      company: lead.company, contact: lead.contact, title: lead.title, region: lead.region, country: lead.country, industry: lead.industry,
      interest: lead.interest, timeline: lead.timeline, source: lead.source, notes: lead.notes, message: lead.message,
    };
    const user = [
      `Step: ${step.st[1]}, ${step.st[2]} (step ${step.n + 1} of ${step.S.steps.length} in "${step.S.name}").`,
      `Lead: ${JSON.stringify(facts)}`,
      `Suggested first step to offer: ${OFFER_FOR[lead.interest] || 'AI Value Sprint'} (a paid, fixed-scope assessment).`,
      `Starting template:\n${fill(step.st[3], lead)}`,
      `Format: ${format} Sign off as ${lead.owner || '[your name]'}.`,
    ].join('\n\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  // One chat completion through OpenRouter. `plugins` can add OpenRouter's web
  // search. Returns { text, model, citations }.
  async function chat(messages, { maxTokens = 700, temperature = 0.6, plugins, modelOverride, timeout = timeoutMs, creds } = {}) {
    const useKey = (creds && creds.apiKey) || key;
    if (!useKey) { const e = new Error('Set OPENROUTER_API_KEY on the server to use AI features.'); e.status = 503; throw e; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const useModel = modelOverride || (creds && creds.model) || model;
    let res;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${useKey}`, 'Content-Type': 'application/json', ...(appUrl ? { 'HTTP-Referer': appUrl } : {}), 'X-Title': 'MindSuite' },
        body: JSON.stringify({ model: useModel, messages, max_tokens: maxTokens, temperature, ...(plugins ? { plugins } : {}) }),
      });
    } catch (err) {
      const e = new Error(err.name === 'AbortError' ? 'The AI model took too long to answer. Try again.' : 'Couldn’t reach OpenRouter. Check the server’s internet connection.');
      e.status = 502; throw e;
    } finally { clearTimeout(timer); }
    let body = {};
    try { body = await res.json(); } catch { /* handled below */ }
    if (!res.ok) {
      const messagesByStatus = {
        401: 'OpenRouter rejected the API key. Check OPENROUTER_API_KEY.', 402: 'The OpenRouter account is out of credits.',
        403: 'OpenRouter refused this request for the chosen model.', 404: `OpenRouter doesn’t recognise the model “${useModel}”. Check the model name.`,
        429: 'OpenRouter is rate limiting requests. Try again in a minute.',
      };
      const e = new Error(messagesByStatus[res.status] || `OpenRouter returned an error (${res.status}).`);
      e.status = res.status === 429 ? 429 : 502; throw e;
    }
    const msg = body && body.choices && body.choices[0] && body.choices[0].message;
    const text = msg && msg.content;
    if (!text || !String(text).trim()) { const e = new Error('The AI model returned an empty answer. Try again.'); e.status = 502; throw e; }
    const citations = ((msg && msg.annotations) || []).filter((a) => a && a.type === 'url_citation' && a.url_citation).map((a) => ({ url: a.url_citation.url, title: a.url_citation.title || '' }));
    return { text: String(text).trim(), model: body.model || useModel, citations };
  }

  async function draft(lead, creds) {
    if (!(creds && creds.apiKey) && !enabled()) { const e = new Error('AI drafting is off. Set OPENROUTER_API_KEY on the server to turn it on.'); e.status = 503; throw e; }
    const step = currentStep(lead);
    if (!step) { const e = new Error('This lead isn’t on a sequence step, so there’s nothing to draft.'); e.status = 400; throw e; }
    const now = Date.now();
    while (recent.length && now - recent[0] > 60000) recent.shift();
    if (recent.length >= perMinute) { const e = new Error('Too many drafts in the last minute. Try again shortly.'); e.status = 429; throw e; }
    recent.push(now);

    const out = await chat(buildMessages(lead, step), { maxTokens: 700, temperature: 0.6, creds });
    return { text: out.text, model: out.model };
  }

  // OpenRouter's public model list, trimmed and cached for an hour.
  let modelsCache = null;
  async function listModels() {
    if (modelsCache && Date.now() - modelsCache.at < 3600000) return modelsCache.list;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`${base}/models`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`OpenRouter returned ${r.status}`);
      const body = await r.json();
      const perMillion = (v) => (v === undefined || v === null || v === '' ? null : Math.round(Number(v) * 1e6 * 100) / 100);
      const list = (body.data || []).filter((m) => m && m.id).map((m) => ({
        id: m.id, name: m.name || m.id, context: m.context_length || null,
        promptPrice: perMillion(m.pricing && m.pricing.prompt), completionPrice: perMillion(m.pricing && m.pricing.completion),
      })).sort((a, b) => a.name.localeCompare(b.name));
      modelsCache = { at: Date.now(), list };
      return list;
    } finally { clearTimeout(t); }
  }

  // A tiny request that proves the key and model work together.
  async function test(creds) {
    const out = await chat([{ role: 'user', content: 'Reply with the single word OK.' }], { maxTokens: 5, temperature: 0, creds, timeout: 20000 });
    return { ok: true, model: out.model };
  }

  return { status, draft, chat, buildMessages, enabled, listModels, test, companyModel: () => model, companyKeySet: () => Boolean(key) };
}

module.exports = { createAi };
