'use strict';
// Lead generation helpers: region detection, scoring against the ideal client
// profile, duplicate detection and CSV handling. No network calls here.

const GULF = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'];
const EUROPE = ['GB', 'UK', 'IE', 'FR', 'DE', 'NL', 'BE', 'LU', 'ES', 'PT', 'IT', 'AT', 'CH', 'DK', 'SE', 'NO', 'FI', 'IS', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'EE', 'LV', 'LT', 'CY', 'MT'];
const ASIA = ['SG', 'MY', 'ID', 'TH', 'VN', 'PH', 'AU', 'NZ', 'JP', 'KR', 'HK', 'TW', 'LK', 'BD', 'NP'];
const AMERICAS = ['US', 'CA'];
const NAMES = {
  india: 'IN', 'united arab emirates': 'AE', uae: 'AE', dubai: 'AE', 'abu dhabi': 'AE', 'saudi arabia': 'SA', ksa: 'SA', saudi: 'SA', qatar: 'QA',
  kuwait: 'KW', bahrain: 'BH', oman: 'OM', 'united states': 'US', usa: 'US', 'united states of america': 'US', america: 'US', canada: 'CA',
  'united kingdom': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', britain: 'GB', 'great britain': 'GB', ireland: 'IE', france: 'FR',
  germany: 'DE', netherlands: 'NL', holland: 'NL', belgium: 'BE', luxembourg: 'LU', spain: 'ES', portugal: 'PT', italy: 'IT', austria: 'AT',
  switzerland: 'CH', denmark: 'DK', sweden: 'SE', norway: 'NO', finland: 'FI', iceland: 'IS', poland: 'PL', 'czech republic': 'CZ', czechia: 'CZ',
  slovakia: 'SK', hungary: 'HU', romania: 'RO', bulgaria: 'BG', greece: 'GR', croatia: 'HR', slovenia: 'SI', estonia: 'EE', latvia: 'LV',
  lithuania: 'LT', cyprus: 'CY', malta: 'MT', singapore: 'SG', malaysia: 'MY', indonesia: 'ID', thailand: 'TH', vietnam: 'VN', philippines: 'PH',
  australia: 'AU', 'new zealand': 'NZ', japan: 'JP', 'south korea': 'KR', korea: 'KR', 'hong kong': 'HK', taiwan: 'TW', 'sri lanka': 'LK',
  bangladesh: 'BD', nepal: 'NP',
};
const DIAL = [['+971', 'Gulf'], ['+966', 'Gulf'], ['+974', 'Gulf'], ['+965', 'Gulf'], ['+973', 'Gulf'], ['+968', 'Gulf'], ['+91', 'India'], ['+1', 'US'],
  ['+44', 'Europe'], ['+353', 'Europe'], ['+49', 'Europe'], ['+33', 'Europe'], ['+31', 'Europe'], ['+46', 'Europe'], ['+47', 'Europe'], ['+45', 'Europe'],
  ['+65', 'Asia'], ['+60', 'Asia'], ['+61', 'Asia'], ['+64', 'Asia'], ['+81', 'Asia'], ['+852', 'Asia']];

function countryCode(country) {
  if (!country) return null;
  const c = String(country).trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  return NAMES[c.toLowerCase()] || null;
}

// Returns { region, guessed } — guessed is true when nothing reliable was found.
function detectRegion({ region, country, phone }, regions) {
  if (region && regions.includes(region)) return { region, guessed: false };
  const cc = countryCode(country);
  if (cc === 'IN') return { region: 'India', guessed: false };
  if (cc && GULF.includes(cc)) return { region: 'Gulf', guessed: false };
  if (cc && AMERICAS.includes(cc)) return { region: 'US', guessed: false };
  if (cc && EUROPE.includes(cc)) return { region: 'Europe', guessed: false };
  if (cc && ASIA.includes(cc)) return { region: 'Asia', guessed: false };
  const p = String(phone || '').replace(/[\s()-]/g, '');
  const hit = DIAL.slice().sort((a, b) => b[0].length - a[0].length).find(([code]) => p.startsWith(code));
  if (hit) return { region: hit[1], guessed: false };
  return { region: 'India', guessed: true };
}

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'rediffmail.com', 'zoho.com', 'gmx.com', 'gmx.de', 'yandex.com', 'mail.com']);

function emailDomain(email) {
  const m = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/.exec(String(email || '').trim().toLowerCase());
  return m ? m[1] : null;
}
function isBusinessEmail(email) {
  const d = emailDomain(email);
  return Boolean(d && !FREE_MAIL.has(d));
}
function validEmail(email) {
  return emailDomain(email) !== null && String(email).length <= 254;
}

