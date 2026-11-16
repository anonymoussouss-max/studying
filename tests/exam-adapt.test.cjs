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

test('today (Mon 16 Nov) defaults to the BEEE Practical exam day', () => {
  const P = plan('2026-11-16T08:05:00');
  assert.strictEqual(P.dayKind('2026-11-16').name, 'BEEE Practical');
  assert.strictEqual(P.dayKind(TUE).t, 'college');
});

test('college exam day: 8-9 AM prep, no study during college, about 6 h in all, every block is exam prep', () => {
  const rows = plan(`${TUE}T08:05:00`, { dayTypes: { [TUE]: EXAM } }).fallback(2);
  const s = study(rows);
  assert.strictEqual(clock(s[0].start), '08:00');
  assert.strictEqual(clock(s[0].end), '09:00');
  assert.ok(s.every(r => r.title === 'BEEE Practical preparation'));
  assert.ok(!s.some(r => r.start < 900 - 630 && r.end > 600 - 630), 'study during college');
  assert.strictEqual(s.reduce((n, r) => n + r.minutes, 0), 360);
});

test('an exam time stops preparation 30 minutes before it', () => {
  const rows = plan(`${TUE}T08:05:00`, { dayTypes: { [TUE]: { t: 'exam', name: 'Chem test', college: false, hours: 8, at: 14 * 60 } } }).fallback(2);
  assert.ok(study(rows).length > 0);
  assert.ok(study(rows).every(r => r.end <= 13 * 60 + 30 - 630));
  assert.ok(study(rows).every(r => r.title === 'Chem test preparation'));
});
