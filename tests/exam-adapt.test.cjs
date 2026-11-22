// Tests for exam days and the self-adapting schedule (StudyPlan in index.html).
// Run: node --test tests/exam-adapt.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
function plan(isoNow, lab = {}) {
  const NOW = new Date(isoNow).getTime();
  class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const store = { 'kg-lab-v1': JSON.stringify(lab) };
  const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  ctx.globalThis = ctx; vm.runInNewContext(src, ctx); return ctx.StudyPlan;
}
const clock = off => { const m = ((630 + off) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const study = rows => rows.filter(r => r.kind === 'study');
const TUE = '2026-11-17', EXAM = { t: 'exam', name: 'BEEE Practical', college: true, end: 900, hours: 6, from: 480 };

test('days default to free days; exams come only from the Exam today button', () => {
  const P = plan('2026-11-16T08:05:00');
  assert.strictEqual(P.dayKind('2026-11-16').t, 'normal');
  assert.strictEqual(P.dayKind(TUE).t, 'normal'); // college is a per-day toggle now
});

test('college exam day: 8-9 AM prep, no study during college, about 6 h in all, every block is exam prep', () => {
  const rows = plan(`${TUE}T08:05:00`, { dayTypes: { [TUE]: EXAM } }).fallback(2);
  const s = study(rows);
  assert.strictEqual(clock(s[0].start), '08:00');
  assert.strictEqual(clock(s[0].end), '09:00');
  assert.ok(s.every(r => r.title === 'BEEE Practical preparation'));
  assert.ok(!s.some(r => r.start < 900 - 630 && r.end > 600 - 630), 'study during college');
  assert.ok(s.reduce((n, r) => n + r.minutes, 0) <= 360);
  assert.ok(rows.some(r => r.id === 'nap'));
});

test('an exam time stops preparation 30 minutes before it', () => {
  const rows = plan(`${TUE}T08:05:00`, { dayTypes: { [TUE]: { t: 'exam', name: 'Chem test', college: false, hours: 8, at: 14 * 60 } } }).fallback(2);
  assert.ok(study(rows).length > 0);
  assert.ok(study(rows).every(r => r.end <= 13 * 60 + 30 - 630));
  assert.ok(study(rows).every(r => r.title === 'Chem test preparation'));
});

// ---- self-adapt ----
const SAT = '2026-11-28', at = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m - 630; };
const anchors = rows => rows.filter(r => /^(meal|irl|lunch|wind|sleep|college|travel|ready)/.test(r.id)).map(r => `${r.id}@${clock(r.start)}+${r.minutes}`);

test('minutes already logged are not scheduled again', () => {
  const P = plan(`${SAT}T13:00:00`, { replanAt: { [SAT]: at('13:00') } });
  const owedNone = P.replanFrom(P.fallbackRaw(6), at('13:00'), {}), owedMaths = P.replanFrom(P.fallbackRaw(6), at('13:00'), { maths: 120 });
  const m = rows => rows.filter(r => r[2] === 'study' && r[0].startsWith('maths')).reduce((n, r) => n + r[3], 0) - rows.filter(r => r[2] === 'study' && r[0].startsWith('maths') && r[5] === 'past').reduce((n, r) => n + r[3], 0);
  const fut = rows => rows.filter(r => r[2] === 'study' && r[0].startsWith('maths') && !r[5]).reduce((n, r) => n + r[3], 0);
  assert.strictEqual(fut(owedNone) - fut(owedMaths), 120);
});

test('a re-plan still stops exam preparation 30 minutes before the exam', () => {
  const day = { t: 'exam', name: 'Chem test', college: false, hours: 8, at: 14 * 60 };
  const rows = plan(`${SAT}T11:00:00`, { dayTypes: { [SAT]: day }, replanAt: { [SAT]: at('11:00') } }).fallback(6);
  assert.ok(rows.filter(r => r.kind === 'study').every(r => r.end <= at('13:30')));
});

// ---- late start: push bedtime a little, or cut hours ----
test('lateness rule: bedtime moves as far as needed, but never past 1 AM; only then is study cut', () => {
  const P = plan(`${SAT}T11:00:00`);
  const r = (late, room) => JSON.stringify(P.lateStart(late, room));
  assert.strictEqual(r(5, 80), JSON.stringify({ replan: false, push: 0 }));
  assert.strictEqual(r(40, 80), JSON.stringify({ replan: true, push: 40 }));
  assert.strictEqual(r(120, 80), JSON.stringify({ replan: true, push: 80 }));
  assert.strictEqual(r(40, 0), JSON.stringify({ replan: true, push: 0 }));
});

test('a day started 2 h late: bedtime stays at 1:30 AM', () => {
  const MON2 = '2026-11-23';
  const base = plan(`${MON2}T07:00:00`, { mathsNext: { [MON2]: 155 } }).fallback(1), first = base.find(r => r.kind === 'study').start;
  const room = at('25:00') - base.find(r => r.id === 'sleep').start;
  const rule = plan(`${MON2}T09:00:00`).lateStart(120, room);
  const re = plan(`${MON2}T09:00:00`, { mathsNext: { [MON2]: 155 }, replanAt: { [MON2]: first + 120 }, replanPush: { [MON2]: rule.push } }).fallback(1);
  assert.strictEqual(clock(re.find(r => r.id === 'sleep').start), '01:30');
});
