// Cultivation preview (Phase 1a): a read-only view of chapter Gu from existing records. Synthetic records only.
// Run: node --test tests/cultivation.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = /<script id="kg-cult-script">([\s\S]*?)<\/script>/.exec(html)[1];
const win = {}; vm.runInNewContext(src, { window: win, Object, Math, String }); const { cultivation } = win.KgCult;
const course = (subj, chapters, done, extra = {}) => Object.assign({ subj, cls: 11, chapters, done }, extra);
const L = (o = {}) => ({ medals: o.medals || {}, syl: { courses: Object.assign({
  m11: course('maths', [['Quadratic Equations', 11], ['Basic Mathematics', 23]], [11, 20]),
  p11: course('physics', [['Laws of Motion', 15]], [15]),
  pc11: course('chem', [['Basic Concepts', 21]], [21]), oc11: course('chem', [['Class 11 organic (lecture count missing)', null]], []),
  m12: course('maths', [['Class 12 Maths', 135]], [], { cls: 12, provisional: true }) }, o.courses || {}), qs: o.qs || [] } });
const gu = (v, s, name) => v.subjects[s].gu.find(g => g.name === name);
const q = (lec, roles, state, subj = 'maths') => ({ subj, lec, roles, state });

test('a chapter with lectures done but no assigned items listed is "scope unverified", not obtained or failed', () => {
  const g = gu(cultivation(L()), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.acq, 'scope-unverified'); assert.strictEqual(g.share, 0);
});
test('obtained needs every assigned item attempted; a wrong attempt counts; unattempted does not; modules never count', () => {
  const qs = [q('Quadratic Equations L3', ['tah'], 'retry'), q('Quadratic Equations L5', ['dpp'], 'help'), q('Quadratic Equations L5', ['module'], 'unattempted')];
  const g = gu(cultivation(L({ qs })), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.acq, 'obtained'); assert.strictEqual(g.share, 40); assert.strictEqual(g.modules, 1);
  const open = gu(cultivation(L({ qs: qs.concat(q('Quadratic Equations L7', ['ktk'], 'unattempted')) })), 'maths', 'Quadratic Equations');
  assert.strictEqual(open.acq, 'attempts-open'); assert.strictEqual(open.share, 0);
});
test('lectures unfinished means not obtained, whatever the homework says', () => {
  assert.strictEqual(gu(cultivation(L({ qs: [q('Basic Mathematics L1', ['hw'], 'independent')] })), 'maths', 'Basic Mathematics').acq, 'not-obtained');
});
test('old medals: recognised as legacy proof (retention pending) only when every linked chapter has one; partial is labelled; the medal is untouched', () => {
  const qs = [q('Laws of Motion L2', ['hw'], 'independent', 'physics')];
  const medals = { 'p-newton-s-laws-of-motion': { d: '2026-11-01', score: 80 } }, before = JSON.stringify(medals);
  const part = gu(cultivation(L({ qs, medals })), 'physics', 'Laws of Motion');
  assert.strictEqual(part.legacy, 'partial'); assert.strictEqual(part.share, 40);
  medals['p-friction'] = { d: '2026-11-02', score: 90 };
  const all = gu(cultivation(L({ qs, medals })), 'physics', 'Laws of Motion');
  assert.strictEqual(all.legacy, 'recognised'); assert.strictEqual(all.share, 90, 'never 100: retention is still pending');
  assert.strictEqual(JSON.stringify(medals), JSON.stringify(Object.assign(JSON.parse(before), { 'p-friction': { d: '2026-11-02', score: 90 } })));
});
test('weights: lecture count x subject multiplier; subjects are kept separate', () => {
  const v = cultivation(L());
  assert.strictEqual(gu(v, 'maths', 'Basic Mathematics').weight, 207); assert.strictEqual(gu(v, 'physics', 'Laws of Motion').weight, 82.5);
});
test('placement is not computed while any subject catalogue is incomplete; Class 12 proxies are left out', () => {
  const v = cultivation(L());
  assert.strictEqual(v.placement, 'not-computed'); assert.strictEqual(JSON.stringify(v.why), '["chem"]');
  assert.strictEqual(JSON.stringify(v.subjects.chem.missing), '["Class 11 organic (lecture count missing)"]');
  assert.ok(!v.subjects.maths.gu.some(g => /Class 12/.test(g.name)));
});
test('the preview is read-only and confidence is not mastery', () => {
  assert.ok(!/\bsave\(|setItem|L\.ch\[|\.c = /.test(src), 'the cultivation script writes nothing');
  assert.match(html, /learning: \['Practising', 'Some practice/, 'the early evidence level is "Practising", so "Learning" is free for the level below Proven');
  assert.ok(!/L\.ch\b/.test(src), 'confidence dots are not read as mastery');
});
