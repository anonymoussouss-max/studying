// Class 12 proxy scenarios (Lakshya JEE 2027 default, 2026 comparison), recorded-runtime evidence and the Class 11 Khazana inventory (27 Nov 2026).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
ctx.globalThis = ctx; ctx.__noCExam = true; vm.runInNewContext(src, ctx);
const SP = ctx.StudyPlan, C12 = ['m12', 'p12', 'pc12', 'oc12', 'ic12'];
const seed = () => { const s = SP.seedSyllabus(); SP.applyConfirmed11(s); return s; };
const sum = rows => rows.reduce((a, x) => a + x[1], 0);
const at = (c, name) => c.done[c.chapters.findIndex(x => x[0] === name)];

test('planner totals: 2027 = 417 lectures / 807:10 h estimated, 2026 = 423 / 822:10; per subject as published', () => {
  const want = { '2027': { m12: 135, p12: 139, pc12: 35, oc12: 70, ic12: 38, mins: 807 * 60 + 10 }, '2026': { m12: 141, p12: 139, pc12: 42, oc12: 55, ic12: 46, mins: 822 * 60 + 10 } };
  for (const [y, w] of Object.entries(want)) {
    const Y = SP.L12.years[y], E = SP.est12(y);
    for (const id of C12) {
      const c = Y.courses[id];
      assert.strictEqual(sum(c.rows), w[id], y + ' ' + id); assert.strictEqual(E[id].lectures, w[id]);
      assert.strictEqual(new Set(c.rows.map(x => x[0])).size, c.rows.length, 'no duplicate chapter'); assert.ok(c.src && c.conf, 'source and confidence stored');
    }
    assert.strictEqual(C12.reduce((a, id) => a + E[id].mins, 0), w.mins, y + ' estimated minutes');
  }
  const p = SP.L12.years['2027'].courses.p12.slots; assert.ok(p, 'physics slot subtotal stored');
  assert.strictEqual(27 * 90 + 14 * 105, 65 * 60);
  const n = (y, id) => SP.L12.years[y].courses[id].rows.map(x => x[0]);
  for (const x of ['Metallurgy', 'Polymers', 'Solid State', 'Surface Chemistry', 'Chemistry in Everyday Life']) {
    assert.ok(!C12.some(id => n('2027', id).some(r => r.includes(x))), x + ' stays out of 2027');
    assert.ok(C12.some(id => n('2026', id).some(r => r.includes(x))), x + ' is a 2026 entry');
  }
});

test('migration and switching keep progress by chapter, never duplicate a chapter, and carry lump progress once', () => {
  const s = seed(); s.courses.m12.done = [12];
  assert.strictEqual(SP.applyScenario12(s), true); assert.strictEqual(s.c12, '2027'); assert.strictEqual(SP.applyScenario12(s), false, 'idempotent');
  assert.strictEqual(s.courses.m12.carry, 12, 'lump progress carried as-is');
  for (const id of C12) {
    assert.strictEqual(sum(s.courses[id].chapters), sum(SP.L12.years['2027'].courses[id].rows));
    assert.ok(s.courses[id].provisional); assert.match(s.courses[id].name, /proxy: Lakshya JEE 2027/);
  }
  const pc = s.courses.pc12, keep = pc.chapters.find(x => SP.L12.years['2026'].courses.pc12.rows.some(r => r[0] === x[0]))[0];
  pc.done[pc.chapters.findIndex(x => x[0] === keep)] = 3;
  const before11 = JSON.stringify(['m11', 'p11', 'pc11', 'oc11', 'ic11'].map(id => s.courses[id]));
  SP.applyScenario12(s, '2026'); assert.strictEqual(s.c12, '2026');
  assert.strictEqual(at(s.courses.pc12, keep), 3, 'shared chapter keeps progress');
  for (const id of C12) assert.strictEqual(new Set(s.courses[id].chapters.map(x => x[0])).size, s.courses[id].chapters.length);
  const only26 = s.courses.oc12.chapters.find(x => !SP.L12.years['2027'].courses.oc12.rows.some(r => r[0] === x[0]))[0];
  s.courses.oc12.done[s.courses.oc12.chapters.findIndex(x => x[0] === only26)] = 1;
  SP.applyScenario12(s, '2027');
  assert.ok(!s.courses.oc12.chapters.some(x => x[0] === only26), '2026-only chapter left behind');
  assert.strictEqual(at(s.courses.pc12, keep), 3); assert.strictEqual(s.courses.oc12.doneBy[only26], 1, 'kept for the 2026 comparison');
  SP.applyScenario12(s, '2026'); assert.strictEqual(at(s.courses.oc12, only26), 1, 'restored on switching back');
  assert.strictEqual(s.courses.m12.carry, 12, 'carry never doubles');
  assert.strictEqual(JSON.stringify(['m11', 'p11', 'pc11', 'oc11', 'ic11'].map(id => s.courses[id])), before11, 'Class 11 untouched');
  assert.strictEqual(SP.forecast({ syl: s }, {}).complete, false, 'proxies: no completion date');
});

