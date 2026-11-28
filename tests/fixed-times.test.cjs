// Fixed commitments keep their exact clock times; flexible food breaks move around them; fixed-vs-fixed overlaps stay visible.
// Run: node --test tests/fixed-times.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; ctx.__noCExam = true;
vm.runInNewContext(scripts.find(s => s.includes('root.StudyPlan=api')), ctx);
const P = ctx.StudyPlan, D = '2026-12-01', DOW = 2;
const day = (food, extra = {}) => { const t = P.templateDay({ sched: Object.assign({ food: { [D]: food } }, extra) }, D, DOW); return t.rows || t; };
const at = (rows, id) => { const r = rows.find(x => x.id === id); return r && [r.s, r.e]; };
const FIXED = { personal: [1230, 1260], reading: [1280, 1400], dinner: [1400, 1430], ready: [1520, 1530] };
const fixedKept = rows => { for (const [id, se] of Object.entries(FIXED)) assert.deepStrictEqual(at(rows, id), se, id + ' keeps its time'); };
const noOverlapWithFixed = (rows, id) => { const f = rows.find(x => x.id === id); for (const k of Object.keys(FIXED)) { const [s, e] = FIXED[k]; assert.ok(!(f.s < e && f.e > s), `${id} must not overlap ${k}`); } };

test('a food break at 8:25 PM no longer crops the 8:30 PM commitment; it moves to just before it', () => {
  const r = day([{ at: 1225, len: 20 }]); fixedKept(r); noOverlapWithFixed(r, 'food-0'); assert.deepStrictEqual(at(r, 'food-0'), [1210, 1230]);
  assert.match(r.find(x => x.id === 'food-0').title, /moved from 8:25 PM/);
});
test('a 45-minute break at 9:15 PM no longer crops protected reading; it goes to the nearest free slot', () => {
  const r = day([{ at: 1275, len: 45 }]); fixedKept(r); noOverlapWithFixed(r, 'food-0'); assert.deepStrictEqual(at(r, 'food-0'), [1185, 1230]);
});
test('across midnight: a break overlapping getting ready moves before it; a free one after midnight stays put', () => {
  const r = day([{ at: 1510, len: 20 }]); fixedKept(r); noOverlapWithFixed(r, 'food-0'); assert.deepStrictEqual(at(r, 'food-0'), [1500, 1520]);
  const r2 = day([{ at: 1450, len: 20 }]); fixedKept(r2); assert.deepStrictEqual(at(r2, 'food-0'), [1450, 1470]);
});
test('two fixed rows that overlap both keep their original times and the clash is named', () => {
  const r = day([], { exams: [{ name: 'Diploma', days: [{ d: D, at: 1200, len: 180, travel: 30 }] }] });
  assert.deepStrictEqual(at(r, 'personal'), [1230, 1260]); assert.deepStrictEqual(at(r, 'reading'), [1280, 1400]);
  const p = r.find(x => x.id === 'personal'); assert.ok(p.conflict && /overlaps/.test(p.title));
  assert.ok(r.find(x => /^exam-/.test(x.id)), 'the exam stays too');
});
test('no study row ever overlaps a fixed row', () => {
  for (const food of [[], [{ at: 1225, len: 20 }], [{ at: 1275, len: 45 }], [{ at: 1000, len: 30 }]]) { const r = day(food);
    for (const s of r.filter(x => x.kind === 'study')) for (const [k, [a, b]] of Object.entries(FIXED)) assert.ok(!(s.s < b && s.e > a), `study ${s.s}-${s.e} overlaps ${k}`); }
});
