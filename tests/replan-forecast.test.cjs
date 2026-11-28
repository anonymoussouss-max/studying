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
const lab = (sched = {}) => ({ syl: SP.seedSyllabus(), sched: Object.assign({ reading: false, wake: { [MON]: 720 } }, sched) });
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
  assert.ok(eight.weekly > six.weekly && eight.weekly <= 6 * (480 - 30) + 60 - 120 && eight.days.every(d => d.fromPlan), 'eight hours after the review: what the planner lays out (its breaks included), never more than the allowance');
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

test('Class 11 counts are complete once you confirmed them; provisional Class 12 counts stay visible; no completion date from them', () => {
  const f = SP.forecast(lab(), {}, MON);
  assert.strictEqual(f.complete, false);
  assert.deepStrictEqual([...f.absent], [], 'Organic (43) and Inorganic (44) counts were confirmed on 26 Nov 2026');
  assert.ok(f.provisionalCounts.length >= 5 && f.provisionalCounts.every(n => /Class 12/.test(n)));
  const L = lab(); for (const c of Object.values(L.syl.courses)) { c.provisional = false; c.chapters = c.chapters.map(x => [x[0], x[1] == null ? 20 : x[1]]); }
  const full = SP.forecast(L, {}, MON);
  assert.strictEqual(full.complete, true, 'only complete, confirmed counts allow a completion comparison');
  assert.ok(full.minutesLow >= f.minutesLow, 'confirming counts never hides work');
});

test('confirmed counts: Physics gains Units and Dimensions (10) and Vectors (14) after Errors; Organic 43, Inorganic 44; saved progress keeps its place', () => {
  const seed = SP.seedSyllabus(), sum = id => seed.courses[id].chapters.reduce((a, x) => a + x[1], 0);
  assert.strictEqual(sum('oc11'), 43); assert.strictEqual(sum('ic11'), 44);
  const names = seed.courses.p11.chapters.map(x => x[0]);
  assert.deepStrictEqual([...names.slice(1, 5)], ['Errors', 'Units and Dimensions', 'Vectors', 'Motion in a Plane']);
  assert.strictEqual(SP.applyConfirmed11(seed), false, 'a new syllabus is already up to date');
  // an older saved syllabus: placeholders, progress on Motion in a Plane, current position there
  const old = { courses: {
    p11: { chapters: [['Motion in a Straight Line', 15], ['Errors', 3], ['Motion in a Plane', 13], ['Laws of Motion', 15]], done: [15, 3, 4] },
    oc11: { chapters: [['Class 11 organic (lecture count missing)', null]], done: [] },
    ic11: { chapters: [['My own inorganic list', 40]], done: [2] } }, pos: { physics: { course: 'p11', ci: 2, chapter: 'Motion in a Plane', lec: 5 } } };
  assert.strictEqual(SP.applyConfirmed11(old), true);
  assert.deepStrictEqual([...old.courses.p11.chapters.map(x => x[0])], ['Motion in a Straight Line', 'Errors', 'Units and Dimensions', 'Vectors', 'Motion in a Plane', 'Laws of Motion']);
  assert.deepStrictEqual([...old.courses.p11.done], [15, 3, 0, 0, 4]);
  assert.strictEqual(old.pos.physics.ci, 4); assert.strictEqual(old.courses.p11.chapters[old.pos.physics.ci][0], 'Motion in a Plane');
  assert.strictEqual(old.courses.oc11.chapters.length, 6); assert.ok(old.courses.oc11.confirmed);
  assert.deepStrictEqual([...old.courses.ic11.chapters.map(x => x[0])], ['My own inorganic list'], 'a list you edited yourself is never replaced');
  assert.strictEqual(SP.applyConfirmed11(old), false, 'runs once');
});

test('the assumptions shown are rendered from the minutes the forecast calculates with, and agree with it', () => {
  const f = SP.forecast(lab(), {}, MON), d = f.durations, S = ['maths', 'physics', 'chem'];
  // class re-attempt defaults the calculation uses
  assert.deepStrictEqual(S.map(s => d[s].reattempt[0]), [75, 45, 30]);
  assert.ok(S.every(s => d[s].from.reattempt === 'default'), 'no logs yet: marked as defaults');
  // the parts total is exactly these minutes times the remaining lectures (+10% low, +25% high)
  for (const [part, key] of [['lecture', 'lecture'], ['revision', 'reattempt'], ['homework', 'homework'], ['reattempt', 'retries']])
    for (const i of [0, 1]) assert.strictEqual(f.parts[part][i], Math.round(S.reduce((a, s) => a + f.per[s].rem * d[s][key][i] * (i ? 1.25 : 1.10), 0)), part + ' ' + i);
  // and the text shows those same numbers
  const txt = f.assumptions[0], r = x => x[0] === x[1] ? String(x[0]) : x[0] + '–' + x[1];
  for (const [key, lab] of [['lecture', 'lecture'], ['reattempt', 'class re-attempts'], ['homework', 'homework (Maths: TAH/KCLS + KTK)'], ['retries', 'extra retries of missed questions']])
    assert.ok(txt.includes(lab + ' Maths ' + r(d.maths[key]) + ', Physics ' + r(d.physics[key]) + ', Chemistry ' + r(d.chem[key])), key);
  assert.ok(!/revision Maths 90|not counted until their lecture counts/.test(f.assumptions.join(' ')), 'the old hand-written figures are gone');
  // logged medians replace a default and are marked as yours
  const L = lab(); L.syl.took = { re: { physics: [50, 50, 50] } };
  const g = SP.forecast(L, {}, MON); assert.deepStrictEqual([...g.durations.physics.reattempt], [50, 50]); assert.match(g.assumptions[0], /Physics 50 \(your logs\)/);
});

test('unconfirmed inputs stay unknown; Class 12 proxies keep the completion date pending; the Basic Mathematics source is complete from the Khazana audit', () => {
  const f = SP.forecast(lab(), {}, MON), all = f.assumptions.join(' | ');
  assert.match(all, /playback speed: not set/); assert.match(all, /DPP and module practice: not confirmed, not counted/);
  assert.match(all, /Class 12 counts are Lakshya JEE planner proxies \(chapter by chapter\) until the Lakshya JEE 2028 chapter plan exists, so the completion date stays pending/);
  assert.strictEqual(f.complete, false);
  const t = SP.TRACKS.find(x => x.chapter === 'Basic Mathematics');
  assert.strictEqual(t.lectures, 23); assert.strictEqual(t.track, 'Ashish Aggrawal · Complete Maths (2025) · Khazana');
  assert.deepStrictEqual([...t.durations.map(x => [x.from, x.to, x.secs])], [[1, 20, 48 * 3600 + 47 * 60 + 1], [1, 23, 56 * 3600 + 18 * 60 + 33]]);
  assert.deepStrictEqual([...t.unverified], []); assert.strictEqual(t.partial, false);
  assert.match(all, /lectures 1–23 total 56:18:33 at 1×; complete \(recorded, not used in the calculation\)/);
  assert.strictEqual(SP.seedSyllabus().courses.m11.chapters.find(x => x[0] === 'Basic Mathematics')[1], 23, 'the chapter count agrees with the source');
  // the panel prints calendar dates only when every count is confirmed
  assert.match(html, /const span = r => f\.complete \? [^\n]*: `\$\{r\.weeksLow\}–\$\{r\.weeksHigh\} weeks for the counted lectures \(date pending until every count is confirmed\)`/);
});