// Scores a lead from 0 to 100 against MindSuite's ideal client profile.
// A score of 60 or more marks it as suggested for qualification; a person
// still confirms it, as the sales guide says.
function scoreLead(lead, settings = {}) {
  const priority = settings.priority && settings.priority.length ? settings.priority : ['Gulf', 'US', 'Europe'];
  const industries = (settings.industries || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  let score = 0;
  const reasons = [];
  const add = (n, why) => { score += n; reasons.push(`${why} (+${n})`); };
  if (priority.includes(lead.region)) add(15, `Priority region: ${lead.region}`);
  else if (lead.region) add(10, `Target region: ${lead.region}`);
  if (isBusinessEmail(lead.email)) add(15, 'Business email address');
  const ind = String(lead.industry || '').toLowerCase();
  if (ind && industries.some((x) => ind.includes(x) || x.includes(ind))) add(10, `Target industry: ${lead.industry}`);
  const t = String(lead.title || '').toLowerCase();
  if (/\b(ceo|cto|cio|cfo|coo|ciso|cdo|chief|founder|co-founder|owner|president|partner|vp|vice president|head|director|gm|general manager)\b/.test(t)) add(20, 'Senior decision-maker');
  else if (/\b(manager|lead|principal|architect)\b/.test(t)) add(10, 'Manager or technical lead');
  const e = Number(lead.employees);
  if (e >= 50 && e <= 5000) add(15, 'Company size 50–5,000');
  else if (e > 5000) add(10, 'Enterprise company');
  else if (e >= 10) add(5, 'Company size 10–49');
  if (lead.interest && lead.interest !== 'Not sure') add(15, `Interested in ${lead.interest}`);
  const msg = String(lead.message || '').toLowerCase();
  if (/value sprint|health check|assessment|audit|pilot|starter package|penetration test/.test(msg)) add(10, 'Asked about a paid entry offer');
  if (lead.timeline === 'Within 3 months') add(15, 'Wants to start within 3 months');
  else if (lead.timeline === '3–6 months') add(10, 'Wants to start in 3–6 months');
  if (msg.length >= 40) add(5, 'Described their need');
  score = Math.min(100, score);
  return { score, reasons, suggestedQualified: score >= 60 };
}

function normCompany(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(private|pvt|limited|ltd|llc|llp|inc|incorporated|corp|corporation|co|company|gmbh|bv|sa|ag|plc|pjsc|psc|wll|spc|saog|saoc|fzc|fz|fze|fzco|fzllc|technologies|technology|tech|solutions|group)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Finds an existing lead for the same person (email) or the same company in
// the same region within the last 180 days.
function findDuplicate(leads, lead, today) {
  const email = String(lead.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = leads.find((l) => String(l.email || '').toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const key = normCompany(lead.company);
  if (!key) return null;
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 180);
  const since = cutoff.toISOString().slice(0, 10);
  return leads.find((l) => normCompany(l.company) === key && l.region === lead.region && (l.lastTouch || l.date || '') >= since) || null;
}

// RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF or LF).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, q = false;
  const s = String(text).replace(/^\uFEFF/, '');
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// Escapes a CSV cell and neutralises spreadsheet formulas.
function csvCell(v) {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function normalizeInterest(v) {
  const DEPTS = ['Product Engineering', 'Applied AI', 'Cloud & Platform', 'ERP', 'Cyber', 'Not sure'];
  if (!v) return undefined;
  if (DEPTS.includes(v)) return v;
  const t = String(v).toLowerCase();
  if (/\berp\b|odoo|netsuite|\bsap\b|dynamics|erpnext/.test(t)) return 'ERP';
  if (/cyber|security|pentest|penetration|vciso|compliance|soc\b/.test(t)) return 'Cyber';
  if (/\bai\b|genai|machine learning|\bml\b|llm|chatbot|assistant|automation/.test(t)) return 'Applied AI';
  if (/cloud|devops|aws|azure|gcp|kubernetes|sre|platform|migration/.test(t)) return 'Cloud & Platform';
  if (/software|\bapp\b|product|mvp|integration|\bapi\b|web|mobile|saas/.test(t)) return 'Product Engineering';
  return 'Not sure';
}
function normalizeTimeline(v) {
  const T = ['Within 3 months', '3–6 months', 'Later', 'Not sure'];
  if (!v) return undefined;
  if (T.includes(v)) return v;
  const t = String(v).toLowerCase().replace(/-/g, '–');
  if (/3–6|3 to 6|next quarter/.test(t)) return '3–6 months';
  if (/now|asap|immediate|urgent|this month|within 3|1–3|0–3/.test(t)) return 'Within 3 months';
  if (/later|next year|6\+|12/.test(t)) return 'Later';
  return 'Not sure';
}

// Prepares a lead saved from the app: region from country or phone, tidy
// answers, duplicate check and score. Returns { error } or { lead }.
function prepareLead(record, existing, settings, skipId, regions) {
  const r = { ...record };
  if (r.email) r.email = String(r.email).trim().toLowerCase();
  if (r.email && !validEmail(r.email)) return { error: 'Enter a valid email address, or leave it empty.' };
  const det = detectRegion({ country: r.country, phone: r.phone }, regions);
  if (!det.guessed && (!r.region || r.region === 'India')) r.region = det.region;
  if (r.interest) r.interest = normalizeInterest(r.interest);
  if (r.timeline) r.timeline = normalizeTimeline(r.timeline);
  if (!skipId) {
    const dup = findDuplicate(existing.filter((x) => x.id !== skipId), r, new Date().toISOString().slice(0, 10));
    if (dup) return { error: `This lead is already in the list: ${dup.company}${dup.email ? ` (${dup.email})` : ''}. Open that one and update it instead.`, duplicate: dup };
  }
  const s = scoreLead(r, settings);
  r.score = s.score; r.scoreReasons = s.reasons.join('; '); r.suggestedQualified = s.suggestedQualified;
  return { lead: r };
}

module.exports = { prepareLead, normalizeInterest, normalizeTimeline, detectRegion, countryCode, scoreLead, isBusinessEmail, validEmail, emailDomain, normCompany, findDuplicate, parseCsv, csvCell };
