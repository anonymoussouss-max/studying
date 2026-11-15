// Tests for the day builder in index.html (the script that defines StudyPlan).
// Run: node --test tests/
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');

const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));

// load StudyPlan with a fixed clock and the given saved data (kg-lab-v1)
function plan(isoNow, lab = {}) {
  const NOW = new Date(isoNow).getTime();
  class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const store = { 'kg-lab-v1': JSON.stringify(lab) };
  const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx);
  return ctx.StudyPlan;
}
const MON = '2026-11-16', SAT = '2026-11-21', SUN = '2026-11-22';
const at = (d, hm) => `${d}T${hm}:00`;               // local time
const clock = off => { const m = ((630 + off) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const row = (rows, id) => rows.find(r => r.id === id);

test('weekday defaults: Mon–Fri college until 3 PM, Saturday holiday, Sunday rest', () => {
  const P = plan(at(MON, '12:00'));
  assert.strictEqual(JSON.stringify(P.dayKind(MON)), JSON.stringify({ t: 'college', end: 900 }));
  assert.strictEqual(JSON.stringify(P.dayKind(SAT)), JSON.stringify({ t: 'holiday' }));
  assert.strictEqual(JSON.stringify(P.dayKind(SUN)), JSON.stringify({ t: 'rest' }));
});

test('a saved day type overrides the weekday default', () => {
  const P = plan(at(MON, '12:00'), { dayTypes: { [MON]: { t: 'holiday' } } });
  assert.strictEqual(JSON.stringify(P.dayKind(MON)), JSON.stringify({ t: 'holiday' }));
});

test('lecture lengths parse as minutes', () => {
  const P = plan(at(MON, '12:00'));
  assert.strictEqual(P.parseMins('2h 35m'), 155);
  assert.strictEqual(P.parseMins('2.5h'), 150);
  assert.strictEqual(P.parseMins('155'), 155);
  assert.strictEqual(P.parseMins('soon'), 0);
});

test('college day with a 155-min Maths lecture: wake 5:55, lecture ends at 9:00, 8 h of study, dinner at 11 PM', () => {
  const P = plan(at(MON, '07:00'), { mathsNext: { [MON]: 155 } });
  const rows = P.fallback(1);
  assert.strictEqual(clock(row(rows, 'wake').start), '05:55');
  assert.strictEqual(clock(row(rows, 'maths-chunk-m').end), '09:00');
  assert.strictEqual(rows.filter(r => r.kind === 'study').reduce((n, r) => n + r.minutes, 0), 480);
  assert.strictEqual(clock(row(rows, 'meal-1').start), '23:00');
});

test('wake time never goes before 5:00, however long the lecture', () => {
  const P = plan(at(MON, '07:00'), { mathsNext: { [MON]: 300 } });
  assert.strictEqual(clock(row(P.fallback(1), 'wake').start), '05:00');
});

test('a 5 PM college day puts travel home at 5:00 PM', () => {
  const P = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 1020 } } });
  assert.strictEqual(clock(row(P.fallback(1), 'travel-1').start), '17:00');
});

test('"I\'m home now" late: what does not fit before dinner moves to tomorrow', () => {
  const P = plan(at(MON, '18:40'), { dayTypes: { [MON]: { t: 'college', end: 1020 } }, homeAt: { [MON]: 18 * 60 + 40 - 630 } });
  const rows = P.fallback(1);
  assert.match(row(rows, 'meal-1').title, /moves to tomorrow: Chemistry \d+ min/);
  assert.strictEqual(clock(row(rows, 'meal-1').start), '23:00');
});

test('holiday: 10 hours from 10:30 with a Mock / backlog / test block', () => {
  const P = plan(at(SAT, '11:00'));
  const rows = P.fallback(6);
  assert.strictEqual(P.hours(), 10);
  assert.strictEqual(clock(rows.find(r => r.kind === 'study').start), '10:30');
  assert.ok(rows.some(r => r.id.startsWith('mock-chunk')));
});

test('the desk day starts at 4:00 AM: 5:00 AM belongs to the same calendar day', () => {
  const P = plan(at(MON, '05:00'), { mathsNext: { [MON]: 155 } });
  // a college-day plan (not Sunday's empty rest plan) means 5 AM counted as Monday
  assert.ok(P.fallback(1).some(r => r.id === 'maths-chunk-m'));
});
