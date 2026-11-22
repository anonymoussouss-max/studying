const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ctx = { JSON, Math, Number, String, Object, Array };
ctx.globalThis = ctx;
vm.runInNewContext(scripts.find(s => s.includes('root.FlowKit=api') || s.includes('root.FlowKit = api')), ctx);
const K = ctx.FlowKit;

test('worked example: a separate Problem box stays whole, however many lines it has', () => {
  const x = K.exSplit('A ball is thrown at 20 m/s\nat 30 degrees. Find the range.', 'ux = 17.3\nuy = 10\nT = 2.04 s\nR = 35.3 m');
  assert.strictEqual(x.problem, 'A ball is thrown at 20 m/s\nat 30 degrees. Find the range.');
  assert.deepStrictEqual([...x.steps], ['ux = 17.3', 'uy = 10', 'T = 2.04 s', 'R = 35.3 m']);
});

test('worked example: without a Problem box, the first line is the problem (older drafts)', () => {
  const x = K.exSplit('', 'Find the range.\n\nux = 17.3\nR = 35.3 m');
  assert.strictEqual(x.problem, 'Find the range.');
  assert.deepStrictEqual([...x.steps], ['ux = 17.3', 'R = 35.3 m']);
});

test('fading hides the last steps first: a third, then two thirds; never with fewer than 2 steps', () => {
  assert.deepStrictEqual([...K.fadeHide(4, 1)], [3]);
  assert.deepStrictEqual([...K.fadeHide(4, 2)], [1, 2, 3]);
  assert.deepStrictEqual([...K.fadeHide(9, 1)], [6, 7, 8]);
  assert.deepStrictEqual([...K.fadeHide(9, 2)], [3, 4, 5, 6, 7, 8]);
  assert.deepStrictEqual([...K.fadeHide(1, 1)], []);
  assert.deepStrictEqual([...K.fadeHide(5, 0)], []);
  for (let n = 2; n <= 20; n++) assert.ok(K.fadeHide(n, 2).length > K.fadeHide(n, 1).length || K.fadeHide(n, 1).length === n);
});

test('a check covers the answer and the method: editing either one makes an in-flight reply stale', () => {
  const f = { id: 'a', act: 'solve', attempt: 'v = 6.3', mPrin: 'energy', mWhy: 'smooth', mAlt: 'momentum' };
  const k = K.checkKey(f);
  assert.strictEqual(K.checkKey({ ...f }), k);
  for (const [field, v] of [['attempt', 'v = 9'], ['mPrin', 'momentum'], ['mWhy', 'x'], ['mAlt', 'y'], ['exProb', 'new problem'], ['example', 'z']]) assert.notStrictEqual(K.checkKey({ ...f, [field]: v }), k, field);
});

test('Method first reaches the check only when a principle is written, and asks for the cue', () => {
  assert.deepStrictEqual({ ...K.methodNote({ mPrin: '  ' }) }, { given: '', ask: '' });
  const m = K.methodNote({ mPrin: 'conservation of energy', mAlt: 'momentum: gravity is external' });
  assert.match(m.given, /Principle: conservation of energy/);
  assert.match(m.given, /Why it applies: \(not given\)/);
  assert.match(m.given, /momentum: gravity is external/);
  assert.match(m.ask, /name the cue/);
});

test('the session record keeps the whole fresh problem: question, answer, feedback, checked', () => {
  const r = K.freshRecord({ freshQ: 'A 2 kg block on a 3 m high ramp', freshA: 'v = 9.9 m/s', freshFb: 'Not yet: h is the height', freshOk: false });
  assert.deepStrictEqual({ ...r }, { q: 'A 2 kg block on a 3 m high ramp', a: 'v = 9.9 m/s', fb: 'Not yet: h is the height', checked: true, ok: false });
  assert.strictEqual(K.freshRecord({ freshQ: '' }), null);
  assert.strictEqual(K.freshRecord({ freshQ: 'q', freshA: 'a' }).checked, false);
});

