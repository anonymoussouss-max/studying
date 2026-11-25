// Handoff §11 (automatic re-planning with Undo) and §13 (forecast from the selected capacity). Synthetic fixtures only.
// Run: node --test tests/replan-forecast.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
function plan(isoNow) {
  const NOW = new Date(isoNow).getTime();
  class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
  ctx.globalThis = ctx; ctx.__noCExam = true; vm.runInNewContext(src, ctx); return ctx.StudyPlan;
}
const MON = '2026-12-07', SP = plan(MON + 'T12:00:00');
const CTX = { actual14: {}, loggedAny: true, diplomaToday: 0, noCExam: true };
const lab = (sched = {}) => ({ syl: SP.seedSyllabus(), sched: Object.assign({ wake: { [MON]: 720 } }, sched) });
const day = (L, now, used, d = MON) => SP.templateDay(L, d, new Date(d + 'T12:00:00').getDay(), now, Object.assign({}, CTX, { used }));
const study = rows => rows.filter(r => r.kind === 'study');
const elapsed = (rows, now) => study(rows).reduce((n, r) => n + Math.max(0, Math.min(r.e, now) - r.s), 0);
const ahead = (rows, now) => study(rows).reduce((n, r) => n + Math.max(0, r.e - Math.max(r.s, now)), 0);
const total = rows => study(rows).reduce((n, r) => n + r.e - r.s, 0);
const fixed = rows => rows.filter(r => r.kind !== 'study' && !/^free/.test(r.id)).map(r => r.id + '@' + r.s + '-' + r.e).join(' ');
const NOW = 1200; // 8:00 PM, synthetic

test('work that ran long is re-laid inside the same allowance; the past and protected times stay', () => {
  const L = lab(), base = day(L, NOW, 0), allow = total(base.rows), done = elapsed(base.rows, NOW);
  assert.strictEqual(base.replan, null, 'no overrun, no re-plan');
  const r = day(L, NOW, done + 30);
  assert.ok(r.replan && r.replan.over === 30 && r.replan.freed >= 30, 'ran 30 min long: at least 30 min of later study becomes free');
  assert.ok(done + 30 + ahead(r.rows, NOW) <= allow, 'logged + still planned stays inside the allowance');
  assert.strictEqual(fixed(r.rows), fixed(base.rows), 'meals, the 8:30 commitment, wind-down and sleep keep their times');
  const past = rs => JSON.stringify(rs.filter(x => x.e <= NOW).map(x => [x.s, x.e, x.kind, x.title]));
  assert.strictEqual(past(r.rows), past(base.rows), 'completed work and earlier blocks are untouched');
  const cur = rs => JSON.stringify(rs.filter(x => x.kind === 'study' && x.s < NOW && x.e > NOW).map(x => [x.s, x.e]));
  assert.strictEqual(cur(r.rows), cur(base.rows), 'the block in progress (the stopping point) is never cut');
  for (const x of study(r.rows)) assert.ok(x.e <= 1520, 'no study after 1:20 AM');
  for (const t of r.replan.trimmed) assert.ok(t.s >= NOW, 'only future time is freed');
  assert.ok(Array.isArray(r.replan.moved), 'what no longer fits is named for the next study day');
});

test('a model never adds hours: under-running or skipping leaves later blocks exactly as planned', () => {
  const L = lab(), base = day(L, NOW, 0), r = day(L, NOW, Math.max(0, elapsed(base.rows, NOW) - 45));
  assert.strictEqual(r.replan, null);
  assert.strictEqual(JSON.stringify(r.rows), JSON.stringify(base.rows));
  assert.strictEqual(total(day(L, NOW, 9999).rows) <= total(base.rows), true, 'even a huge overrun only ever removes study');
});

test('Undo restores the plan without removing study completed since the change', () => {
  const L0 = lab(), base = day(L0, NOW, 0), done = elapsed(base.rows, NOW);
  const L = lab({ replanUndo: { [MON]: [{ at: NOW, grant: 30 }] } });
  const u = day(L, NOW, done + 30);
  assert.strictEqual(u.replan, null, 'after Undo the earlier blocks are back');
  assert.strictEqual(JSON.stringify(u.rows), JSON.stringify(base.rows));
  // 40 minutes later, after studying through the block: the logged minutes count in full and nothing is re-cut
  const later = NOW + 40, b2 = day(L0, later, 0), more = elapsed(b2.rows, later) - elapsed(base.rows, NOW);
  const u2 = day(L, later, done + 30 + more);
  assert.strictEqual(u2.replan, null, 'study since the Undo is kept and does not trigger another cut');
  assert.deepStrictEqual(u2.replanUndo.map(x => x.grant), [30], 'Undo is an added record; nothing is erased');
  const again = day(L, later, done + 30 + more + 20);
  assert.strictEqual(again.replan && again.replan.over, 20, 'running long again later re-plans only the new overrun');
});

