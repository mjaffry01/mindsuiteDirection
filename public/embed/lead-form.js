/*
 * MindSuite lead form. Add to any web page:
 *   <div data-mindsuite-lead-form data-source="Website" data-interest="Applied AI"></div>
 *   <script src="https://YOUR-SERVER/embed/lead-form.js" async></script>
 * The page's address must be listed in LEAD_FORM_ORIGINS on the server.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var api = (script && script.src ? new URL(script.src).origin : '') + '/api/public/leads';
  var INTERESTS = ['Not sure', 'Applied AI', 'Product Engineering', 'Cloud & Platform', 'ERP', 'Cyber'];
  var TIMELINES = ['Not sure', 'Within 3 months', '3–6 months', 'Later'];
  var CSS = '.msl{font:inherit;max-width:560px}.msl *{box-sizing:border-box}.msl .msl-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '.msl label{display:flex;flex-direction:column;gap:4px;font-size:14px;margin-bottom:12px}'
    + '.msl input,.msl select,.msl textarea{font:inherit;font-size:15px;padding:8px 10px;border:1px solid #b8bfcc;border-radius:8px;background:#fff;color:#18213a;width:100%}'
    + '.msl input:focus-visible,.msl select:focus-visible,.msl textarea:focus-visible,.msl button:focus-visible{outline:2px solid #2c5bd6;outline-offset:2px}'
    + '.msl .msl-check{flex-direction:row;align-items:flex-start;gap:8px}.msl .msl-check input{width:auto;margin-top:3px}'
    + '.msl button{font:inherit;font-weight:600;padding:10px 18px;border-radius:8px;border:0;background:#18213a;color:#fff;cursor:pointer}'
    + '.msl button[disabled]{opacity:.6;cursor:default}.msl .msl-msg{margin-top:10px;font-size:14px}.msl .msl-err{color:#b3261e}'
    + '.msl .msl-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}'
    + '@media (max-width:520px){.msl .msl-row{grid-template-columns:1fr}}';

  function el(t, a, k) {
    var e = document.createElement(t);
    for (var x in (a || {})) if (a[x] !== null && a[x] !== undefined && a[x] !== false) {
      if (x === 'text') e.textContent = a[x]; else e.setAttribute(x, a[x] === true ? '' : a[x]);
    }
    (k || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function field(label, input) { return el('label', {}, [label, input]); }
  function select(name, opts, value) { return el('select', { name: name }, opts.map(function (o) { return el('option', { value: o, selected: o === value }, [o]); })); }

  function mount(host, n) {
    if (host.getAttribute('data-ready')) return;
    host.setAttribute('data-ready', '1');
    var id = 'msl' + n;
    var started = Date.now();
    var msg = el('div', { class: 'msl-msg', role: 'status', 'aria-live': 'polite' });
    var form = el('form', { class: 'msl', novalidate: true }, [
      el('div', { class: 'msl-row' }, [
        field('Your name', el('input', { name: 'name', autocomplete: 'name', required: true })),
        field('Work email', el('input', { name: 'email', type: 'email', autocomplete: 'email', required: true })),
      ]),
      el('div', { class: 'msl-row' }, [
        field('Company', el('input', { name: 'company', autocomplete: 'organization', required: true })),
        field('Job title', el('input', { name: 'title', autocomplete: 'organization-title' })),
      ]),
      el('div', { class: 'msl-row' }, [
        field('Country', el('input', { name: 'country', autocomplete: 'country-name' })),
        field('Phone (optional)', el('input', { name: 'phone', type: 'tel', autocomplete: 'tel' })),
      ]),
      el('div', { class: 'msl-row' }, [
        field('What can we help with?', select('interest', INTERESTS, host.getAttribute('data-interest') || 'Not sure')),
        field('When do you want to start?', select('timeline', TIMELINES, 'Not sure')),
      ]),
      field('Tell us briefly what you need', el('textarea', { name: 'message', rows: '4' })),
      el('label', { class: 'msl-hp', 'aria-hidden': 'true' }, ['Website', el('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })]),
      el('label', { class: 'msl-check' }, [el('input', { type: 'checkbox', name: 'consent', required: true, id: id + 'c' }),
        'I agree that MindSuite may contact me about this enquiry and store these details for that purpose.']),
      el('button', { type: 'submit', text: host.getAttribute('data-button') || 'Send enquiry' }),
      msg,
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements, btn = form.querySelector('button');
      msg.className = 'msl-msg';
      if (!f.name.value.trim() || !f.company.value.trim()) { msg.className += ' msl-err'; msg.textContent = 'Please enter your name and company.'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) { msg.className += ' msl-err'; msg.textContent = 'Please enter a valid work email address.'; f.email.focus(); return; }
      if (!f.consent.checked) { msg.className += ' msl-err'; msg.textContent = 'Please tick the box to agree to be contacted.'; return; }
      var q = new URLSearchParams(location.search);
      var body = {
        name: f.name.value.trim(), email: f.email.value.trim(), company: f.company.value.trim(), title: f.title.value.trim(),
        country: f.country.value.trim(), phone: f.phone.value.trim(), interest: f.interest.value, timeline: f.timeline.value,
        message: f.message.value.trim(), consent: true, website: f.website.value, _t: started,
        source: q.get('source') || host.getAttribute('data-source') || 'Website',
        utm_source: q.get('utm_source') || undefined, utm_medium: q.get('utm_medium') || undefined, utm_campaign: q.get('utm_campaign') || undefined,
        referrer: document.referrer || location.href,
      };
      btn.disabled = true; msg.textContent = 'Sending…';
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }); })
        .then(function (j) { form.reset(); msg.textContent = j.message || 'Thank you. We’ll reply within one working day.'; })
        .catch(function (err) { msg.className += ' msl-err'; msg.textContent = err.message + ' You can also email us directly.'; })
        .then(function () { btn.disabled = false; });
    });
    host.appendChild(form);
  }

  if (!document.getElementById('msl-style')) { var st = el('style', { id: 'msl-style' }); st.textContent = CSS; document.head.appendChild(st); }
  function init() { Array.prototype.forEach.call(document.querySelectorAll('[data-mindsuite-lead-form]'), mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
