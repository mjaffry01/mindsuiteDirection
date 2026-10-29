'use strict';
const crypto = require('crypto');
const O = require('./outreach');

const REGIONS = ['India', 'Gulf', 'US', 'Europe', 'Asia'];
const DEPARTMENTS = ['Product Engineering', 'Applied AI', 'Cloud & Platform', 'ERP', 'Cyber'];
const SOURCES = ['Outbound', 'LinkedIn', 'Website', 'Webinar', 'Referral', 'Partner', 'Event', 'Clutch'];
const OPEN_STAGES = ['Qualified', 'Proposal', 'Negotiation'];
const STAGES = ['Lead', ...OPEN_STAGES, 'Won', 'Lost'];
const PROBABILITY = { Lead: 0.1, Qualified: 0.2, Proposal: 0.4, Negotiation: 0.6 };
const OFFERS = ['AI Value Sprint', 'Software Health Check', 'DevOps Health Check', 'Cloud Cost & Operations Health Check', 'ERP Health Check', 'Security Assessment', 'Other'];

const GOALS = { pipelineLakh: 1000, pipelineDay: 90, winRate: 25, turnaroundDays: 3, assessments: 20, leads: 220 };

// Field rules per collection: [type, required, allowed values]
const DATE = 'date';
const SCHEMAS = {
  deals: {
    company: ['string', true], contact: ['string'], region: ['enum', true, REGIONS], service: ['enum', true, DEPARTMENTS],
    value: ['number', true], stage: ['enum', true, STAGES], source: ['enum', false, SOURCES],
    nextStep: ['string'], nextDate: [DATE], notes: ['string'], updatedDate: [DATE],
  },
  proposals: {
    company: ['string', true], value: ['number', true], service: ['enum', true, DEPARTMENTS],
    requested: [DATE, true], sent: [DATE], status: ['enum', true, ['Drafting', 'Sent', 'Won', 'Lost']], reason: ['string'],
  },
  assessments: {
    company: ['string', true], offer: ['enum', true, OFFERS], price: ['number', true], signed: [DATE, true],
    status: ['enum', true, ['Signed', 'In progress', 'Delivered']], converted: ['enum', true, ['Pending', 'Yes', 'No']], followOn: ['number'],
  },
  leads: {
    company: ['string', true], contact: ['string'], title: ['string'], email: ['string'], phone: ['string'], country: ['string'],
    region: ['enum', true, REGIONS], source: ['enum', true, SOURCES], date: [DATE, true],
    qualified: ['boolean'], meeting: ['boolean'], dealId: ['string'],
    interest: ['enum', false, [...DEPARTMENTS, 'Not sure']], timeline: ['enum', false, ['Within 3 months', '3–6 months', 'Later', 'Not sure']],
    employees: ['number'], message: ['string'], notes: ['string'],
    score: ['number'], scoreReasons: ['string'], suggestedQualified: ['boolean'],
    channel: ['string'], externalId: ['string'], utmSource: ['string'], utmMedium: ['string'], utmCampaign: ['string'], referrer: ['string'],
    consent: ['boolean'], consentAt: ['string'], touches: ['number'], lastTouch: [DATE],
    status: ['enum', false, O.LSTAT], owner: ['string'], industry: ['string'], disqualReason: ['enum', false, O.DQ],
    firstContact: ['number'], seq: ['seq'],
  },
  prospects: {
    company: ['string', true], country: ['string'], region: ['enum', true, REGIONS], industry: ['string'], signalType: ['string'], summary: ['string'],
    whyNow: ['string'], interest: ['string'], roles: ['string'], evidenceUrl: ['string'], published: ['string'], confidence: ['number'], source: ['string'],
    huntId: ['string'], huntName: ['string'], status: ['enum', true, ['Suggested', 'Accepted', 'Rejected']], foundAt: ['string'], score: ['number'],
    scoreReasons: ['string'], owner: ['string'], rejectReason: ['string'], leadId: ['string'],
  },
  activities: {
    leadId: ['string', true], type: ['enum', true, Object.keys(O.ACT)], date: [DATE, true], at: ['number'], note: ['string'],
  },
  spend: {
    month: ['month', true], region: ['enum', true, REGIONS], channel: ['enum', true, [...SOURCES, 'Agency or appointment setter', 'Tools']],
    amount: ['number', true], note: ['string'],
  },
};
const COLLECTIONS = Object.keys(SCHEMAS);

