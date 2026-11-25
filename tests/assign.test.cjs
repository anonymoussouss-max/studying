// Design §9: Iroha assigns ONE activity for the task. Stand-in replies only (synthetic); no real model is called here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ctx = { JSON, Math, Number, String, Object, Array };
ctx.globalThis = ctx; ctx.__noCExam = true;
vm.runInNewContext(scripts.find(s => s.includes('root.FlowKit = api')), ctx);
const K = ctx.FlowKit;
const base = o => Object.assign({ subj: 'Physics', topic: 'Work-energy theorem', lec: false, lecDaysAgo: null, src: '', novelty: 'seen', prereq: '', ev: { ok: 0, hint: 0, miss: 0 }, misses: 0, mins: 25, energy: 'ordinary', preset: '', exclude: [] }, o);

test('only supported activities exist, and each has a name in the session engine', () => {
  assert.deepStrictEqual([...K.ASSIGN_ACTS].sort(), ['blurt', 'compare', 'diagnose', 'explain', 'predict', 'recall', 'represent', 'solve', 'synth', 'worked']);
  for (const a of K.ASSIGN_ACTS) assert.ok(html.includes(`    ${a}: { name: '`), a);
});

test('local rules follow the design table', () => {
  assert.strictEqual(K.assignLocal(base({ novelty: 'new' })).act, 'worked');
  assert.strictEqual(K.assignLocal(base({ lec: true, lecDaysAgo: 1 })).act, 'recall');
  assert.strictEqual(K.assignLocal(base({ misses: 2 })).act, 'diagnose');
  assert.strictEqual(K.assignLocal(base({ topic: 'Mass vs weight' })).act, 'compare');
  assert.strictEqual(K.assignLocal(base({ topic: 'Velocity-time graph' })).act, 'represent');
  assert.strictEqual(K.assignLocal(base({ topic: 'Predict the effect of doubling mass' })).act, 'predict');
  assert.strictEqual(K.assignLocal(base({ ev: { ok: 3 }, energy: 'demanding' })).act, 'synth');
  assert.strictEqual(K.assignLocal(base({ energy: 'lighter' })).act, 'blurt');
  assert.strictEqual(K.assignLocal(base({ ev: { ok: 0, hint: 2 } })).act, 'solve');
});

test('every assignment carries a one-sentence reason and a first instruction', () => {
  for (const a of K.ASSIGN_ACTS) {
    const r = K.assignLocal(base({ preset: a, misses: 1, ev: { ok: 2 } }));
    assert.strictEqual(r.act, a); assert.strictEqual(r.by, 'you');
    assert.ok(r.why.length > 20 && r.first.length > 15, a);
    assert.ok((r.why.match(/[.!?](\s|$)/g) || []).length === 1, `one sentence: ${a}`);
  }
});

test('unknown prerequisites: one short diagnostic question first, then a choice', () => {
  assert.match(K.assignQuestion(base({ novelty: 'unsure' })), /without notes/);
  assert.strictEqual(K.assignQuestion(base({ novelty: 'unsure', prereq: 'no' })), '');
  assert.strictEqual(K.assignQuestion(base({ novelty: 'unsure', ev: { ok: 1 } })), '');
  assert.strictEqual(K.assignQuestion(base({ novelty: 'seen' })), '');
  assert.strictEqual(K.assignLocal(base({ novelty: 'unsure', prereq: 'no' })).act, 'worked');
});

test('requirements: no diagnose without a saved mistake, no transfer without independent evidence, no recall of new material', () => {
  assert.strictEqual(K.assignAllowed('diagnose', base()), false);
  assert.strictEqual(K.assignAllowed('synth', base()), false);
  assert.strictEqual(K.assignAllowed('recall', base({ novelty: 'new' })), false);
  assert.strictEqual(K.assignAllowed('blurt', base({ prereq: 'no' })), false);
  assert.strictEqual(K.assignAllowed('memorise', base()), false);
});

test('stand-in model reply: a valid pick is used, labelled as Iroha\'s', () => {
  const r = K.assignParse('Sure!\n{"act":"compare","why":"You mix up these two ideas.","first":"Name both ideas."}', base());
  assert.deepStrictEqual({ ...r }, { act: 'compare', why: 'You mix up these two ideas.', first: 'Name both ideas.', by: 'iroha' });
});

test('stand-in model reply: unsupported or unmet picks are rejected (caller falls back locally)', () => {
  assert.strictEqual(K.assignParse('{"act":"flashcards","why":"x","first":"y"}', base()), null);
  assert.strictEqual(K.assignParse('{"act":"diagnose","why":"x","first":"y"}', base()), null);
  assert.strictEqual(K.assignParse('{"act":"synth","why":"x","first":"y"}', base()), null);
  assert.strictEqual(K.assignParse('not json at all', base()), null);
  assert.strictEqual(K.assignParse('', base()), null);
  const p = K.assignPrompt(base());
  assert.ok(!/\bdiagnose\b, /.test(p.split('\n')[1]) && /Allowed act values: [^\n]*solve/.test(p));
});

test('missing reason or instruction from the model is filled from the local wording', () => {
  const r = K.assignParse('{"act":"solve"}', base());
  assert.strictEqual(r.act, 'solve'); assert.ok(r.why && r.first);
});

test('a late reply never replaces a started session or a newer request', () => {
  const res = { act: 'solve', why: 'w', first: 'f', by: 'iroha' };
  const asking = () => ({ step: 'goal', assign: { status: 'asking', tok: 't1' } });
  let f = asking(); assert.strictEqual(K.assignApply(f, res, 't1'), true); assert.strictEqual(f.assign.act, 'solve'); assert.strictEqual(f.assign.status, 'ready');
  f = asking(); assert.strictEqual(K.assignApply(f, res, 'old'), false); assert.strictEqual(f.assign.status, 'asking');
  f = asking(); f.step = 'attempt'; assert.strictEqual(K.assignApply(f, res, 't1'), false);
  f = { step: 'goal', assign: { status: 'ready', act: 'recall', tok: 't1' } }; assert.strictEqual(K.assignApply(f, res, 't1'), false); assert.strictEqual(f.assign.act, 'recall');
  f = { step: 'goal', assign: null }; assert.strictEqual(K.assignApply(f, res, 't1'), false);
});

test('make this easier steps down and stays within the requirements', () => {
  assert.strictEqual(K.assignEasier({ act: 'synth', by: 'iroha' }, base({ ev: { ok: 2 } })).act, 'solve');
  assert.strictEqual(K.assignEasier({ act: 'solve', by: 'iroha' }, base()).act, 'worked');
  const r = K.assignEasier({ act: 'explain', by: 'iroha' }, base({ novelty: 'new' }));
  assert.strictEqual(r.act, 'worked'); assert.match(r.why, /^A smaller step/); assert.strictEqual(r.easier, 1);
});

test('this does not fit: the excluded activity is never offered again', () => {
  const c = base({ novelty: 'new', exclude: ['worked'] });
  assert.notStrictEqual(K.assignLocal(c).act, 'worked');
  assert.notStrictEqual(K.assignLocal(base({ preset: 'recall', exclude: ['recall'] })).act, 'recall');
});

test('the session page: no technique grid at start; card has Start, Make this easier, This does not fit and Help', () => {
  const s = /<script id="kg-session-script">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new Function(s)); // parses
  assert.ok(!/Pick how you'll practise/.test(html));
  for (const t of ['data-a="flowassignstart">Start<', '>Make this easier<', '>This does not fit<', 'Help: what do the method names mean?', 'Local choice: Iroha couldn']) assert.ok(html.includes(t), t);
});
