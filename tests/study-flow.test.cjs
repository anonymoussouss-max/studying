// Tests for the connected study flow (22 Nov 2026, second review): lecture time counted once from the timer,
// the week preview and week size, German units, homework next steps. All fixtures are synthetic.
// Run: node --test tests/study-flow.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
// line endings are normalised so the source checks pass on Windows checkouts (CRLF) too
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const NOW = new Date('2026-11-23T12:00:00').getTime();
class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
ctx.globalThis = ctx; ctx.__noCExam = true; /* the dated C exam timetable (23–26 Nov) is tested in cexam.test.cjs */ vm.runInNewContext(src, ctx); const SP = ctx.StudyPlan;
const MON = '2026-11-23', C0 = { actual14: {}, loggedAny: false, diplomaToday: 20 };
const lab = (sched = {}, more = {}) => Object.assign({ syl: SP.seedSyllabus(), sched }, more);
const week = (l, now = 720) => SP.weekPreview(l, MON, now, C0);

test('lecture time: a timestamp save then "finished" counts each timer minute once', () => {
  const m = html.match(/  const SUBKEY = [^\n]*\n  function timerTake\(subj, a\) \{[\s\S]*?\n  \}\n/); assert.ok(m, 'timerTake present');
  assert.ok(!/blockElapsed/.test(html), 'planner time is no longer used for lecture duration');
  const sy = {}, f = new Function('syl', 'window', 'Date', m[0] + 'return timerTake;')(() => sy, {}, { now: () => 0 });
  const sess = min => ({ id: 's1', subject: 'Maths', task: 'Watch lecture', accruedMs: min * 60000, running: false, targetMs: 600 * 60000 });
  assert.strictEqual(f('maths', sess(60)), 60, 'save at 60 min credits 60');
  assert.strictEqual(f('maths', sess(70)), 10, 'finish at 70 min credits only the new 10, total 70 not 130');
  assert.strictEqual(f('maths', sess(70)), 0, 'pressing again adds nothing');
  assert.strictEqual(f('physics', sess(90)), 0, 'another subject\'s lecture gets nothing from a Maths session');
  assert.strictEqual(f('maths', Object.assign(sess(30), { id: 's2', task: 'Revise lecture 21' })), 0, 'revision sessions are not lecture time');
  assert.strictEqual(f('maths', null), 0, 'no timer, no minutes');
});

test('week preview: 7 days, a shared queue that moves forward, German and diploma reserved, bedtime respected', () => {
  const w = week(lab());
  assert.strictEqual(w.length, 7);
  const titles = w.flatMap(d => d.items.map(i => i.title));
  const l21 = titles.findIndex(t => /lecture 21 of/.test(t)), l22 = titles.findIndex(t => /lecture 22 of/.test(t)), r21 = titles.findIndex(t => /^Revise .*lecture 21/.test(t));
  assert.ok(l21 >= 0 && r21 > l21 && l22 > r21, 'lecture 21, its revision, then lecture 22');
  for (const d of w.filter(x => x.dow !== 0)) {
    assert.ok(d.total <= 360, d.d + ' never above six hours');
    assert.ok(d.items.some(i => i.subj === 'german'), d.d + ' keeps German');
  }
  assert.ok(w.slice(1, 6).every(d => d.items.some(i => i.subj === 'diploma')), 'diploma time is held back on weekdays');
  for (const s of ['maths', 'physics', 'chem']) assert.ok(w.some(d => d.items.some(i => i.subj === s && i.type === 'lecture')), s + ' lectures appear: the heavy subject rotates through the week');
});

test('week size: a lighter or minimal week shrinks every day of it at once and never adds time', () => {
  const full = week(lab()), lighter = week(lab({ weekSize: { [MON]: 'lighter' } })), minimal = week(lab({ weekSize: { [MON]: 'minimal' } }));
  for (let k = 0; k < 6; k++) {
    assert.ok(lighter[k].total <= 270 && lighter[k].total <= full[k].total, 'lighter day ' + k);
    assert.ok(minimal[k].total <= 150 && minimal[k].total <= lighter[k].total, 'minimal day ' + k);
  }
  const next = SP.weekPreview(lab({ weekSize: { [MON]: 'lighter' } }), '2026-11-30', null, C0);
  assert.ok(next[0].total > 270, 'only the chosen week is smaller');
});

test('German: a resumable unit sequence with a speaking task and retrieval of earlier units', () => {
  assert.ok(SP.GERMAN_SEQ.length >= 20);
  assert.match(SP.germanTitle(0), /^German · Unit 1: .* · speak: /);
  assert.match(SP.germanTitle(4), /Unit 5: .*recall Unit 4 and Unit 3 from memory/);
  const t = SP.templateDay(lab({ germanUnit: 6 }), MON, 1, 720, C0);
  assert.ok(t.rows.some(r => r.subj === 'german' && /Unit 7:/.test(r.title)), 'the plan shows the saved unit');
  const t2 = SP.templateDay(lab({ germanUnit: 6 }), '2026-11-24', 2, 720, C0);
  assert.ok(t2.rows.some(r => r.subj === 'german' && /Unit 7:/.test(r.title)), 'it does not advance by itself');
});

