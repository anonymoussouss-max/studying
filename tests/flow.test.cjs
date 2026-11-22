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
