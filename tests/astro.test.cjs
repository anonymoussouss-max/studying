// Tests for the Astrophysics course (22 Nov 2026): course time inside the daily workload, the next action,
// deadline conflicts and honest lecture states. All fixtures are synthetic.
// Run: node --test tests/astro.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
function load(lab = {}) {
  const NOW = new Date('2026-11-23T12:00:00').getTime();
  class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const store = { 'kg-lab-v1': JSON.stringify(lab) };
  const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  ctx.globalThis = ctx; vm.runInNewContext(src, ctx); return ctx.StudyPlan;
}
const SP = load(), MON = '2026-11-23', C0 = { actual14: {}, loggedAny: false, diplomaToday: 0 };
const COURSE = () => ({ lectures: [{ id: 'a', day: 1, title: 'Light', watch: 'watched' }, { id: 'b', day: 2, title: 'Spectra', watch: 'none' }], tasks: [] });
const lab = (astro, sched = {}) => ({ syl: SP.seedSyllabus(), astro: COURSE(), sched: Object.assign({ astro, wake: { [MON]: 720 } }, sched) });
const study = t => t.rows.filter(r => r.kind === 'study'), sum = (rs, f = () => true) => rs.filter(f).reduce((n, r) => n + r.e - r.s, 0);

test('course time replaces PCM time: the day total and German never change', () => {
  const base = SP.templateDay(lab({ min: 0 }), MON, 1, 720, C0);
  for (const m of [15, 30, 45, 60, 90]) {
    const t = SP.templateDay(lab({ min: m }), MON, 1, 720, C0), st = study(t);
    assert.strictEqual(sum(st), sum(study(base)), m + ' min: same total');
    assert.strictEqual(sum(st, r => r.subj === 'astro'), m, m + ' min of course time');
    assert.strictEqual(sum(st, r => r.subj === 'german'), 30, 'German untouched');
    assert.ok(st.filter(r => r.subj === 'astro').every(r => /^Astrophysics course · /.test(r.title)));
  }
  assert.strictEqual(study(SP.templateDay(lab({ min: 60 }), MON, 1, 720, C0)).filter(r => r.subj === 'astro').length, 1, 'one block when one is long enough');
});

test('Sunday, the 15-minute day and a day off get no course time', () => {
  assert.strictEqual(sum(study(SP.templateDay(lab({ min: 60 }), '2026-11-29', 0, 720, C0)), r => r.subj === 'astro'), 0, 'Sunday');
  const g = lab({ min: 60 }, { plan: { [MON]: 'gentle' } });
  assert.strictEqual(sum(study(SP.templateDay(g, MON, 1, 720, C0)), r => r.subj === 'astro'), 0, 'gentle');
});

test('a deadline adjustment applies only until its date', () => {
  const S = { astro: { min: 15, boost: { min: 60, until: '2026-11-25' } } };
  assert.strictEqual(SP.astroMinutes(S, '2026-11-24'), 60);
  assert.strictEqual(SP.astroMinutes(S, '2026-11-26'), 15);
  assert.strictEqual(SP.astroMinutes({ astro: { min: 500 } }, MON), 120, 'never above 120 minutes');
});

test('deadline conflicts: only confirmed dates, Sundays and days off excluded, a proposal that never exceeds 120 min', () => {
  const L = lab({ min: 30 }); L.astro.tasks = [{ id: 't1', title: 'Quiz 1', due: '2026-11-26', dueOk: true, mins: 240, done: false }, { id: 't2', title: 'Maybe', due: '2026-11-24', dueOk: false, mins: 500, done: false }];
  const c = SP.astroConflicts(L, MON);
  assert.strictEqual(c.length, 1, 'the unconfirmed date is not treated as a deadline');
  assert.deepStrictEqual([c[0].id, c[0].need, c[0].avail, c[0].days, c[0].per], ['t1', 240, 90, 3, 90]);
  L.dayTypes = { '2026-11-24': { t: 'rest' } }; assert.strictEqual(SP.astroConflicts(L, MON)[0].days, 2, 'a day off is not counted');
  L.astro.tasks[0].mins = 60; L.dayTypes = {}; assert.strictEqual(SP.astroConflicts(L, MON).length, 0, 'no conflict when it fits');
});

test('one next action, from actual work', () => {
  const C = COURSE(), none = () => ({});
  assert.match(SP.astroNext(C, MON, none).text, /recap of Day 1/, 'after watching: a short closed-note recap');
  assert.match(SP.astroNext(C, MON, () => ({ practised: true })).text, /^Watch Day 2/);
  C.lectures[1].watch = 'progress'; C.lectures[1].resume = '41:10';
  assert.strictEqual(SP.astroNext(C, MON, none).text, 'Resume Day 2 · Spectra from 41:10');
  C.tasks.push({ id: 't', title: 'Worksheet', due: '2026-11-25', dueOk: true, done: false });
  assert.match(SP.astroNext(C, MON, none).text, /^Work on Worksheet \(due 2026-11-25\)/, 'a confirmed deadline within 3 days comes first');
});

test('watching is never mastery: Practised and Checked come only from practice evidence', () => {
  const l = { watch: 'watched' };
  assert.strictEqual(SP.astroState(l, {}), 'Watched');
  assert.strictEqual(SP.astroState(l, { practised: true }), 'Practised');
  assert.strictEqual(SP.astroState({ watch: 'none' }, { practised: true, checked: true }), 'Checked');
  assert.deepStrictEqual([...SP.ASTRO_STATES], ['Not started', 'In progress', 'Watched', 'Practised', 'Checked']);
});

test('course rows become Astrophysics timer sessions, and course entries get no PCM revision schedule', () => {
  const P = load(Object.assign(lab({ min: 30 }), {}));
  const rows = P.fallback(1).filter(r => r.subj === 'astro');
  assert.ok(rows.length && rows.every(r => /^astro-/.test(r.id)), 'row ids start with astro');
  assert.match(html, /id\.startsWith\('astro'\) \? 'Astrophysics'/);
  assert.match(html, /\/\^astro\/\.test\(b\.id\)\?'Astrophysics'/);
  assert.match(html, /e\.noSkill\|\|linked\.has\(e\.id\)/, 'the requirements document gets no skill');
});
