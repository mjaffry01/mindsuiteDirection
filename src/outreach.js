'use strict';
// Outreach library shared by the server and the browser: lead statuses,
// activity types, sequences and message templates.

const LSTAT = ['New', 'Contacted', 'Engaged', 'Qualified', 'Meeting booked', 'Converted', 'Disqualified'];
const OPEN_LSTAT = ['New', 'Contacted', 'Engaged', 'Qualified'];
const DQ = ['Not our ideal client', 'No budget', 'Bad timing', 'Chose another provider', 'No response after sequence', 'Duplicate or spam', 'Other'];
// p = engagement points, out = counts as an outbound touch
const ACT = {
  'Email sent': { p: 0, out: true }, 'LinkedIn message': { p: 0, out: true }, 'Call, no answer': { p: 0, out: true },
  'Call, connected': { p: 10, out: true }, Replied: { p: 15 }, 'Meeting booked': { p: 20 }, Note: { p: 0 },
};
const OFFER_FOR = {
  'Applied AI': 'AI Value Sprint', 'Product Engineering': 'Software Health Check', 'Cloud & Platform': 'Cloud Cost & Operations Health Check',
  ERP: 'ERP Health Check', Cyber: 'Security Assessment',
};

const TPL = {
  inbound_reply: { name: 'Reply to an enquiry', text: 'Subject: Your enquiry about {{interest}}\n\nHi {{first_name}},\n\nThank you for getting in touch about {{interest}} at {{company}}. I lead this work at MindSuite and would like to understand what you’re trying to achieve before suggesting anything.\n\nCould we speak for 30 minutes? I’m free [day and time] or [day and time] ({{region}} time).\n\nBest regards,\n{{sender}}' },
  li_connect: { name: 'LinkedIn connection note', text: 'Hi {{first_name}}, I work with {{interest_lower}} teams at companies like {{company}} in {{region}}. I’d be glad to connect and share what’s working for them.' },
  li_message: { name: 'LinkedIn follow-up message', text: 'Thanks for connecting, {{first_name}}. A question many {{title_or_role}}s raise with us: [the specific problem, in one line]. We usually start with a short, fixed-price {{offer}} to find the quickest win. Is that on your list this quarter?' },
  email_problem: { name: 'First outbound email', text: 'Subject: {{company}} and [the problem in a few words]\n\nHi {{first_name}},\n\n[One sentence on something specific to {{company}}: a recent announcement, hiring, a product launch.]\n\nTeams in your position often find [the problem] slows them down. MindSuite helps by [what we do, in one line], starting with a fixed-scope {{offer}} so you see results before committing to more.\n\nWould a 20-minute call next week be useful?\n\n{{sender}}' },
  case_study: { name: 'Follow-up with a case study', text: 'Subject: How [similar company] handled [problem]\n\nHi {{first_name}},\n\nFollowing up with a short example: [similar client] had [problem]. In [timeframe] we [what we did], which [result with a real number].\n\nI think a similar approach could work at {{company}}. Worth a quick conversation?\n\n{{sender}}' },
  event_followup: { name: 'Event follow-up', text: 'Subject: Good to meet you at {{event}}\n\nHi {{first_name}},\n\nIt was good to talk at {{event}} about [what you discussed]. As promised, here’s [the thing you promised: case study, idea, intro].\n\nIf it’s useful, we could look at this properly in a short {{offer}}. Shall I send over a couple of times?\n\n{{sender}}' },
  assessment_offer: { name: 'Paid assessment offer', text: 'Subject: A fixed-price first step for {{company}}\n\nHi {{first_name}},\n\nRather than a big proposal, most clients start with our {{offer}}: a fixed scope, a fixed price, and a clear plan at the end, whether or not you work with us afterwards.\n\nWould it help if I sent the one-page outline?\n\n{{sender}}' },
  breakup: { name: 'Last check-in', text: 'Subject: Close the loop?\n\nHi {{first_name}},\n\nI haven’t heard back, so I’ll assume the timing isn’t right and stop following up. If [the problem] becomes a priority, just reply to this email and I’ll pick it up.\n\nAll the best,\n{{sender}}' },
  reengage: { name: 'Re-engage an old lead', text: 'Subject: Something new on [topic]\n\nHi {{first_name}},\n\nWe spoke a while ago about {{interest_lower}}. Since then we’ve [new capability, result or insight], which made me think of {{company}}.\n\nIs this worth revisiting?\n\n{{sender}}' },
  call_script: { name: 'Discovery call opener', text: 'Opening: “Hi {{first_name}}, it’s {{sender}} from MindSuite. I sent a note about {{interest_lower}}. Have I caught you at a bad time?”\n\nAsk: What’s prompting you to look at this now? What happens if nothing changes? Who else is involved in the decision? When would you want to start?\n\nClose: “The usual first step is a fixed-price {{offer}}. Shall we book 30 minutes to scope it?”' },
};