test('a failed fresh problem becomes its own mistake, with my working, linked to the skill and the repair', () => {
  const f = { id: 'flow1', topic: 'Energy on ramps', skillId: 'sk1', fix: 'use vertical height', freshQ: 'A 2 kg block on a 3 m high ramp', freshA: 'v = 9.9', freshFb: 'Not yet: h is the height', freshOk: false };
  const m = K.freshMistake(f, '2026-11-23', 'work-energy', '2026-11-24');
  assert.match(m.q, /A 2 kg block on a 3 m high ramp/);
  assert.strictEqual(m.mine, 'v = 9.9');
  assert.strictEqual(m.why, 'Not yet: h is the height');
  assert.strictEqual(m.sk, 'sk1'); assert.strictEqual(m.parent, 'flow1'); assert.strictEqual(m.src, 'fresh'); assert.strictEqual(m.due, '2026-11-24');
  assert.strictEqual(K.freshMistake({ ...f, freshOk: true }, '2026-11-23', '', ''), null, 'solved: nothing to revisit');
  assert.strictEqual(K.freshMistake({ ...f, freshFb: '' }, '2026-11-23', '', ''), null, 'unchecked: not a known mistake');
});

test('older session records keep a short fresh summary; the newest 30 keep everything', () => {
  const log = Array.from({ length: 35 }, (_, i) => ({ id: i, fresh: { q: 'q'.repeat(800), a: 'answer', fb: 'feedback', checked: true, ok: i % 2 === 0 } }));
  const t = K.trimLog(log);
  assert.strictEqual(t.length, 35);
  assert.strictEqual(t[0].fresh.a, undefined); assert.strictEqual(t[0].fresh.q.length, 300); assert.strictEqual(t[0].fresh.ok, true);
  assert.strictEqual(t[34].fresh.a, 'answer'); assert.strictEqual(t[34].fresh.q.length, 800);
});

test('a draft reloaded mid-check is usable again and keeps the work', () => {
  const r = K.restore({ busy: 'iroha', attempt: 'my working', freshA: 'half done', fadeAns: null, fadeLvl: '2' });
  assert.strictEqual(r.busy, ''); assert.strictEqual(r.attempt, 'my working'); assert.strictEqual(r.freshA, 'half done');
  assert.deepStrictEqual({ ...r.fadeAns }, {}); assert.strictEqual(r.fadeLvl, 2); assert.strictEqual(r.requireVerification, true);
});

test('a whole session is kept to reopen, and the newest 30 keep it; older ones drop the working', () => {
  const w = K.workRecord({ exProb: 'Find v', attempt: 'v = 6.3', fb: 'Right: yes', repair: '', rfb: '' });
  assert.strictEqual(w.attempt, 'v = 6.3'); assert.strictEqual(w.prob, 'Find v');
  assert.strictEqual(K.workRecord({}), null);
  const log = Array.from({ length: 32 }, (_, i) => ({ id: i, work: { attempt: 'w' + i } }));
  const t = K.trimLog(log);
  assert.strictEqual(t[0].work, undefined); assert.strictEqual(t[31].work.attempt, 'w31');
});

test('did the fix stick: a repaired gap becomes a later, different problem; an unrepaired one does not', () => {
  const f = { id: 'f1', topic: 'Energy', gap: 'used ramp length', fixed: true, skillId: 'sk1', fix: 'use height', errType: 'principle' };
  const s = K.stickItem(f, '2026-11-23', 'work-energy', '2026-11-26');
  assert.match(s.q, /Did the fix stick\? A different problem on Energy: used ramp length/);
  assert.strictEqual(s.src, 'stick'); assert.strictEqual(s.due, '2026-11-26'); assert.strictEqual(s.sk, 'sk1'); assert.strictEqual(s.ok, false);
  assert.strictEqual(K.stickItem({ ...f, fixed: false }, '2026-11-23', '', ''), null);
});

