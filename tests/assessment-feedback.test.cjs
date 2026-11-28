// Module assessments: pass on substance, explain every gap, never count a miss on a question that contradicted the module,
// and fact-check each new question against the module first. Run: node --test tests/assessment-feedback.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1];
const K = (() => { const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx); return ctx.window.KgCourses; })();

test('a miss on a faulty question is shown but never counted; an ordinary miss still counts', () => {
  const a = K.asmBlank(); a.cur = { id: 'q1' };
  assert.ok(K.applyGrade(a, 'q1', 'fail', { flawed: true, qissue: 'the question reversed the module' }));
  assert.strictEqual(a.fails, 0); assert.strictEqual(a.hist.length, 1); assert.strictEqual(a.tier, 'hard');
  a.cur = { id: 'q2' }; K.applyGrade(a, 'q2', 'fail', {}); assert.strictEqual(a.fails, 1);
});

test('grading passes on substance: slips alone never fail, a faulty question is judged by the module', () => {
  assert.ok(src.includes('Minor factual slips, loose wording or a small missing detail that does not break the main argument do NOT fail the answer'));
  assert.ok(src.includes('judge the learner against the module, never against the faulty wording'));
  assert.ok(src.includes('Fail only when an essential part is missing or its reasoning is wrong.'));
});

test('feedback names what was right, what a pass needs, the slips and any problem with the question', () => {
  for (const k of ['"right":', '"missing":', '"slips":', '"question_issue":']) assert.ok(src.includes(k), k);
  for (const t of ['What you got right:', 'What a pass needs:', 'Small slips to correct:', 'Problem with the question:', 'This attempt is not counted as a miss.']) assert.ok(src.includes(t), t);
});

test('each new question is checked against the module before it is shown', () => {
  assert.ok(src.includes('[question check, not typed by me]'));
  assert.ok(src.includes('reverse it (for example "with" where the material says "without")'));
  assert.ok(/if \(cj && cj\.ok === false && cj\.question && cj\.reference\) \{ o\.question = cj\.question; o\.reference = cj\.reference;/.test(src));
});

test('Mistakes: Not yet answers with the reference answer, newest first; slips from passes listed apart; nothing new is stored', () => {
  const s = { asm: {
    'astro#0:Light': { hist: [{ qid: 'a', v: 'fail', at: 1, q: 'Q1', answer: 'mine', ref: 'R1', missing: ['link the steps'] }, { qid: 'b', v: 'pass', at: 3, q: 'Q2', ref: 'R2', slips: ['Mercury day is long'] }] },
    'astro#S:': { hist: [{ qid: 'c', v: 'fail', at: 2, q: 'Q3', ref: 'R3', flawed: true }] },
    'stars#0:Sun': { hist: [{ qid: 'd', v: 'pass', at: 4, q: 'Q4', ref: 'R4' }] } } };
  const list = K.mistakesOf(s, id => id === 'astro' ? 'Astronomy' : null);
  assert.deepStrictEqual(list.map(x => x.qid).join(), 'b,c,a', 'clean passes are left out');
  assert.strictEqual(list[2].where, 'Astronomy · Light'); assert.strictEqual(list[1].where, 'Astronomy · course synthesis');
  assert.strictEqual(list[2].ref, 'R1'); assert.strictEqual(list[2].answer, 'mine');
  assert.ok(src.includes("M.SECTIONS.library.splice(1, 0, ['mistakes', '✎ Mistakes'])"));
  assert.ok(src.includes('reading these never counts as a pass or as retention'));
});
