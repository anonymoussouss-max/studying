// Rank milestones, permanence, Immortal Gu records and blessed-land unlock (rev 4). Synthetic data only.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const grab = id => { const a = html.indexOf(`<script id="${id}">`), b = html.indexOf('</script>', a); return html.slice(a + `<script id="${id}">`.length, b); };
const win = {}, ctx = { window: win, Object, Math, String, JSON, Set, Array, Number, Date };
for (const id of ['kg-cult-script', 'kg-proof-script', 'kg-rank-script']) vm.runInNewContext(grab(id), ctx);
const R = win.KgRank;
const g = (level, acq = 'obtained') => ({ level, acq });
const v = (lv, o = {}) => ({ ed: { complete: o.incomplete ? false : true, missing: o.incomplete ? ['Class 11 organic'] : [], id: 'class11-edition-0' },
  subjects: { maths: { gu: [g(lv.maths || 'learning')] }, physics: { gu: [g(lv.physics || 'learning')] }, chem: { gu: [g(lv.chem || 'learning')] } } });
const st = (gs, id) => gs.find(x => x.id === id);

test('an incomplete catalogue gives "unknown", never a rank or a failure; no starting rank is awarded', () => {
  const gs = R.gates(v({}, { incomplete: true }));
  assert.strictEqual(st(gs, 'r3-initial').status, 'unknown'); assert.ok(/catalogue incomplete/.test(st(gs, 'r3-initial').why));
  assert.ok(!gs.some(x => x.status === 'met' || x.status === 'earned'));
});
test('Rank 3 initial is met when every Class 11 Gu is obtained and at least Learning; gates needing Class 12 stay provisional', () => {
  const gs = R.gates(v({}));
  assert.strictEqual(st(gs, 'r3-initial').status, 'met');
  for (const id of ['r3-middle', 'r4-initial', 'r4-middle', 'r5-initial']) assert.strictEqual(st(gs, id).status, 'provisional');
  assert.strictEqual(st(gs, 'r6-initial').status, 'roadmap');
});
test('subject gates are separate: high Maths cannot carry low Chemistry', () => {
  const s = st(R.gates(v({ maths: 'proven', chem: 'obtained' })), 'r3-initial');
  assert.strictEqual(s.status, 'not-yet'); assert.ok(/chem/.test(s.why) && !/maths/.test(s.why));
});
test('earlier milestones stay binding prerequisites', () => {
  const c12 = { maths: [g('proven')], physics: [g('proven')], chem: [g('proven')] };
  const gs = R.gates(v({ chem: 'obtained' }), { class12: c12 });
  assert.strictEqual(st(gs, 'r3-initial').status, 'not-yet'); assert.strictEqual(st(gs, 'r3-middle').status, 'not-yet');
  assert.ok(/prerequisite/.test(st(gs, 'r3-middle').why));
});
test('Rank 5 needs the external evidence (valid bank and B2) as well as PCM Proven', () => {
  const c12 = { maths: [g('proven')], physics: [g('proven')], chem: [g('proven')] }, all = v({ maths: 'proven', physics: 'proven', chem: 'proven' });
  assert.strictEqual(st(R.gates(all, { class12: c12 }), 'r5-initial').status, 'not-yet');
  assert.strictEqual(st(R.gates(all, { class12: c12, bank: { verified: true }, b2: { verified: true } }), 'r5-initial').status, 'met');
});
test('earned stages are permanent: a later gap shows "refresh", never demotion; recording twice adds nothing', () => {
  let earned = R.earn([], 'r3-initial', 1, 'class11-edition-0'); earned = R.earn(earned, 'r3-initial', 2, 'class11-edition-1');
  assert.strictEqual(earned.length, 1);
  const s = st(R.gates(v({ chem: 'obtained' }), { earned }), 'r3-initial');
  assert.strictEqual(s.status, 'earned'); assert.ok(/refreshing/.test(s.refresh));
});
test('Immortal Gu: nothing generated or awarded; a record verified by a model, or missing any part, never counts', () => {
  const ok = { fresh: true, checks: [{ kind: 'script' }], independent: true, defence: 'x', extension: 'y', verifiedBy: 'teacher' };
  assert.strictEqual(R.immortalValid(ok), true);
  assert.strictEqual(R.immortalValid(Object.assign({}, ok, { verifiedBy: 'second AI model' })), false);
  assert.strictEqual(R.immortalValid(Object.assign({}, ok, { defence: '' })), false);
  assert.strictEqual(R.immortalValid(Object.assign({}, ok, { checks: [{ kind: 'same-model' }] })), false);
});
test('blessed land unlocks at Rank 4 or a first valid Immortal Gu; the preview writes nothing and has no economy or decay', () => {
  assert.strictEqual(R.land([], []).unlocked, false);
  assert.strictEqual(R.land([{ gate: 'r4-initial' }], []).unlocked, true);
  assert.strictEqual(R.land([], [{ fresh: true, checks: [{ kind: 'script' }], independent: true, defence: 'x', extension: 'y', verifiedBy: 'teacher' }]).unlocked, true);
  const src = grab('kg-rank-script'), pv = src.slice(src.indexOf('M.ACTIONS.rpreview'), src.indexOf('M.ACTIONS.rearn'));
  assert.ok(!/setItem/.test(pv)); assert.ok(/nothing here is earned or saved/.test(src));
  assert.ok(!/coins?|currency\s*[:=]|harvest|decay\s*[:=]/i.test(src.replace(/no upkeep, decay, currency or missed-day penalties/, '')));
});