test('Gentle Return caps and Done are never overridden by a re-plan', () => {
  const L = lab({ gentle: { on: true, max: 120, from: MON, day: {} } }), r = day(L, NOW, 500);
  assert.strictEqual(r.replan, null, 'Gentle Return days keep their own cap');
  const stopped = lab({ gentle: { on: true, max: 120, from: MON, day: { [MON]: { stopped: true } } } }), s = day(stopped, NOW, 500);
  assert.strictEqual(s.replan, null);
  assert.strictEqual(ahead(s.rows, NOW), 0, 'Done for today stays done: nothing is planned after it');
});

test('an eight-hour day after the weekly review is re-planned inside eight hours', () => {
  const L = lab({ allow8: { from: MON } }), base = day(L, NOW, 0), allow = total(base.rows), done = elapsed(base.rows, NOW);
  assert.ok(allow <= 480 && allow > 360, 'eight-hour allowance');
  const r = day(L, NOW, done + 25);
  assert.ok(r.replan && done + 25 + ahead(r.rows, NOW) <= allow);
});

test('capacity is the selected allowance minus German, astrophysics and diploma: never a fixed six hours', () => {
  const six = SP.pcmCapacity(lab(), MON), eight = SP.pcmCapacity(lab({ allow8: { from: MON } }), MON);
  assert.strictEqual(six.weekly, 6 * (360 - 30) + 60 - 120, '6 days × (6 h − German) + Sunday 60 − diploma 2 h');
  assert.strictEqual(eight.weekly, 6 * (480 - 30) + 60 - 120, 'eight hours after the review');
  const gentle = SP.pcmCapacity(lab({ gentle: { on: true, max: 90, from: MON, day: {} } }), MON);
  assert.ok(gentle.weekly < six.weekly && gentle.days.every(d => d.pcm <= 90), 'Gentle Return cap lowers capacity');
  const astro = SP.pcmCapacity(lab({ astro: { min: 30 } }), MON);
  assert.strictEqual(astro.weekly, six.weekly - 6 * 30, 'astrophysics comes out of the same allowance');
  const heavy = SP.pcmCapacity(lab({ diploma: { week: 120, heavy: { [MON]: 300 } } }), MON);
  assert.strictEqual(heavy.weekly, six.weekly - 180, 'a heavy diploma week is subtracted');
  const f6 = SP.forecast(lab(), {}, MON), f8 = SP.forecast(lab({ allow8: { from: MON } }), {}, MON);
  assert.strictEqual(f6.plannedWeekly, six.weekly);
  assert.ok(f8.pace.weeksLow < f6.pace.weeksLow, 'more capacity, shorter hypothetical pace');
});

test('a hypothetical pace and a forecast from real PCM study are shown separately, with explicit uncertainty', () => {
  const none = SP.forecast(lab(), { weeks: [600] }, MON);
  assert.strictEqual(none.actual, null, 'fewer than two weeks: no forecast from real study is claimed');
  assert.ok(none.pace.weeksLow > 0);
  const real = SP.forecast(lab(), { weeks: [600, 800] }, MON);
  assert.strictEqual(real.actual.weekly, 700);
  assert.ok(real.actual.weeksLow > real.pace.weeksLow, 'real 700 min/week is slower than the selected capacity');
  for (const k of ['lecture', 'revision', 'homework', 'reattempt']) assert.ok(real.parts[k][0] > 0 && real.parts[k][0] <= real.parts[k][1], k + ' has a range');
  assert.ok(/range/.test(real.uncertainty) && /±15%/.test(real.uncertainty));
});

test('missing Class 11 Organic/Inorganic and provisional Class 12 counts stay visible; no completion date from them', () => {
  const f = SP.forecast(lab(), {}, MON);
  assert.strictEqual(f.complete, false);
  assert.ok(f.absent.some(m => /Organic/.test(m)) && f.absent.some(m => /Inorganic/.test(m)));
  assert.ok(f.provisionalCounts.length >= 5 && f.provisionalCounts.every(n => /Class 12/.test(n)));
  const L = lab(); for (const c of Object.values(L.syl.courses)) { c.provisional = false; c.chapters = c.chapters.map(x => [x[0], x[1] == null ? 20 : x[1]]); }
  const full = SP.forecast(L, {}, MON);
  assert.strictEqual(full.complete, true, 'only complete, confirmed counts allow a completion comparison');
  assert.ok(full.minutesLow > f.minutesLow, 'added counts add work, never hide it');
});
