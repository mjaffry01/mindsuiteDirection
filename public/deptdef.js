// Department definition card: right-click a department name (or use the
// "What this department does" button) to see its definition, KPIs with live
// values, responsibilities and the services it delivers.
(function () {
  'use strict';
  var KIT_MAP = { 'Product Engineering': 'pe', 'Applied AI': 'ai', 'Cloud & Platform': 'cloud', ERP: 'erp', Cyber: 'cyber' };
  var planCache = null, box = null, back = null, seq = 0;

  function get(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function loadPlan() { return planCache ? Promise.resolve(planCache) : get('/api/plan').then(function (p) { planCache = p; return p; }); }
  function el(t, a, k) {
    var e = document.createElement(t);
    for (var x in (a || {})) if (a[x] !== null && a[x] !== undefined) {
      if (x === 'text') e.textContent = a[x]; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), a[x]); else e.setAttribute(x, a[x]);
    }
    (k || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function money(v) { v = +v || 0; return v >= 100 ? '₹' + (Math.round(v) / 100).toFixed(2).replace(/\.?0+$/, '') + ' Cr' : '₹' + (Math.round(v * 10) / 10) + ' lakh'; }
  function workingDays(a, b) {
    var d = new Date(a + 'T00:00:00'), e = new Date(b + 'T00:00:00'), n = 0;
    while (d < e) { d.setDate(d.getDate() + 1); var g = d.getDay(); if (g !== 0 && g !== 6) n++; }
    return n;
  }

  // Current value for the KPIs the app can measure; null for the rest.
  function liveVal(k, plan, kit, state) {
    if (k === 'plan') {
      if (!state) return null;
      var st = state.start.split('-'), today = new Date(); today.setHours(0, 0, 0, 0);
      var day = Math.round((today - new Date(+st[0], +st[1] - 1, +st[2])) / 864e5) + 1, due = 0, done = 0;
      if (day <= 1) return 'Plan not started';
      plan.days.forEach(function (dd) {
        if (dd.d >= day) return;
        var ids = []; if (dd.min) ids.push(dd.d + '-m');
        dd.t.forEach(function (x, i) { ids.push(dd.d + '-' + i); });
        (dd.s || []).forEach(function (x, i) { ids.push(dd.d + '-s' + i); });
        ids.forEach(function (id) { due++; if (state.done[id]) done++; });
      });
      return Math.round(done / due * 100) + '% of tasks due so far';
    }
    if (!kit) return null;
    if (k === 'pipeline') {
      return money(kit.deals.filter(function (d) { return ['Qualified', 'Proposal', 'Negotiation'].indexOf(d.stage) >= 0; })
        .reduce(function (s, d) { return s + (+d.value || 0); }, 0));
    }
    if (k === 'win') {
      var dec = kit.proposals.filter(function (p) { return p.status === 'Won' || p.status === 'Lost'; });
      var won = dec.filter(function (p) { return p.status === 'Won'; }).length;
      return dec.length ? Math.round(won / dec.length * 100) + '% (' + won + ' of ' + dec.length + ')' : 'No results yet';
    }
    if (k === 'tat') {
      var sent = kit.proposals.filter(function (p) { return p.sent && p.requested; });
      if (!sent.length) return 'None sent yet';
      var avg = sent.reduce(function (s, p) { return s + workingDays(p.requested, p.sent); }, 0) / sent.length;
      return Math.round(avg * 10) / 10 + ' working days';
    }
    if (k === 'assess') return kit.assessments.length + ' signed, ' + kit.assessments.filter(function (a) { return a.converted === 'Yes'; }).length + ' became projects';
    if (k === 'sprints') return kit.assessments.filter(function (a) { return a.offer === 'AI Value Sprint'; }).length + ' sold';
    if (k === 'leads') return kit.leads.length + ' so far';
    if (k === 'qualrate') {
      var n = kit.leads.length, q = kit.leads.filter(function (l) { return l.qualified; }).length;
      return n ? Math.round(q / n * 100) + '% (' + q + ' of ' + n + ')' : 'No leads yet';
    }
    if (k === 'meetings') return kit.leads.filter(function (l) { return l.meeting; }).length + ' so far';
    if (k === 'nextstep') {
      var open = kit.deals.filter(function (d) { return d.stage !== 'Won' && d.stage !== 'Lost'; });
      if (!open.length) return 'No open deals';
      var w = open.filter(function (d) { return d.nextDate; }).length;
      return Math.round(w / open.length * 100) + '% (' + w + ' of ' + open.length + ')';
    }
    return null;
  }

  function close() {
    seq++;
    if (!box) return;
    box.remove(); box = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onDown, true);
    if (back && back.focus) back.focus();
    back = null;
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  function onDown(e) { if (box && !box.contains(e.target)) close(); }

  function build(D, plan, kit, state) {
    var f = D.def;
    var svcCount = (f.services || []).reduce(function (s, g) { return s + g[1].length; }, 0);
    var kids = [
      el('div', { class: 'dd-head' }, [el('h2', { id: 'dd-title', text: D.name }), el('button', { type: 'button', class: 'dd-x', 'aria-label': 'Close', text: '×', onclick: close })]),
      el('p', { class: 'dd-sum', text: f.summary }),
      f.note ? el('p', { class: 'dd-note', text: f.note }) : null,
    ];
    if (f.kpis) {
      kids.push(el('h3', { text: 'KPIs' }));
      kids.push(el('ul', { class: 'dd-kpis' }, f.kpis.map(function (k) {
        var v = k[3] ? liveVal(k[3], plan, kit, state) : null;
        return el('li', {}, [
          el('span', { class: 'dd-kn', text: k[0] }),
          el('span', { class: 'dd-kt', text: 'Target: ' + k[1] }),
          el('span', { class: 'dd-kf', text: k[2] === 'Once' ? 'Checked once' : 'Checked ' + k[2].toLowerCase() }),
          v !== null ? el('span', { class: 'dd-kl', text: 'Now: ' + v }) : null,
        ]);
      })));
    }
    kids.push(el('h3', { text: 'What it does' }), el('ul', {}, f.does.map(function (t) { return el('li', { text: t }); })));
    if (svcCount) {
      kids.push(el('h3', { text: 'Services it delivers (' + svcCount + ' of 176)' }));
      f.services.forEach(function (g) {
        kids.push(el('details', {}, [el('summary', { text: g[0] + ' (' + g[1].length + ')' }), el('ul', {}, g[1].map(function (t) { return el('li', { text: t }); }))]));
      });
    }
    kids.push(el('dl', { class: 'dd-kv' }, [
      el('dt', { text: 'Team' }), el('dd', { text: D.team + '. ' + f.people }),
      el('dt', { text: 'Year 1 target' }), el('dd', { text: D.rev }),
      el('dt', { text: 'Works closely with' }), el('dd', { text: f.with }),
    ]));
    return kids;
  }

  function show(id, x, y, from) {
    close();
    var mine = ++seq;
    Promise.all([loadPlan(), get('/api/toolkit').catch(function () { return null; }), get('/api/state').catch(function () { return null; })])
      .then(function (res) {
        if (mine !== seq) return;
        var plan = res[0], D = plan.deps.filter(function (d) { return d.id === id; })[0];
        if (!D || !D.def) return;
        box = el('div', { class: 'deptdef', role: 'dialog', 'aria-labelledby': 'dd-title', tabindex: '-1' }, build(D, plan, res[1], res[2]));
        document.body.appendChild(box);
        var vw = window.innerWidth, vh = window.innerHeight, r = box.getBoundingClientRect();
        if (!x && !y && from) { var fr = from.getBoundingClientRect(); x = fr.left; y = fr.bottom + 6; }
        box.style.left = Math.max(8, Math.min(x || 8, vw - r.width - 8)) + 'px';
        box.style.top = Math.max(8, Math.min(y || 8, vh - r.height - 8)) + 'px';
        back = from || null;
        box.focus();
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onDown, true);
      })
      .catch(function () {});
  }

  document.addEventListener('contextmenu', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-dept]');
    if (!t) return;
    e.preventDefault();
    show(t.getAttribute('data-dept'), e.clientX, e.clientY, t);
  });

  window.MSDept = { show: show, idFor: function (name) { return KIT_MAP[name] || null; } };
})();
