'use strict';
// Task ids follow the same scheme the browser uses:
//   <day>-m   daily minimums (Monday to Friday)
//   <day>-<i> the day's tasks, in order
//   <day>-s<i> the day's ₹20 Cr stretch tasks, in order
function tasksForDay(day) {
  const out = [];
  if (day.min) out.push({ id: `${day.d}-m`, owner: 'Everyone', text: 'Daily minimums done', dept: null, stretch: false });
  day.t.forEach((x, i) => out.push({ id: `${day.d}-${i}`, owner: x[0], text: x[1], dept: x[2] || null, stretch: false }));
  (day.s || []).forEach((x, i) => out.push({ id: `${day.d}-s${i}`, owner: x[0], text: x[1], dept: x[2] || null, stretch: true }));
  return out;
}

function indexPlan(plan) {
  const byId = new Map();
  for (const day of plan.days) {
    for (const task of tasksForDay(day)) byId.set(task.id, { ...task, day: day.d });
  }
  return byId;
}

// Day number (1-based) of a calendar date relative to the plan start.
function dayNumber(startIso, date = new Date()) {
  const [y, m, d] = startIso.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today - start) / 86400000) + 1;
}

// Returns the Monday on or before the given ISO date, or null if invalid.
function snapToMonday(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

function progress(plan, index, state, now = new Date()) {
  const today = dayNumber(state.start, now);
  const depts = new Map(plan.deps.map((d) => [d.id, { id: d.id, name: d.name, total: 0, done: 0, overdue: 0 }]));
  let total = 0;
  let done = 0;
  for (const task of index.values()) {
    total += 1;
    const isDone = Boolean(state.done[task.id]);
    if (isDone) done += 1;
    const dept = task.dept && depts.get(task.dept);
    if (dept) {
      dept.total += 1;
      if (isDone) dept.done += 1;
      else if (task.day < today) dept.overdue += 1;
    }
  }
  return { start: state.start, today, total, done, departments: [...depts.values()] };
}

module.exports = { tasksForDay, indexPlan, dayNumber, snapToMonday, progress };
