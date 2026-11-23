// Tests for the skill-based retention logic in index.html (StudyPlan script).
// Run: node --test tests/
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');

const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => '{}', setItem() {} } };
ctx.globalThis = ctx; ctx.__noCExam = true; /* the dated C exam timetable (23–26 Nov) is tested in cexam.test.cjs */ vm.runInNewContext(src, ctx);
const P = ctx.StudyPlan, J = x => JSON.parse(JSON.stringify(x));
const TODAY = '2026-11-20';
const sk = (o) => ({ id: o.id, name: o.id, subj: 'Maths', ch: '', lectures: [], made: '2026-11-01', lastTested: null, last: null, strength: 'solid', ...o });

test('migration: one skill per lecture, named after its topic, history kept', () => {
  const lec = [{ id: 'l1', topic: 'Log inequalities', subj: 'Maths', ch: 'logs', made: '2026-11-10', stage: 1, lastGraded: '2026-11-12' }];
  const out = J(P.skillsFromLectures(lec, []));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].name, 'Log inequalities');
  assert.strictEqual(out[0].lastTested, '2026-11-12');
  assert.deepStrictEqual(out[0].lectures, ['l1']);
});

test('migration twice changes nothing', () => {
  const lec = [{ id: 'l1', topic: 'A', made: '2026-11-10' }, { id: 'l2', topic: 'B', made: '2026-11-11' }];
  const once = P.skillsFromLectures(lec, []);
  assert.strictEqual(JSON.stringify(P.skillsFromLectures(lec, once)), JSON.stringify(once));
});

test('a lecture already linked to a named skill gets no extra topic skill', () => {
  const out = P.skillsFromLectures([{ id: 'l1', topic: 'A', made: '2026-11-10' }], [sk({ id: 'custom', lectures: ['l1'] })]);
  assert.strictEqual(out.length, 1);
});

test('mix picks shaky skills first, then the longest untested solid ones', () => {
  const skills = [sk({ id: 'solid-old', lastTested: '2026-10-01' }), sk({ id: 'solid-new', lastTested: '2026-11-05' }), sk({ id: 'shaky', strength: 'shaky', lastTested: '2026-11-18' })];
  assert.deepStrictEqual(J(P.pickMix(skills, 'Maths', TODAY)).map(s => s.id), ['shaky', 'solid-old', 'solid-new']);
});

test('a skill solved unaided in the last 7 days is not picked again', () => {
  const skills = [sk({ id: 'fresh', last: 'ok', lastTested: '2026-11-15' }), sk({ id: 'due', last: 'ok', lastTested: '2026-11-12' })];
  assert.deepStrictEqual(J(P.pickMix(skills, 'Maths', TODAY)).map(s => s.id), ['due']);
});

test('a skill made today is not mixed in yet', () => {
  assert.strictEqual(P.pickMix([sk({ id: 'today', made: TODAY })], 'Maths', TODAY).length, 0);
});

test('older material shares one daily allowance across blocks, never more than it', () => {
  assert.deepStrictEqual(P.mixAllot(3, 15), [5, 5, 5]);
  assert.deepStrictEqual(P.mixAllot(3, 20), [10, 5, 5]);
  assert.deepStrictEqual(P.mixAllot(4, 10), [5, 5, 0, 0]);
  assert.deepStrictEqual(P.mixAllot(3, 0), [0, 0, 0]);
  for (const [n, left] of [[2, 20], [5, 15], [6, 10]]) assert.ok(P.mixAllot(n, left).reduce((a, b) => a + b, 0) <= left);
});

test('recall queue never shows more than 3 items, knowledge gaps first', () => {
  const att = [1, 2, 3, 4, 5].map(i => ({ ok: false, due: '2026-11-1' + i, cause: i === 5 ? 'knowledge gap' : 'careless slip' }));
  const out = J(P.recallToday(att, TODAY));
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].cause, 'knowledge gap');
});

test('an unaided success makes a skill solid; a hint makes it shaky', () => {
  assert.strictEqual(P.recordAttempt(sk({ strength: 'shaky' }), 'ok', TODAY).strength, 'solid');
  assert.strictEqual(P.recordAttempt(sk({}), 'hint', TODAY).strength, 'shaky');
});

test('credit goes to the lecture\'s own skill when the attempt names a lecture', () => {
  const skills = [sk({ id: 'parts', ch: 'int', lectures: ['l1'] }), sk({ id: 'subst', ch: 'int', lectures: ['l2'] })];
  assert.strictEqual(P.creditTarget(skills, { ch: 'int', lec: 'l2' }), 'subst');
});

test('a chapter tick with several skills credits none, rather than guessing', () => {
  const skills = [sk({ id: 'parts', ch: 'int' }), sk({ id: 'subst', ch: 'int' })];
  assert.strictEqual(P.creditTarget(skills, { ch: 'int' }), null);
});

test('a chapter tick credits the chapter\'s only skill', () => {
  assert.strictEqual(P.creditTarget([sk({ id: 'only', ch: 'int' }), sk({ id: 'other', ch: 'vec' })], { ch: 'int' }), 'only');
});

test('a skill recorded today is not shown again today, whatever the result', () => {
  assert.strictEqual(P.pickMix([sk({ id: 'h', strength: 'shaky', last: 'hint', lastTested: TODAY })], 'Maths', TODAY).length, 0);
});

test('rest after unaided successes grows: 7, 14, 28 days, capped at 56', () => {
  let s = sk({});
  const rests = [];
  for (let i = 0; i < 5; i++) { s = P.recordAttempt(s, 'ok', TODAY); rests.push(P.restDays(s)); }
  assert.deepStrictEqual(J(rests), [7, 14, 28, 56, 56]);
  assert.strictEqual(P.restDays(P.recordAttempt(s, 'hint', TODAY)), 0);
});
