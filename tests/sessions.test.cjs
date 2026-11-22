// Tests for own sessions (open-ended, "Other stuff", exam sessions without recall) in HabitCore (index.html).
// Run: node --test tests/sessions.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
ctx.globalThis = ctx;
vm.runInNewContext(scripts.find(s => s.includes('root.StudyPlan=api')), ctx);
vm.runInNewContext(scripts.find(s => s.includes('root.HabitCore=api')), ctx);
const C = ctx.HabitCore, D = '2026-11-20';
const active = o => ({ id: 'a1', date: D, task: 'Build circuit', topic: 'Project', subject: 'Maths', kind: 'study', hard: false, comeback: false, accruedMs: 0, targetMs: 600 * 60000, lastStart: 0, running: false, phase: 'closeout', checkpoints: [], ...o });
const done = { win: 'Finished it', mood: 'calm', attempts: '0', correct: '0', next: 'Next thing' };

test('an exam session saves without recall', () => {
  const s = C.complete({ sessions: [] }, active({ accruedMs: 50 * 60000, noRecall: true }), { ...done, recall: [undefined, undefined, undefined] });
  assert.strictEqual(s.minutes, 50);
});

test('a normal session still needs three recalls', () => {
  assert.throws(() => C.complete({ sessions: [] }, active({ accruedMs: 50 * 60000 }), { ...done, recall: ['', '', ''] }), /recall/);
});

test('only the minutes actually spent count, however long the session was meant to be', () => {
  const s = C.complete({ sessions: [] }, active({ accruedMs: 37 * 60000, noRecall: true }), { ...done, recall: [] });
  assert.strictEqual(s.minutes, 37);
});

test('a long own session (up to 10 h) with "Other stuff" and no particular style is valid', () => {
  const s = C.complete({ sessions: [] }, active({ subject: 'Other', kind: 'study', accruedMs: 400 * 60000, noRecall: true }), { ...done, recall: [] });
  const h = { ...JSON.parse(JSON.stringify(C.normalize(null))), sessions: [s] };
  assert.strictEqual(C.normalize(h).sessions.length, 1);
});

test('"Other stuff" minutes do not count toward the study day', () => {
  const s = C.complete({ sessions: [] }, active({ subject: 'Other', accruedMs: 90 * 60000, noRecall: true }), { ...done, recall: [] });
  assert.strictEqual(C.minutes({ sessions: [s] }, {}, D), 0);
});

// ---- the chain: rest days keep it but do not add a day ----
const studied = dates => ({ sessions: dates.map(d => ({ date: d, minutes: 500, subject: "Maths" })), rests: [] });
test("a rest day keeps the chain without adding a day", () => {
  const h = studied(["2026-11-10", "2026-11-12", "2026-11-13"]); h.rests = ["2026-11-11"];
  assert.strictEqual(C.history(h, {}, "2026-11-13").chain, 3);
});
test("the chain was reset to 3 on 21 Nov 2026 and grows from there", () => {
  const h = studied(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
  assert.strictEqual(C.history(h, {}, "2026-11-21").chain, 3);
  h.sessions.push({ date: "2026-11-23", minutes: 500, subject: "Maths" });
  // Mon 23 Nov has an 8 h plan; Sun 22 Nov is a rest day in between and adds nothing
  assert.strictEqual(withPlan({ "2026-11-22": 0, "2026-11-23": 8 }).history(h, {}, "2026-11-23").chain, 4);
});

test("a planned rest day (0 study minutes planned) keeps the chain without adding a day", () => {
  const store = { "kg-lab-v1": JSON.stringify({ planLog: { "2026-11-11": 0 } }) };
  const c2 = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem() {} } };
  c2.globalThis = c2;
  vm.runInNewContext(scripts.find(x => x.includes("root.StudyPlan=api")), c2);
  vm.runInNewContext(scripts.find(x => x.includes("root.HabitCore=api")), c2);
  const hist = studied(["2026-11-10", "2026-11-12"]);
  assert.strictEqual(c2.HabitCore.history(hist, {}, "2026-11-12").chain, 2);
  assert.strictEqual(c2.HabitCore.history(hist, {}, "2026-11-12").statuses["2026-11-11"], "rest");
});
test("a rest day right after the 21 Nov reset leaves the chain at 3", () => {
  const store = { "kg-lab-v1": JSON.stringify({ planLog: { "2026-11-22": 0 } }) };
  const c2 = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem() {} } };
  c2.globalThis = c2;
  vm.runInNewContext(scripts.find(x => x.includes("root.StudyPlan=api")), c2);
  vm.runInNewContext(scripts.find(x => x.includes("root.HabitCore=api")), c2);
  const hist = studied(["2026-11-20", "2026-11-21"]);
  assert.strictEqual(c2.HabitCore.history(hist, {}, "2026-11-22").chain, 3);
});
function withPlan(planLog) {
  const store = { "kg-lab-v1": JSON.stringify({ planLog }) };
  const c2 = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem(k, v) { store[k] = v; } } };
  c2.globalThis = c2;
  vm.runInNewContext(scripts.find(x => x.includes("root.StudyPlan=api")), c2);
  vm.runInNewContext(scripts.find(x => x.includes("root.HabitCore=api")), c2);
  return c2.HabitCore;
}
