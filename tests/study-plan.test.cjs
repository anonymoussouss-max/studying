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
const MON = '2026-11-23', SAT = '2026-11-28', SUN = '2026-11-29';
const at = (d, hm) => `${d}T${hm}:00`;               // local time
const clock = off => { const m = ((630 + off) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const row = (rows, id) => rows.find(r => r.id === id);

test('weekday defaults: Mon–Sat are free days (college is a toggle), Sunday rest', () => {
  const P = plan(at(MON, '12:00'));
  assert.strictEqual(JSON.stringify(P.dayKind(MON)), JSON.stringify({ t: 'normal' }));
  assert.strictEqual(JSON.stringify(P.dayKind(SAT)), JSON.stringify({ t: 'normal' }));
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

test('college day with a 155-min Maths lecture: wake 5:55, lecture ends at 9:00, about 8 h of study, dinner at 11 PM', () => {
  const P = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 155 } });
  const rows = P.fallback(1);
  assert.strictEqual(clock(row(rows, 'wake').start), '05:55');
  assert.strictEqual(clock(row(rows, 'maths-chunk-m').end), '09:00');
  const total = rows.filter(r => r.kind === 'study').reduce((n, r) => n + r.minutes, 0);
  assert.ok(total >= 470 && total <= 480, 'total ' + total);
  assert.strictEqual(clock(row(rows, 'meal-1').start), '23:00');
});

test('wake time never goes before 5:00, however long the lecture', () => {
  const P = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 300 } });
  assert.strictEqual(clock(row(P.fallback(1), 'wake').start), '05:00');
});

test('a 5 PM college day puts travel home at 5:00 PM', () => {
  const P = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 1020 } } });
  assert.strictEqual(clock(row(P.fallback(1), 'travel-1').start), '17:00');
});

test('"I\'m home now" late: what does not fit before dinner moves to tomorrow', () => {
  const P = plan(at(MON, '18:40'), { dayTypes: { [MON]: { t: 'college', end: 1020 } }, homeAt: { [MON]: 18 * 60 + 40 - 630 } });
  const rows = P.fallback(1);
  assert.match(row(rows, 'meal-1').title, /moves to tomorrow: .*Chemistry \d+ min/);
  assert.strictEqual(clock(row(rows, 'meal-1').start), '23:00');
});

test('free day: 8 hours by default, Normal starts at noon; 10 hours when chosen', () => {
  const P = plan(at(SAT, '11:00'));
  assert.strictEqual(P.hours(), 8);
  assert.strictEqual(clock(P.fallback(6).find(r => r.kind === 'study').start), '12:00');
  assert.strictEqual(plan(at(SAT, '11:00'), { dayHours: { [SAT]: 10 } }).hours(), 10);
});

test('re-planned after dinner: what does not fit is still named, on the wind-down row', () => {
  const late = 20 * 60 - 630, rows = plan(`${SAT}T20:00:00`, { replanAt: { [SAT]: late } }).fallback(6);
  assert.match(row(rows, 'wind').title, /moves to tomorrow: .*Physics \d+ min.*Chemistry \d+ min/);
});

test('the desk day starts at 4:00 AM: 5:00 AM belongs to the same calendar day', () => {
  const P = plan(at(MON, '05:00'), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 155 } });
  // a college-day plan (not Sunday's empty rest plan) means 5 AM counted as Monday
  assert.ok(P.fallback(1).some(r => r.id === 'maths-chunk-m'));
});

test('no separate spaced-revision blocks: older material lives inside practice, totals unchanged', () => {
  const due = [{ id: 'x', subj: 'Physics', due: '2026-11-10', stage: 1 }, { id: 'y', subj: 'Maths', due: '2026-11-10', stage: 1 }];
  const college = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 155 }, lectures: due }).fallback(1);
  const holiday = plan(at(SAT, '11:00'), { lectures: due }).fallback(6);
  for (const rows of [college, holiday]) assert.ok(!rows.some(r => /-sp-chunk/.test(r.id)), 'found a spaced block');
  const plain = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 155 } }).fallback(1);
  const sum = rows => rows.filter(r => r.kind === 'study').reduce((n, r) => n + r.minutes, 0);
  assert.strictEqual(sum(college), sum(plain));
  assert.strictEqual(holiday.filter(r => r.kind === 'study').reduce((n, r) => n + r.minutes, 0), 480);
});