test('the problem bank prefers the same skill, skips problems used in the last 7 days, oldest use first', () => {
  const bank = [
    { id: 'a', q: 'Ramp, 3 m high', sk: 'sk1', subj: 'Physics', lastUsed: '2026-11-20' },
    { id: 'b', q: 'Ramp, 5 m high', sk: 'sk1', subj: 'Physics', lastUsed: '2026-11-01' },
    { id: 'c', q: 'Pendulum energy', sk: 'sk2', subj: 'Physics', topic: 'energy', lastUsed: '' }
  ];
  assert.strictEqual(K.bankPick(bank, { sk: 'sk1' }, '2026-11-23').id, 'b');
  assert.strictEqual(K.bankPick(bank.filter(b => b.id !== 'b'), { sk: 'sk1', subj: 'Physics', topic: 'energy loss' }, '2026-11-23').id, 'c', 'falls back to subject and topic');
  assert.strictEqual(K.bankPick([], { sk: 'sk1' }, '2026-11-23'), null);
});

test('contrast and own checks reach Iroha only when written', () => {
  const m = K.methodNote({ mPrin: 'energy', mCond: 'a collision: momentum', cUnits: 'm/s ok', cLim: 'h=0 gives 0' });
  assert.match(m.given, /What would make the alternative the right method: a collision: momentum/);
  assert.match(m.given, /Units: m\/s ok/); assert.match(m.given, /Limiting case: h=0 gives 0/);
  assert.match(m.ask, /condition for the alternative/); assert.match(m.ask, /own checks are valid/);
  const c = K.methodNote({ cAss: 'no friction' });
  assert.match(c.given, /Assumptions: no friction/); assert.doesNotMatch(c.given, /method choice/);
  assert.notStrictEqual(K.checkKey({ cLim: 'a' }), K.checkKey({ cLim: 'b' }));
});

test('confidently wrong: sure answers that still had a gap, in the last 14 days', () => {
  const log = [{ d: '2026-11-20', conf: 'sure', gap: 'sign', topic: 'A' }, { d: '2026-11-20', conf: 'sure', gap: '', topic: 'B' }, { d: '2026-11-20', conf: 'unsure', gap: 'x', topic: 'C' }, { d: '2026-10-01', conf: 'sure', gap: 'y', topic: 'D' }];
  assert.deepStrictEqual(K.confWrong(log, '2026-11-23').map(r => r.topic), ['A']);
});

test('merging a duplicate skill keeps both histories under the kept one', () => {
  const skills = [{ id: 'a', name: 'Energy on ramps', lectures: ['l1'], lastTested: '2026-11-20', last: 'ok', strength: 'solid' }, { id: 'b', name: 'Work-energy theorem', lectures: ['l2'], lastTested: '2026-11-10', last: 'miss', strength: 'shaky' }];
  const m = K.mergeSkills(skills, 'a', 'b');
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].id, 'b'); assert.strictEqual(m[0].name, 'Work-energy theorem');
  assert.deepStrictEqual([...m[0].lectures], ['l2', 'l1']); assert.strictEqual(m[0].lastTested, '2026-11-20'); assert.strictEqual(m[0].strength, 'solid');
  assert.deepStrictEqual([...m[0].aliases], ['a']);
  assert.strictEqual(K.mergeSkills(skills, 'a', 'a'), skills);
});

test('follow-ups only take a bank problem tagged with the exact skill; set-aside problems are never picked', () => {
  const bank = [{ id: 'm', q: 'A ball rolls off a ramp: find the momentum', sk: 'momentum', subj: 'Physics' }, { id: 'e', q: 'Energy at the bottom of a ramp', sk: 'energy', subj: 'Physics', quarantined: true }];
  assert.strictEqual(K.bankPick(bank, { sk: 'energy', subj: 'Physics', topic: 'energy on a ramp', exact: true }, '2026-11-23'), null, 'no topic-word guess across skills');
  assert.strictEqual(K.bankPick(bank, { sk: 'energy', subj: 'Physics', topic: 'energy on a ramp' }, '2026-11-23').id, 'm', 'the loose pick still exists for non-follow-up use');
  assert.strictEqual(K.bankPick([{ ...bank[1], quarantined: false }], { sk: 'energy', exact: true }, '2026-11-23').id, 'e');
});

