// Tests for protected reading (26 Nov 2026): 9:20-11:20 PM is personal reading time, on by default. Study ends by 9:20 PM,
// dinner (11:20-11:50 PM) and the 1:30 AM bedtime stay, piano and the extended evening are off, and the study the reading
// displaces is not moved anywhere: no catch-up, no squeezed breaks, earlier gaps stay free. All fixtures are synthetic.
// Run: node --test tests/reading.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
function load(at = '2026-11-24T12:00:00') {
  const NOW = new Date(at).getTime();
  class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const store = { 'kg-lab-v1': '{}' };
  const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  ctx.globalThis = ctx; ctx.__noCExam = true; vm.runInNewContext(src, ctx); return ctx.StudyPlan;
}
const SP = load(), D = '2026-11-24', SUN = '2026-11-29', C0 = { actual14: {}, loggedAny: false, diplomaToday: 0, noCExam: true };
const day = (sched, now = -1, d = D) => SP.templateDay({ syl: SP.seedSyllabus(), sched }, d, new Date(d + 'T12:00:00').getDay(), now, C0);
const study = t => t.rows.filter(r => r.kind === 'study'), sum = rs => rs.reduce((n, r) => n + r.e - r.s, 0);
const find = (t, id) => t.rows.find(r => r.id === id);
// wake time -> study minutes with reading on (reading off: 360, 360, 340, 300, 240)
const TOTALS = { 600: 360, 720: 330, 780: 310, 840: 270, 900: 210 };

test('reading is on by default and sits at 9:20-11:20 PM as protected personal time', () => {
  assert.strictEqual(SP.schedOf({}).reading, true);
  const t = day({ wake: { [D]: 720 } }), r = find(t, 'reading');
  assert.ok(r, 'reading block present');
  assert.deepStrictEqual([r.s, r.e, r.kind], [1280, 1400, 'life']);
  assert.match(r.title, /Reading · protected personal time/);
});

test('every wake time: study ends by 9:20 PM, totals shrink, dinner and bedtime stay', () => {
  for (const [W, want] of Object.entries(TOTALS)) {
    const t = day({ wake: { [D]: +W } });
    assert.strictEqual(sum(study(t)), want, 'wake ' + W);
    assert.ok(study(t).every(r => r.e <= 1280), 'nothing after 9:20 PM, wake ' + W);
    const dinner = find(t, 'dinner'), ready = find(t, 'ready'), sleep = t.rows.find(r => r.kind === 'sleep');
    assert.deepStrictEqual([dinner.s, dinner.e], [1400, 1430], 'dinner 11:20-11:50 PM');
    assert.deepStrictEqual([ready.s, ready.e], [1520, 1530], 'getting ready 1:20 AM');
    assert.strictEqual(sleep.s, 1530, 'bed at 1:30 AM');
    assert.ok(!t.rows.some(r => r.id === 'piano'), 'no piano');
  }
});

test('breaks keep their length and the 3:30-4 PM and 8:15-8:30 PM gaps are not filled', () => {
  const on = day({ wake: { [D]: 720 } }), off = day({ reading: false, wake: { [D]: 720 } });
  const brk = t => t.rows.filter(r => r.brk).map(r => [r.s, r.e]);
  assert.deepStrictEqual(brk(on), brk(off), 'same breaks');
  // every study block with reading on is the same block (or the shortened 9:00 PM one) as with reading off
  const offS = study(off);
  for (const r of study(on)) assert.ok(offS.some(x => x.s === r.s && x.e >= r.e), 'not moved: ' + r.s);
  for (const r of study(on)) assert.ok(!(r.s < 960 && r.e > 930) && !(r.s < 1230 && r.e > 1215), 'gap filled at ' + r.s);
});

test('extended evening, an hours target and a piano time are all ignored while reading is on', () => {
  const t = day({ wake: { [D]: 720 }, extend: { [D]: true }, piano: { [D]: 1450 } });
  assert.strictEqual(sum(study(t)), 330);
  assert.strictEqual(t.extend, false);
  assert.ok(!t.rows.some(r => r.id === 'piano'));
  assert.ok(study(t).every(r => r.e <= 1280));
  const eight = SP.templateDay({ syl: SP.seedSyllabus(), sched: { wake: { [D]: 720 } }, dayHours: { [D]: 8 } }, D, 2, -1, C0);
  assert.ok(study(eight).every(r => r.e <= 1280), 'an 8 h target does not reopen the evening');
});

test('reduced, gentle return and Sunday stay before 9:20 PM', () => {
  const late = 1200;
  for (const plan of ['reduced', 'gentle']) {
    const t = day({ wake: { [D]: 720 }, plan: { [D]: plan } }, late);
    assert.ok(study(t).every(r => r.e <= 1280), plan);
    assert.ok(find(t, 'reading'), plan + ' keeps reading');
  }
  const g = day({ wake: { [D]: 720 }, gentle: { on: true, max: 120 } });
  assert.ok(sum(study(g)) <= 120 && study(g).every(r => r.e <= 1280), 'gentle return');
  const s = day({ wake: { [SUN]: 720 } }, -1, SUN);
  assert.ok(study(s).every(r => r.e <= 1280), 'sunday');
});

test('an edit cannot move study into reading or after it', () => {
  const t0 = day({ wake: { [D]: 720 } }), b = study(t0).find(r => r.s === 1260);
  assert.ok(b, 'the 9:00 PM block');
  const t = day({ wake: { [D]: 720 }, edits: { [D]: [{ from: 1260, s: 1440, e: 1470 }] } });
  assert.ok(study(t).every(r => r.e <= 1280));
});

test('switching reading off restores the old evening', () => {
  const t = day({ reading: false, wake: { [D]: 720 } });
  assert.ok(!find(t, 'reading'));
  assert.strictEqual(sum(study(t)), 360);
});
