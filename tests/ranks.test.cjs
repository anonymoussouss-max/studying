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
  const lad = R.ladder(v({})); assert.strictEqual(lad.find(x => x.id === 'r6-initial').kind, 'roadmap'); assert.ok(!gs.some(x => x.id === 'r6-initial'), 'an undefined stage is never a counted gate');
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

test('a catalogue built from unconfirmed published plans never unlocks a rank: gates stay provisional', () => {
  const x = v({}); x.ed.provisional = true; x.ed.provisionalWhy = ['oc11: secondary copy'];
  const gs = R.gates(x);
  assert.strictEqual(st(gs, 'r3-initial').status, 'provisional'); assert.ok(/not confirmed/.test(st(gs, 'r3-initial').why));
  assert.ok(!gs.some(g => g.status === 'met'));
});

// ---- the full ladder (rev 5) ----
const L = R.LADDER, LV = R.LV, pv = (pct, lv = 'learning') => { const x = v({ maths: lv, physics: lv, chem: lv }); for (const s of ['maths', 'physics', 'chem']) x.subjects[s].pct = pct; return x; };
const find = (lad, id) => lad.find(x => x.id === id);

test('ladder: Ranks 1–9, each Initial → Middle → Upper → Peak, in order, with no empty requirement', () => {
  assert.strictEqual(L.length, 36);
  L.forEach((g, i) => { assert.strictEqual(g.rank, Math.floor(i / 4) + 1); assert.strictEqual(g.stage, R.STAGE_N[i % 4]); assert.ok(g.needs && g.needs.length > 10, g.id);
    if (g.def === 'undefined') assert.ok(g.missing && g.missing.length > 10, g.id + ' names its missing specification');
    if (g.def === 'proposed') assert.ok(g.why && g.src, g.id + ' has a rationale and source'); });
  for (let r = 1; r <= 6; r++) assert.ok(L.filter(g => g.rank === r && g.def !== 'undefined').length >= (r === 6 ? 3 : 4), 'Ranks 1–6 have defined or proposed criteria');
});

test('ladder: the agreed anchors are unchanged — five counted milestones, and Rank 6 agreed in principle but pending definition', () => {
  assert.deepStrictEqual([...L.filter(g => g.def === 'agreed').map(g => g.id)], ['r3-initial', 'r3-middle', 'r4-initial', 'r4-middle', 'r5-initial']);
  assert.match(find(L, 'r3-initial').needs, /^every Class 11 chapter Gu obtained and at least Learning/);
  assert.match(find(L, 'r5-initial').needs, /German B2/);
  const r6 = find(L, 'r6-initial'); assert.strictEqual(r6.def, 'undefined'); assert.ok(r6.agreedIdea); assert.match(r6.needs, /not enrolment/);
});

test('ladder: later stages are never easier — thresholds rise and levels never drop; Rank 2 peak sits below Rank 3 initial', () => {
  let pct = -1, lvl = -1, bank = -1, p12 = -1;
  for (const g of L.filter(x => x.test)) { const t = g.test;
    if (t.pct != null) { assert.ok(t.pct > pct, g.id); pct = t.pct; }
    if (t.min) { assert.ok(LV[t.min] >= lvl || t.cls.includes(12) && lvl <= LV.learning, g.id); lvl = Math.max(lvl, LV[t.min]); }
    if (t.pct12 != null) { assert.ok(t.pct12 > p12, g.id); p12 = t.pct12; }
    if (t.bank != null) { assert.ok(t.bank > bank, g.id); bank = t.bank; } }
  assert.ok(find(L, 'r2-peak').test.pct < 75, 'every chapter Learning gives 75%, above Rank 2 peak');
  assert.ok(find(L, 'r3-peak').test.pct12 < 75, 'Rank 3 peak stays below Rank 4 initial');
});

test('ladder: proposed criteria stay out of the calculation until approved; pending ones cannot be approved', () => {
  const lad = R.ladder(pv(70, 'obtained'));
  assert.strictEqual(find(lad, 'r2-peak').kind, 'proposed'); assert.strictEqual(find(lad, 'r2-peak').now, 'met', 'the preview shows it would be met');
  assert.ok(!R.gates(pv(70, 'obtained')).some(g => /^r[12]-/.test(g.id)), 'not a counted gate');
  assert.strictEqual(find(lad, 'r3-initial').kind, 'current');
  let ap = R.approve([], 'r1-middle', 1); ap = R.approve(ap, 'r1-middle', 2); assert.strictEqual(ap.length, 1);
  assert.strictEqual(R.approve([], 'r5-middle', 1).length, 0, 'a proposal pending definition cannot be approved');
  assert.strictEqual(R.approve([], 'r7-initial', 1).length, 0); assert.strictEqual(R.approve([], 'r3-initial', 1).length, 0);
  const lad2 = R.ladder(pv(7, 'obtained'), { approved: ap });
  assert.strictEqual(find(lad2, 'r1-middle').kind, 'current'); assert.strictEqual(find(lad2, 'r1-middle').now, 'met');
  assert.strictEqual(find(lad2, 'r3-initial').kind, 'upcoming');
});

test('ladder: an incomplete catalogue or unknown evidence is "Insufficient data", never a low rank or a failure', () => {
  const lad = R.ladder(v({}, { incomplete: true }));
  assert.ok(!lad.some(g => g.kind === 'earned' || g.kind === 'current' && g.now === 'met'));
  for (const id of ['r1-initial', 'r3-initial']) { assert.strictEqual(find(lad, id).now, 'unknown'); assert.ok(find(lad, id).cat); }
  assert.strictEqual(find(lad, 'r3-initial').kind, 'insufficient');
  // bank edition not frozen: unknown, not failed
  const c12 = { maths: [g('proven')], physics: [g('proven')], chem: [g('proven')] }, all = v({ maths: 'proven', physics: 'proven', chem: 'proven' });
  const up = find(R.ladder(all, { class12: c12, approved: R.approve([], 'r4-upper', 1), earned: [{ gate: 'r4-middle' }] }), 'r4-upper');
  assert.strictEqual(up.now, 'unknown'); assert.strictEqual(up.kind, 'insufficient'); assert.match(up.why, /not frozen/);
});

test('ladder: earned stages are permanent and imply the stages below; old records migrate unchanged; land opens at any Rank 4+', () => {
  const old = [{ gate: 'r3-initial', at: 1, edition: 'class11-edition-0', by: 'you accepted' }]; // a record written before rev 5
  const lad = R.ladder(pv(10, 'obtained'), { earned: old });
  assert.strictEqual(find(lad, 'r3-initial').kind, 'earned'); assert.ok(/refreshing/.test(find(lad, 'r3-initial').refresh), 'a later gap asks for refreshing');
  for (const id of ['r1-initial', 'r2-peak']) { assert.strictEqual(find(lad, id).kind, 'earned'); assert.ok(find(lad, id).implied); }
  assert.strictEqual(find(lad, 'r3-middle').kind, 'insufficient', 'Class 12 not catalogued');
  assert.strictEqual(R.gates(pv(10, 'obtained'), { earned: old }).find(x => x.id === 'r3-initial').status, 'earned');
  assert.strictEqual(R.land([{ gate: 'r4-upper' }], []).unlocked, true); assert.strictEqual(R.land([{ gate: 'r3-peak' }], []).unlocked, false);
});
