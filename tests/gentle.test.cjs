// Tests for gentle return (23 Nov 2026): one shared maximum set by Ayan, evening first, nothing automatic without a maximum,
// "Done for today", increases only from tomorrow, switching off from tomorrow, a chain that never breaks on gentle days.
// All fixtures are synthetic. Run: node --test tests/gentle.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
function load(lab = {}, at = '2026-11-24T12:00:00') {
  const NOW = new Date(at).getTime();
  class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const store = { 'kg-lab-v1': JSON.stringify(lab) };
  const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  ctx.globalThis = ctx; ctx.__noCExam = true; /* the dated C exam timetable (23–26 Nov) is tested in cexam.test.cjs */ vm.runInNewContext(src, ctx); return ctx.StudyPlan;
}
const SP = load(), D = '2026-11-24', C0 = { actual14: {}, loggedAny: false, diplomaToday: 0 };
const day = (gentle, now = -1, ctx = {}, d = D) => SP.templateDay({ syl: SP.seedSyllabus(), sched: { reading: false, wake: { [d]: 720 }, gentle } }, d, new Date(d + 'T12:00:00').getDay(), now, Object.assign({}, C0, ctx));
const study = t => t.rows.filter(r => r.kind === 'study'), sum = rs => rs.reduce((n, r) => n + r.e - r.s, 0);

test('no maximum, or 0: nothing is planned automatically; picked activities are added', () => {
  assert.strictEqual(study(day({ on: true })).length, 0, 'not set');
  assert.strictEqual(study(day({ on: true, max: 0 })).length, 0, 'zero');
  const p = study(day({ on: true, max: null, day: { [D]: { picks: ['physics', 'german'] } } }));
  assert.strictEqual(JSON.stringify(p.map(r => [r.subj, r.e - r.s])), JSON.stringify([['physics', 15], ['german', 30]]));
});

test('the maximum is a cap on all study, evening and night first, with German only when chosen', () => {
  for (const m of [15, 30, 60, 90, 120]) {
    const st = study(day({ on: true, max: m }));
    assert.strictEqual(sum(st), m, m + ' min');
    assert.ok(st.every(r => r.s >= 1260 && r.e <= 1520), 'after the 8:30-9 commitment, before getting ready for bed');
    assert.ok(!st.some(r => r.subj === 'german'), 'no German unless picked');
  }
  assert.ok(study(day({ on: true, max: 120, day: { [D]: { picks: ['german'] } } })).some(r => r.subj === 'german'), 'German when picked');
  assert.strictEqual(sum(study(day({ on: true, max: 120, day: { [D]: { picks: ['german'] } } }))), 120, 'German stays inside the maximum');
});

test('a smaller day, Done for today and time already studied all shrink the day; nothing is carried over', () => {
  assert.strictEqual(sum(study(day({ on: true, max: 120, day: { [D]: { max: 45 } } }))), 45);
  assert.strictEqual(sum(study(day({ on: true, max: 120, day: { [D]: { max: 500 } } }))), 120, 'a day value can only lower the maximum');
  assert.strictEqual(study(day({ on: true, max: 120, day: { [D]: { stopped: true } } })).length, 0, 'done for today');
  const P = load({}, D + 'T19:00:00');
  const t = P.templateDay({ syl: P.seedSyllabus(), sched: { reading: false, wake: { [D]: 720 }, gentle: { on: true, max: 120 } } }, D, 2, 1140, Object.assign({}, C0, { gentleUsed: 90 }));
  assert.strictEqual(sum(study(t)), 30, '90 minutes already timed leave 30');
  assert.strictEqual(t.deferred.length, 0, 'nothing moves to tomorrow');
});

test('raising the maximum takes effect only from its start day; switching off returns the normal planner from tomorrow', () => {
  const S = { gentle: { on: true, max: 60, next: { max: 120, from: '2026-11-25' } } };
  assert.strictEqual(SP.gentleOf(S, D).cap, 60);
  assert.strictEqual(SP.gentleOf(S, '2026-11-25').cap, 120);
  const off = { on: true, max: 60, offAfter: D };
  assert.ok(SP.gentleOf({ gentle: off }, D), 'still on today');
  assert.strictEqual(SP.gentleOf({ gentle: off }, '2026-11-25'), null, 'off tomorrow');
  assert.ok(sum(study(day(off, -1, {}, '2026-11-25'))) > 120, 'normal day tomorrow');
});

test('gentle days ask nothing of the chain, now and in earlier gentle periods', () => {
  const P = load({ sched: { reading: false, gentle: { on: true, max: 60, from: '2026-11-24', past: [['2026-11-10', '2026-11-12']] } } });
  assert.strictEqual(P.need(false, '2026-11-24'), 0);
  assert.strictEqual(P.need(false, '2026-11-11'), 0, 'an earlier period');
});

test('deadline shortfalls use only your own estimates; gentle return explains instead of adding time', () => {
  const L = { astro: { lectures: [], tasks: [{ id: 'a', title: 'Quiz', due: '2026-11-27', dueOk: true, mins: 300, done: false }, { id: 'b', title: 'Essay', due: '2026-11-26', dueOk: true, done: false }] }, sched: { reading: false, astro: { min: 15 } } };
  assert.strictEqual(SP.astroConflicts(L, D).map(x => x.id).join(), 'a', 'no estimate, no shortfall');
  assert.match(html, /\(your own estimate\)/);
  assert.match(html, /Gentle return is on, so nothing is added to your days/);
});

test('the rest of the mode is wired up: limit question, review pause, companions, check-in', () => {
  assert.match(html, /Continue beyond your maximum for today\? You won't be asked again today\./);
  assert.match(html, /if \(gentle\) L\.srPause\.kind = 'gentle'/, 'reviews wait while it is on');
  assert.match(html, /L\.breakUntil && L\.srPause\.kind !== 'gentle'/, 'an old break never shifts reviews after gentle return');
  assert.match(html, /I'm using gentle return mode, my own choice and not a diagnosis/);
  assert.match(html, /!window\.StudyPlan\?\.gentleOf\?\.\(L\.sched, today\(\)\)\) openMood\(\)/, 'no automatic mood pop-up');
  assert.match(html, /window\.__kgQuiet\?\.\(t, o\)/, 'no study nudges after Done for today');
});

test('a confirmed increase can start today or tomorrow, as chosen; it is never automatic', () => {
  assert.match(html, /data-v="raisetoday">Yes, from today<\/button><button type="button" data-a="kgg" data-v="raiseyes">Yes, from tomorrow/);
  assert.match(html, /if \(v === 'raisetoday' && \(g\.ask \|\| g\.next\)\) \{ g\.max = \(g\.ask \|\| g\.next\)\.max;/);
  assert.match(html, /if \(higher\) \{ g\.ask = \{ max: m \}; return redo\(\); \}/, 'an increase always waits for a confirmation');
});
