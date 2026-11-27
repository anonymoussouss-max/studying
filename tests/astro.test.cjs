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
  ctx.globalThis = ctx; ctx.__noCExam = true; /* the dated C exam timetable (23–26 Nov) is tested in cexam.test.cjs */ vm.runInNewContext(src, ctx); return ctx.StudyPlan;
}
const SP = load(), MON = '2026-11-23', C0 = { actual14: {}, loggedAny: false, diplomaToday: 0 };
const COURSE = () => ({ lectures: [{ id: 'a', day: 1, title: 'Light', watch: 'watched' }, { id: 'b', day: 2, title: 'Spectra', watch: 'none' }], tasks: [] });
const lab = (astro, sched = {}) => ({ syl: SP.seedSyllabus(), astro: COURSE(), sched: Object.assign({ reading: false, astro, wake: { [MON]: 720 } }, sched) });
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
  assert.match(html, /e\.noSkill\|\|e\.astro\|\|linked\.has\(e\.id\)/, 'course notes and the requirements document get no PCM skill');
});

test('kept apart from PCM: course practice adds no PCM skill credit, misses or stats, and old course skills move to the course', () => {
  const lec = [{ id: 'p1', subj: 'Physics', topic: 'Kinematics' }, { id: 'a1', subj: 'Astrophysics', topic: 'Astrophysics · Day 1', astro: true }];
  assert.deepStrictEqual(SP.skillsFromLectures(lec, []).map(s => s.lectures[0]), ['p1'], 'only the PCM lecture becomes a skill');
  assert.match(html, /const skillId = astro \? null : window\.StudyPlan\.creditTarget/, 'no skill credit for course practice');
  assert.match(html, /if \(!astro && v\.miss && gap && !x\) L\.attempts\.push/, 'no PCM misses from course practice');
  assert.match(html, /if \(astro && gap\) window\.__kgAstroGap\?\.\(f\)/, 'a course gap becomes a lecture doubt');
  assert.match(html, /L\.lectures\.filter\(e => !e\.astro\)\.sort/, 'course notes stay out of the PCM notes list');
  assert.match(html, /recent = pcmLog\.slice\(-8\)/, 'PCM session history leaves out course practice');
  assert.match(html, /c\.skills = \(Array\.isArray\(c\.skills\) \? c\.skills : \[\]\)\.concat\(out\)/, 'old course skills are moved, not deleted');
});

test("hours targets: the day's study matches 4-7 h, 8 h stops at what fits before bedtime, Sunday ignores it", () => {
  const D = '2026-11-24', day = (h, extra = {}) => sum(study(SP.templateDay(Object.assign({ syl: SP.seedSyllabus(), sched: Object.assign({ reading: false, wake: { [D]: 720 }, hours: { [D]: h } }, extra) }), D, 2, -1, C0)));
  assert.deepStrictEqual([4, 5, 6, 7].map(h => day(h)), [240, 300, 360, 420]);
  assert.strictEqual(day(8), 470, '7 h 50 is the most a normal day holds');
  assert.strictEqual(day(9), 360, 'an unknown target is ignored');
  const t8 = SP.templateDay({ syl: SP.seedSyllabus(), sched: { reading: false, wake: { [D]: 720 }, hours: { [D]: 8 } } }, D, 2, -1, C0);
  assert.ok(study(t8).every(r => r.e <= 1530), 'no study after 1:30 AM');
  assert.strictEqual(sum(study(SP.templateDay({ syl: SP.seedSyllabus(), sched: { reading: false, wake: { '2026-11-29': 720 }, hours: { '2026-11-29': 8 } } }, '2026-11-29', 0, -1, C0)), r => r.subj !== 'german' && !r.optional), sum(study(SP.templateDay({ syl: SP.seedSyllabus(), sched: { reading: false, wake: { '2026-11-29': 720 } } }, '2026-11-29', 0, -1, C0)), r => r.subj !== 'german' && !r.optional), 'Sunday stays light');
  assert.strictEqual(sum(study(SP.templateDay(lab({ min: 30 }, { hours: { [MON]: 4 } }), MON, 1, -1, C0)), r => r.subj === 'astro'), 30, 'course time still fits inside a 4 h day');
});

test('retired (27 Nov 2026): replaced by the Coursera courses — no course time, no deadline proposals, no Study tab; records are kept', () => {
  const L = lab({ min: 30 }); L.astro.retired = { at: '2026-11-27' }; L.astro.tasks = [{ id: 't1', title: 'Quiz 1', due: '2026-11-26', dueOk: true, mins: 240, done: false }];
  assert.strictEqual(SP.astroConflicts(L, MON).length, 0);
  const mod = html.slice(html.indexOf("const FOLDER = 'https://drive.google.com"), html.indexOf("M.PANELS.astro = "));
  assert.match(mod, /if \(!C\(\)\.retired\) \{[^\n]*a\.min = 0; delete a\.boost;/, 'the one-time retirement returns course time to PCM');
  assert.match(html, /if \(!C\(\)\.retired\) M\.SECTIONS\.study\.push\(\['astro'/);
  assert.ok(!/delete L\.astro|L\.astro = null|lectures = \[\]/.test(mod), 'nothing is deleted');
  assert.ok(!html.includes("['🔭 Astrophysics course', 'study:astro']"), 'no shelf link to the course');
});
