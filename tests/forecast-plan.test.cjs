// The forecast counts the PCM the planner actually schedules; an explicit zero exam travel stays zero. Synthetic fixtures only.
// Run: node --test tests/forecast-plan.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const MON = '2026-12-07', NOW = new Date(MON + 'T12:00:00').getTime();
class FD extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
const ctx = { Date: FD, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; ctx.__noCExam = true;
vm.runInNewContext(src, ctx); const SP = ctx.StudyPlan;
const lab = (sched = {}, extra = {}) => Object.assign({ syl: SP.seedSyllabus(), sched: Object.assign({ reading: true, wake: {} }, sched) }, extra);
const days = L => SP.forecast(L, { weeks: [] }, MON).capacity.days;
const pcmOf = (L, d) => SP.templateDay(L, d, new Date(d + 'T12:00:00').getDay(), 0, { used: 0, loggedAny: true }).rows
  .filter(r => r.kind === 'study' && /^(maths|physics|chem)$/.test(r.subj)).reduce((n, r) => n + r.e - r.s, 0);

test('a regular day with protected reading: the forecast uses the scheduled PCM, not the allowance', () => {
  const L = lab(), d = days(L);
  assert.strictEqual(d[0].pcm, pcmOf(L, MON)); assert.ok(d[0].fromPlan);
  assert.ok(d[0].pcm < d[0].all - d[0].german, 'reading and fixed times take room the old allowance-only figure ignored');
});

test('Stop for today, a rest day and a whole exam day give zero planned PCM', () => {
  assert.strictEqual(days(lab({ plan: { [MON]: 'stop' } }))[0].pcm, 0, 'Stop for today');
  assert.strictEqual(days(lab({}, { dayTypes: { [MON]: { t: 'rest' } } }))[0].pcm, 0, 'rest day');
  const ex = lab({ exams: [{ id: 'e', name: 'Diploma', from: '2026-12-01', end: '2026-12-10', days: [{ d: MON, at: 780, len: 600, travel: 0 }] }] });
  assert.strictEqual(days(ex)[0].pcm, 0, 'exam day');
});

test('planner and forecast agree on every day of the week', () => {
  for (const L of [lab(), lab({ plan: { [MON]: 'stop' } }), lab({ exams: [{ id: 'e', name: 'D', from: '2026-12-01', end: '2026-12-09', days: [] }] })]) {
    const d = days(L), f = SP.forecast(L, { weeks: [] }, MON);
    d.forEach(x => assert.strictEqual(x.pcm, pcmOf(L, x.d), x.d));
    assert.strictEqual(f.plannedWeekly, Math.max(0, d.reduce((n, x) => n + x.pcm, 0) - f.capacity.diploma));
  }
});

test('zero exam travel stays zero; a blank value still defaults to 45', () => {
  const rowsFor = travel => SP.templateDay(lab({ exams: [{ id: 'e', name: 'Diploma', from: '2026-12-01', end: '2026-12-10', days: [{ d: MON, at: 1200, len: 180, travel }] }] }), MON, 1, 0, { used: 0, loggedAny: true }).rows;
  const exam = rows => rows.find(r => /^exam-/.test(r.id || ''));
  assert.strictEqual(exam(rowsFor(0)).s, 1200, 'travel 0: the block starts at the exam time');
  assert.strictEqual(exam(rowsFor('')).s, 1200 - 45, 'blank: 45 minutes each way');
  assert.strictEqual(exam(rowsFor(30)).s, 1170);
  assert.ok(!/\+d\.travel\s*\|\|\s*45|\+v\.travel\s*\|\|\s*45|\+o\.travel\s*\|\|\s*45/.test(html), 'no surface turns 0 into 45');
});