test('recorded runtime replaces an estimate only on a full match: 2027 Electrochemistry; nothing in 2026', () => {
  const R = SP.runtime12('2027'), a = R.applied;
  assert.deepStrictEqual([...a.map(x => x.listed)], ['Electrochemistry']);
  assert.strictEqual(a[0].core, 10); assert.strictEqual(a[0].coreSecs, a[0].secs - a[0].extraSecs, 'extras excluded from core');
  assert.strictEqual(a[0].coreSecs, 15 * 3600 + 25 * 60);
  const rf = R.candidates.find(x => x.listed === 'Relations and Functions'); assert.ok(rf && rf.why, 'partial 2027 Relations and Functions excluded');
  assert.strictEqual(SP.runtime12('2026').applied.length, 0);
  const nu = SP.runtime12('2026').candidates.find(x => x.listed === 'Nuclei'); assert.ok(nu && nu.why, '2026 Nuclei excluded');
  assert.ok(SP.UNMEASURED12.length && SP.UNMEASURED12.every(x => x.secs === null), 'Content Coming Soon is unavailable, not zero');
  const s = seed(); SP.applyScenario12(s); const f = SP.forecast({ syl: s }, {});
  assert.deepStrictEqual([...f.measured.map(x => x.listed)], ['Electrochemistry']);
});

test('Class 11 Khazana inventory: audited totals, kept apart from planned counts, uncertain mappings flagged', () => {
  const s = seed(), base = JSON.stringify(s.courses), K = SP.khazana11(s), hs = SP.hsec;
  const want = { m11: [20, 155, '389:02:41', 16, '29:55:07'], p11: [18, 201, '383:49:53', 35, '52:59:56'], pc11: [7, 78, '147:58:44', 8, '19:06:58'], oc11: [6, 56, '92:06:27', 14, '16:35:53'], ic11: [5, 51, '96:08:25', 0, '00:00:00'] };
  for (const [id, w] of Object.entries(want)) {
    assert.deepStrictEqual([K[id].folders, K[id].videos, K[id].secs, K[id].extras, K[id].extraSecs], [w[0], w[1], hs(w[2]), w[3], hs(w[4])], id);
    assert.deepStrictEqual([...K[id].unmatched], [], id + ': every desk chapter has a folder');
  }
  assert.deepStrictEqual(['m11', 'p11', 'pc11', 'oc11', 'ic11'].map(id => K[id].planned), [151, 184, 78, 43, 44], 'planned baseline unchanged');
  const row = (id, f) => K[id].rows.find(r => r.folder === f);
  assert.strictEqual(row('p11', 'Basic Maths (Physics)').chapter, null); assert.match(row('p11', 'Basic Maths (Physics)').flags.join(), /no desk chapter/);
  assert.match(row('m11', 'Three Dimensional Coordinate Geometry').flags.join(), /mapping uncertain/);
  assert.match(row('m11', 'Statistics').flags.join(), /only extras/);
  assert.strictEqual(JSON.stringify(s.courses), base, 'reading the inventory changes nothing');
});
