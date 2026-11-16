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
