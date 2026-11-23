// Tests for the dated C exam plan (IT23102, Thu 26 Nov 2026): it uses study time the day already has, stays inside the
// gentle-return maximum, and is gone after Thursday. All fixtures are synthetic. Run: node --test tests/cexam.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
ctx.globalThis = ctx; vm.runInNewContext(src, ctx); const SP = ctx.StudyPlan;
const C0 = { actual14: {}, loggedAny: false, diplomaToday: 0 };
const day = (d, gentle) => SP.templateDay({ syl: SP.seedSyllabus(), sched: { wake: { [d]: 720 }, gentle } }, d, new Date(d + 'T12:00:00').getDay(), -1, Object.assign({}, C0));
const study = t => t.rows.filter(r => r.kind === 'study'), sum = rs => rs.reduce((n, r) => n + r.e - r.s, 0);
const cx = t => study(t).filter(r => /^C exam/.test(r.title || ''));

test('each day of the plan takes its minutes from the gentle maximum, evening first, adding no time', () => {
  for (const [d, m] of [['2026-11-23', 90], ['2026-11-24', 180], ['2026-11-25', 180]]) {
    const t = day(d, { on: true, max: 180 });
    assert.strictEqual(sum(study(t)), 180, d + ' total unchanged');
    assert.strictEqual(sum(cx(t)), m, d + ' exam minutes');
    if (m < 180) assert.ok(cx(t).every(r => r.s >= 1260), d + ' evening first');
  }
  assert.strictEqual(sum(cx(day('2026-11-24', { on: true, max: 60 }))), 60, 'never more than the maximum');
  assert.strictEqual(cx(day('2026-11-24', { on: true })).length, 0, 'no maximum: nothing automatic');
});

test('without gentle return the exam time comes out of the normal day; total study is unchanged', () => {
  const plain = d => sum(study(SP.templateDay({ syl: SP.seedSyllabus(), sched: { wake: { [d]: 720 } } }, d, new Date(d + 'T12:00:00').getDay(), -1, Object.assign({}, C0))));
  const t = day('2026-11-24');
  assert.strictEqual(sum(cx(t)), 180);
  assert.strictEqual(sum(study(t)), plain('2026-11-24'));
});

test('exam day has no block, and from Friday the plan is gone', () => {
  assert.ok(SP.cExam('2026-11-26'), 'Thursday card');
  assert.strictEqual(cx(day('2026-11-26', { on: true, max: 180 })).length, 0, 'no block on exam day');
  assert.strictEqual(SP.cExam('2026-11-27'), null);
  assert.strictEqual(cx(day('2026-11-27', { on: true, max: 180 })).length, 0);
  assert.strictEqual(SP.cExam('2026-11-22'), null, 'and nothing before');
  assert.match(html, /const x = SP\.cExam\(day\(\)\); if \(!x\) return '';/, 'the card hides itself');
});