test('end to end: save a repaired gap, open the follow-up 3 days later, get a different exact-skill problem, record the result', () => {
  const f = { id: 's1', topic: 'Energy on ramps', gap: 'wrong energy sign', fixed: true, skillId: 'energy', fix: 'gain in KE = loss in PE', errType: 'principle' };
  const item = { id: 'x1', ...K.stickItem(f, '2026-11-23', 'work-energy', '2026-11-26') };
  assert.strictEqual(item.due, '2026-11-26'); assert.strictEqual(item.topic, 'Energy on ramps'); assert.strictEqual(item.gap, 'wrong energy sign');
  const bank = [{ id: 'other', q: 'Momentum on a ramp', sk: 'momentum' }, { id: 'p1', q: 'A 2 kg block on a 3 m smooth ramp: speed at the bottom?', sk: 'energy', ans: '7.7 m/s', src: 'HCV 8.14' }];
  const start = K.stickStart(item, bank, '2026-11-26');
  assert.strictEqual(start.act, 'solve'); assert.strictEqual(start.stick, true); assert.strictEqual(start.skillId, 'energy');
  assert.strictEqual(start.probBank, 'p1'); assert.match(start.probQ, /3 m smooth ramp/); assert.strictEqual(start.topic, 'Energy on ramps');
  const none = K.stickStart(item, [bank[0]], '2026-11-26');
  assert.strictEqual(none.probQ, ''); assert.strictEqual(none.probBank, '', 'no exact problem: Iroha writes one instead');
  const rec = { id: 's2', d: '2026-11-26', skillId: 'energy', act: 'solve', stick: true, gap: '', ev: 'indep', work: K.workRecord({ attempt: 'v = 7.7 m/s' }) };
  const t = K.skillTrail(['energy'], [{ id: 's1', d: '2026-11-23', skillId: 'energy', act: 'solve', gap: 'wrong energy sign', fixed: true }, rec], [item]);
  assert.strictEqual(t.repaired, true); assert.strictEqual(t.recurred, 0);
  assert.ok(t.events.some(e => /follow-up booked for 2026-11-26/.test(e.t)));
});

test('a skill trail counts the difficulty coming back after a repair', () => {
  const log = [{ d: '2026-11-01', skillId: 'a', act: 'solve', gap: 'sign', fixed: true }, { d: '2026-11-05', skillId: 'a', act: 'solve', gap: 'sign again' }, { d: '2026-11-09', skillId: 'b', act: 'solve', gap: 'x' }, { d: '2026-11-10', skillId: 'old', act: 'solve', gap: 'via alias' }];
  const t = K.skillTrail(['a', 'old'], log, []);
  assert.strictEqual(t.recurred, 2); assert.strictEqual(t.events.length, 3);
});

test('pinned sessions keep their full working past the newest 30', () => {
  const log = Array.from({ length: 33 }, (_, i) => ({ id: i, pinned: i === 0, work: { attempt: 'w' + i } }));
  const t = K.trimLog(log);
  assert.strictEqual(t[0].work.attempt, 'w0'); assert.strictEqual(t[1].work, undefined);
});

test('synthesis pairs two skills already shown, from different chapters when possible', () => {
  const s = [{ id: 'v', name: 'vectors', subj: 'Physics', ch: 'kin', last: 'ok', lastTested: '2026-11-01' }, { id: 'k', name: 'kinematics', subj: 'Physics', ch: 'kin', strength: 'solid', lastTested: '2026-11-02' }, { id: 'e', name: 'energy', subj: 'Physics', ch: 'wep', last: 'ok', lastTested: '2026-11-05' }, { id: 'n', name: 'new', subj: 'Physics', strength: 'new' }];
  assert.deepStrictEqual([...K.synthPair(s, 'Physics')].map(x => x.id), ['v', 'e']);
  assert.strictEqual(K.synthPair([s[3]], 'Physics').length, 0);
});