test('homework carries its next step into the plan, and essential stays distinct from additional', () => {
  const l = lab(); l.syl.hw = [{ id: 'h1', subj: 'maths', title: 'Ex 1.2', essential: true, mins: 40, next: 'Q9', done: 'Q1–8', status: 'open', made: MON },
    { id: 'h2', subj: 'maths', title: 'Extra set', essential: false, mins: 40, next: '', status: 'open', made: MON }];
  const tasks = SP.buildTasks(l, MON);
  assert.ok(tasks.some(t => t.type === 'homework' && /Ex 1\.2 · next: Q9/.test(t.title)));
  assert.ok(!tasks.some(t => /Extra set/.test(t.title)), 'additional homework is not scheduled');
});

// the lecture-time helpers, run against a synthetic syllabus and saved sessions
function lectureCode() { return (html.match(/  const SUBKEY = [\s\S]*?window\.__kgSyncLectureTime = syncLectureTime;\n/) || [])[0]; }
function lectureKit(sessions, now) {
  const sy = { pos: {}, timerSince: now - 3600e3 }, store = { 'ame-habit-v1': JSON.stringify({ sessions }) };
  const saveTimestamp = (subj, at, add) => { const p = sy.pos[subj] = sy.pos[subj] || { lec: 21 }; p.spent = (p.spent || 0) + add; return true; };
  const SPf = () => ({ nextLecture: () => ({ lec: 21 }) });
  return { sy, run: new Function('syl', 'window', 'Date', 'localStorage', 'SUB', 'SP', 'saveTimestamp', lectureCode() + 'return { timerTake, syncLectureTime };')(
    () => sy, {}, { now: () => now }, { getItem: k => store[k] || null }, ['maths', 'physics', 'chem'], SPf, saveTimestamp) };
}
test('lecture time: a session saved and closed before any lecture button still counts, once', () => {
  const now = Date.now(), ses = [{ id: 'a', subject: 'Maths', task: 'Watch Basic Mathematics · lecture 21 of 23', minutes: 55, endedAt: now - 600e3 },
    { id: 'b', subject: 'Maths', task: 'Revise Basic Mathematics · lecture 20', minutes: 40, endedAt: now - 300e3 },
    { id: 'c', subject: 'Maths', task: 'Watch Basic Mathematics · lecture 19 of 23', minutes: 30, endedAt: now - 200e3 },
    { id: 'd', subject: 'Maths', task: 'Old lecture', minutes: 90, endedAt: now - 7200e3 }];
  const k = lectureKit(ses, now);
  assert.strictEqual(k.run.syncLectureTime(), true);
  assert.strictEqual(k.sy.pos.maths.spent, 55, 'only the lecture 21 session counts: not revision, another lecture, or sessions from before the update');
  assert.strictEqual(k.run.syncLectureTime(), false, 'a second pass adds nothing');
  assert.strictEqual(k.sy.pos.maths.spent, 55);
  k.sy.lastFin = { maths: now }; ses.push({ id: 'e', subject: 'Maths', task: 'Watch', minutes: 20, endedAt: now - 100e3 });
  assert.strictEqual(k.run.syncLectureTime(), false, 'sessions before the lecture was finished do not move to the next lecture');
});

test('minimal and lighter weeks keep German: it is reserved before PCM time', () => {
  for (const size of ['lighter', 'minimal']) for (const W of [600, 720]) for (const g of [15, 30, 45]) {
    const t = SP.templateDay(lab({ german: g, weekSize: { [MON]: size }, wake: { [MON]: W } }), MON, 1, W, Object.assign({}, C0, { diplomaToday: 0 }));
    const st = t.rows.filter(r => r.kind === 'study'), tot = st.reduce((n, r) => n + r.e - r.s, 0), ger = st.filter(r => r.subj === 'german').reduce((n, r) => n + r.e - r.s, 0);
    assert.strictEqual(ger, g, size + ' week, wake ' + W + ': German ' + g);
    assert.ok(tot <= (size === 'lighter' ? 270 : 150), 'and the day stays within its size');
  }
});

test('week preview follows the exam-period rule: no new PCM lectures during diploma exam preparation', () => {
  const w = week(lab({ exams: [{ id: 'e', name: 'W', from: '2026-11-23', end: '2026-11-26', days: [] }], germanExam: 'light' }));
  for (const d of w.filter(x => x.d <= '2026-11-26')) assert.ok(!d.items.some(i => /^Watch /.test(i.title)), d.d + ' has no new lecture');
  assert.ok(w.some(d => d.d > '2026-11-26' && d.items.some(i => /^Watch /.test(i.title))), 'lectures resume after the exam period');
});