function validDate(s, monthOnly) {
  const re = monthOnly ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (typeof s !== 'string' || !re.test(s)) return false;
  const [y, m, d = 1] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Returns { record } or { error }. Unknown fields are dropped.
function clean(collection, body) {
  const schema = SCHEMAS[collection];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send the record as a JSON object' };
  const out = {};
  for (const [key, [type, required, allowed]] of Object.entries(schema)) {
    let v = body[key];
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (required) return { error: `${key} is required` };
      continue;
    }
    if (type === 'string') {
      if (typeof v !== 'string') return { error: `${key} must be text` };
      v = v.trim().slice(0, 1000);
    } else if (type === 'number') {
      v = typeof v === 'string' ? Number(v) : v;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return { error: `${key} must be a number of 0 or more` };
      v = Math.round(v * 10) / 10;
    } else if (type === 'boolean') {
      if (typeof v !== 'boolean') return { error: `${key} must be true or false` };
    } else if (type === 'enum') {
      if (!allowed.includes(v)) return { error: `${key} must be one of: ${allowed.join(', ')}` };
    } else if (type === 'seq') {
      if (typeof v !== 'object' || Array.isArray(v) || !O.SEQ[v.id] || !Number.isInteger(v.step) || v.step < 0 || !validDate(v.start)) return { error: `${key} must be a sequence like {"id":"inbound","step":0,"start":"2027-01-04"}` };
      v = { id: v.id, step: v.step, start: v.start, done: Boolean(v.done), ...(v.stopped ? { stopped: String(v.stopped).slice(0, 40) } : {}), ...(v.finished ? { finished: true } : {}) };
    } else if (type === DATE || type === 'month') {
      if (!validDate(v, type === 'month')) return { error: `${key} must be a date like ${type === 'month' ? '2027-01' : '2027-01-31'}` };
    }
    out[key] = v;
  }
  if (collection === 'proposals') {
    if (out.status !== 'Drafting' && !out.sent) return { error: 'Add the date it was sent, or set the status back to Drafting' };
    if (out.sent && out.sent < out.requested) return { error: 'The sent date can’t be before the request date' };
  }
  return { record: out };
}

function newId() {
  return crypto.randomUUID();
}

// Working days (Monday to Friday) after `from`, up to and including `to`.
function workingDays(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  let n = 0;
  while (a < b) {
    a.setUTCDate(a.getUTCDate() + 1);
    const g = a.getUTCDay();
    if (g !== 0 && g !== 6) n += 1;
  }
  return n;
}

function todayIso(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

function summary(data, now = new Date()) {
  const open = data.deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const pipeline = open.reduce((s, d) => s + (d.value || 0), 0);
  const weighted = open.reduce((s, d) => s + (d.value || 0) * (PROBABILITY[d.stage] || 0), 0);
  const decided = data.proposals.filter((p) => p.status === 'Won' || p.status === 'Lost');
  const won = decided.filter((p) => p.status === 'Won').length;
  const sent = data.proposals.filter((p) => p.sent);
  const tats = sent.map((p) => workingDays(p.requested, p.sent));
  const today = todayIso(now);
  const late = data.proposals.filter((p) => p.status === 'Drafting' && workingDays(p.requested, today) > GOALS.turnaroundDays).length;
  const converted = data.assessments.filter((a) => a.converted === 'Yes').length;
  const decidedAssessments = data.assessments.filter((a) => a.converted === 'Yes' || a.converted === 'No').length;
  return {
    goals: GOALS,
    pipeline: { open: Math.round(pipeline * 10) / 10, weighted: Math.round(weighted * 10) / 10, deals: open.length },
    winRate: { percent: decided.length ? Math.round((won / decided.length) * 100) : null, won, decided: decided.length },
    turnaround: {
      averageDays: tats.length ? Math.round((tats.reduce((a, b) => a + b, 0) / tats.length) * 10) / 10 : null,
      onTime: tats.filter((t) => t <= GOALS.turnaroundDays).length, sent: sent.length, lateDrafts: late,
    },
    assessments: { signed: data.assessments.length, converted, decided: decidedAssessments },
    leads: { total: data.leads.length, qualified: data.leads.filter((l) => l.qualified).length, meetings: data.leads.filter((l) => l.meeting).length },
  };
}

const EMPTY = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

module.exports = { COLLECTIONS, SCHEMAS, EMPTY, REGIONS, DEPARTMENTS, SOURCES, clean, newId, summary, workingDays, todayIso };