// Each step: [day, channel, what to do, template key]
const SEQ = {
  inbound: { name: 'Inbound: fast response', use: 'Website, webinar and referral leads. Reply the same day.', steps: [[0, 'Email', 'Reply personally and offer two meeting times', 'inbound_reply'], [0, 'LinkedIn', 'Connect with a short note', 'li_connect'], [2, 'Call', 'Call to book the discovery meeting', 'call_script'], [4, 'Email', 'Share a relevant case study', 'case_study'], [7, 'Email', 'Last check-in', 'breakup']] },
  gulf: { name: 'Outbound: Gulf and India decision-makers', use: 'Senior leaders in the Gulf and India, where relationships come first.', steps: [[0, 'LinkedIn', 'Connect with a short note', 'li_connect'], [2, 'LinkedIn', 'Send a value-led message', 'li_message'], [4, 'Email', 'Lead with the problem and the paid first step', 'email_problem'], [7, 'Call', 'Call to introduce yourself', 'call_script'], [10, 'Email', 'Share a case study', 'case_study'], [14, 'Email', 'Last check-in', 'breakup']] },
  west: { name: 'Outbound: US and Europe tech leaders', use: 'CTOs and engineering leaders in the US and Europe, who prefer short emails.', steps: [[0, 'Email', 'Short, problem-led first email', 'email_problem'], [1, 'LinkedIn', 'Connect with a short note', 'li_connect'], [3, 'Email', 'Follow up with proof', 'case_study'], [6, 'LinkedIn', 'Send a value-led message', 'li_message'], [9, 'Call', 'Call to introduce yourself', 'call_script'], [13, 'Email', 'Last check-in', 'breakup']] },
  event: { name: 'Event follow-up', use: 'People you met at GITEX, LEAP or London Tech Week. Start within 2 days of the event.', steps: [[0, 'Email', 'Follow up on your conversation', 'event_followup'], [0, 'LinkedIn', 'Connect with a short note', 'li_connect'], [3, 'Call', 'Call to book a meeting', 'call_script'], [6, 'Email', 'Offer the paid assessment', 'assessment_offer'], [10, 'Email', 'Last check-in', 'breakup']] },
  reengage: { name: 'Re-engage cold or lost leads', use: 'Leads that went quiet more than 90 days ago.', steps: [[0, 'Email', 'Share something new', 'reengage'], [5, 'LinkedIn', 'Send a value-led message', 'li_message'], [12, 'Email', 'Last check-in', 'breakup']] },
};

function fill(key, l) {
  const t = TPL[key] ? TPL[key].text : '';
  const first = String(l.contact || '').trim().split(/\s+/)[0] || '[first name]';
  const interest = l.interest && l.interest !== 'Not sure' ? l.interest : 'your technology plans';
  const map = {
    first_name: first, company: l.company || '[company]', region: l.region || '', interest,
    interest_lower: interest === 'your technology plans' ? 'technology' : interest,
    offer: OFFER_FOR[l.interest] || 'AI Value Sprint', event: '[event name]', sender: l.owner || '[your name]',
    title_or_role: l.title ? l.title.split(/[,(]/)[0].trim() : 'technology leader',
  };
  return t.replace(/\{\{(\w+)\}\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));
}

// The step a lead is currently on, or null.
function currentStep(lead) {
  const s = lead.seq;
  if (!s || s.done || !SEQ[s.id]) return null;
  const S = SEQ[s.id];
  const st = S.steps[s.step];
  return st ? { S, st, n: s.step } : null;
}

module.exports = { LSTAT, OPEN_LSTAT, DQ, ACT, OFFER_FOR, TPL, SEQ, fill, currentStep };