test('subject practice blocks carry a "mix in older material" note', () => {
  const rows = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 155 } }).fallback(1);
  assert.match(rows.find(r => r.id.startsWith('physics-chunk')).how, /Mix in about \d+ min of older material/);
});

test('after college comes a 3-hour nap instead of lunch, then study resumes', () => {
  const rows = plan(at(MON, '07:00'), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 155 } }).fallback(1);
  assert.ok(!rows.some(r => r.id === 'lunch'), 'lunch still there');
  const nap = row(rows, 'nap');
  assert.strictEqual(clock(nap.start), '15:20');
  assert.strictEqual(nap.minutes, 180);
  const next = rows.find(r => r.kind === 'study' && r.start >= nap.end);
  assert.strictEqual(clock(next.start), '18:20');
});

// ---- the daily routine: Early / Normal / Late x 4-16 h around fixed anchors ----
const FRI = '2026-11-27';
const anchorsAt = fri => ({ 'tea-am': 0, lunch: 360, 'tea-pm': 540, irl: fri ? 630 : 600, wind: 780, sleep: 870 });
test('every available plan has its exact study total and keeps every fixed block in place (Friday too)', () => {
  for (const [day, dow] of [[MON, 1], [FRI, 5]]) {
    const P0 = plan(at(day, '10:40')), o = P0.routineOptions(dow);
    for (const h of P0.routineHours) for (const v of ['early', 'normal', 'late']) {
      if (!o[h].ok) continue;
      const rows = plan(at(day, '10:40'), { dayHours: { [day]: h }, planVariant: v }).fallback(dow), want = anchorsAt(dow === 5);
      assert.strictEqual(rows.filter(r => r.kind === 'study').reduce((n, r) => n + r.minutes, 0), h * 60, h + ' ' + v);
      for (const id in want) assert.strictEqual(rows.find(r => r.id === id).start, want[id], day + ' ' + h + ' ' + v + ' ' + id);
      assert.ok(rows.filter(r => r.kind === 'study').every(r => r.start >= 30 && r.end <= 780), 'study outside 11 AM to 11:30 PM');
      assert.strictEqual(rows.find(r => r.id === 'sleep').minutes, 570);
    }
  }
});
test('12 and 16 hours are unavailable, with the reason', () => {
  const o = plan(at(MON, '10:40')).routineOptions(1);
  for (const h of [12, 16]) { assert.strictEqual(o[h].ok, false); assert.match(o[h].why, /wind-down/); }
  for (const h of [4, 6, 7, 8, 10]) assert.ok(o[h].ok, h + ' h');
});
test('Late 8 h starts in the early afternoon and ends by 11:30 PM; Early starts at 11:00', () => {
  const o = plan(at(MON, '10:40')).routineOptions(1)[8];
  assert.strictEqual(clock(o.early.start), '11:00');
  assert.ok(o.late.start >= 150 && o.late.start <= 210, clock(o.late.start));
  assert.ok(o.late.end <= 780 && o.normal.start > o.early.start && o.normal.start < o.late.start);
});
test('night meds sit at the set time and never move', () => {
  const rows = plan(at(MON, '10:40'), { medsAt: 840 }).fallback(1), m = rows.find(r => r.id === 'meds');
  assert.strictEqual(clock(m.start), '00:30');
  const re = plan(at(MON, '15:00'), { medsAt: 840, replanAt: { [MON]: 270 } }).fallback(1);
  assert.strictEqual(re.find(r => r.id === 'meds').start, m.start);
});
test('re-planned late on a free day: owed study moves later, sleep and wind-down stay, overflow is named', () => {
  const re = plan(at(MON, '20:00'), { replanAt: { [MON]: 570 } }).fallback(1);
  assert.strictEqual(re.find(r => r.id === 'wind').start, 780);
  assert.strictEqual(re.find(r => r.id === 'sleep').start, 870);
  assert.ok(re.filter(r => r.kind === 'study').every(r => r.start >= 570 && r.end <= 780));
  assert.match(re.find(r => r.id === 'wind').title, /moves to tomorrow/);
});
