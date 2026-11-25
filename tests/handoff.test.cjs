// Agreed design (handoff 25 Nov): the weekly six-to-eight-hour review, Sunday's 60 + 30, and Iroha's tutoring rules.
// Synthetic dates and reports only. Run: node --test tests/handoff.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
ctx.globalThis = ctx; vm.runInNewContext(src, ctx); const SP = ctx.StudyPlan;
const FROM = '2026-12-01', add = (d, k) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + k); return x.toISOString().slice(0, 10); };
const R = (reports, o = {}) => Object.assign({ from: FROM, reports }, o), yes = { feel: 'yes' }, ready = { feel: 'yes', ready8: true };
const C0 = { actual14: {}, loggedAny: false, diplomaToday: 0 };
const studyMin = (S, d) => SP.templateDay({ syl: SP.seedSyllabus(), sched: Object.assign({ wake: { [d]: 720 } }, S) }, d, new Date(d + 'T12:00:00').getDay(), -1, C0)
  .rows.filter(r => r.kind === 'study').reduce((n, r) => n + r.e - r.s, 0);

test('no pass before day 28, or with a Mixed, No or missing week; a correct pass after four Yes and readiness', () => {
  const four = { 0: yes, 1: yes, 2: yes, 3: ready };
  assert.strictEqual(SP.reviewOf(R(four), add(FROM, 27)).pass, false, 'day 27: not yet');
  assert.strictEqual(SP.reviewOf(R(four), add(FROM, 28)).pass, true, 'day 28 with four Yes and ready');
  for (const k of [0, 1, 2, 3]) {
    assert.strictEqual(SP.reviewOf(R(Object.assign({}, four, { [k]: Object.assign({}, four[k], { feel: 'mixed' }) })), add(FROM, 28)).pass, false, 'Mixed in week ' + (k + 1));
    assert.strictEqual(SP.reviewOf(R(Object.assign({}, four, { [k]: Object.assign({}, four[k], { feel: 'no' }) })), add(FROM, 28)).pass, false, 'No in week ' + (k + 1));
    const miss = Object.assign({}, four); delete miss[k]; assert.strictEqual(SP.reviewOf(R(miss), add(FROM, 30)).pass, false, 'missing week ' + (k + 1));
  }
  assert.strictEqual(SP.reviewOf(R({ 0: yes, 1: yes, 2: yes, 3: yes }), add(FROM, 30)).pass, false, 'all Yes but not ready: pending');
  assert.strictEqual(SP.reviewOf(R(four, { paused: add(FROM, 28) }), add(FROM, 28)).pass, false, 'paused: no progression');
});

test('recent weeks count, not four good ones across a gap; reports only in the following seven days', () => {
  const old = { 0: yes, 1: yes, 2: yes, 3: ready, 4: { feel: 'no' } };
  assert.strictEqual(SP.reviewOf(R(old), add(FROM, 35)).pass, false, 'a later No blocks');
  const r = SP.reviewOf(R({ 0: yes }), add(FROM, 20));
  assert.strictEqual(r.due, 1, 'only last week can be reported; week 1 already done, week 3 not finished');
  assert.strictEqual(SP.reviewOf(R({}), add(FROM, 20)).due, 1, 'missing week 1 stays missing');
  assert.strictEqual(SP.reviewOf(R({ 0: yes, 1: yes, 2: yes }), add(FROM, 29)).askReady, true, 'readiness asked once eligible');
  assert.strictEqual(SP.reviewOf(R({ 0: yes }), add(FROM, 15)).askReady, false, 'not before');
});

test('day 112 never forces a pass; a pass is recorded once and starts the next day', () => {
  const r = SP.reviewOf(R({}), add(FROM, 112)); assert.strictEqual(r.pass, false); assert.strictEqual(r.at112, true);
  const S = { review: R({ 0: yes, 1: yes, 2: yes, 3: ready }) }, d = add(FROM, 29);
  assert.strictEqual(SP.reviewSettle(S, d), true); const first = JSON.stringify(S.allow8);
  assert.strictEqual(SP.reviewSettle(S, add(d, 3)), false, 'reload or retry changes nothing'); assert.strictEqual(JSON.stringify(S.allow8), first);
  assert.strictEqual(S.allow8.from, add(d, 1));
  assert.strictEqual(SP.dayHours(S, d), 0, 'not today'); assert.strictEqual(SP.dayHours(S, add(d, 1)), 8, 'from the next study day');
  assert.strictEqual(SP.dayHours(Object.assign({ hours: { [add(d, 2)]: 4 } }, S), add(d, 2)), 4, "a day's own choice still wins");
});

test('eight hours never overrides Gentle Return, Done for today or Sunday', () => {
  const D = '2027-01-12', allow8 = { from: '2027-01-01' };
  assert.ok(studyMin({ allow8 }, D) > studyMin({}, D), 'eight-hour day is longer than the six-hour normal');
  assert.strictEqual(studyMin({ allow8, gentle: { on: true, max: 60 } }, D) <= 60, true, 'gentle cap wins');
  assert.strictEqual(studyMin({ allow8, gentle: { on: true, max: 180, day: { [D]: { stopped: true } } } }, D), 0, 'Done wins');
  assert.strictEqual(studyMin({ allow8 }, '2027-01-10'), 90, 'Sunday stays 60 + 30');
  assert.ok(studyMin({ allow8 }, D) <= 480, 'never more than eight hours');
});

test('the check-in card states what it checked, and the old step-up advice is gone', () => {
  assert.match(html, /a planning review, not medical clearance, and it can\\'t predict whether burnout comes back/);
  assert.match(html, /if \(window\.StudyPlan\?\.reviewOf\) return null;/);
  assert.match(html, /if \(R\.reports\[r\.due\]\) return; \/\/ one answer per week, never overwritten/);
});

test("Iroha's tutoring rules: assess first, clarify ambiguity, small hint first, offer before revealing, one reasoning check", () => {
  const t = /const TUTOR_NOTE = "([^\n]*)";/.exec(html)[1];
  for (const s of ['Assess my latest attempt before anything else', 'electrons formed', "If you can't read an attempt, say so and don't grade it", 'start with one small hint', 'OFFER the worked solution and ask before showing it', 'that fresh attempt counts separately', 'ONE short reasoning check, unless my working already explains it', 'C code stays exactly as written'])
    assert.ok(t.includes(s), s);
  assert.match(html, /window\.__kgTutorNote = \(\) => tutorOn\(\) \? TUTOR_NOTE : ASSESS_NOTE;/, 'assess-first applies outside tutor mode too');
});
