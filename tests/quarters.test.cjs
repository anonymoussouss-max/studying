// Tests for the quarters (26 Nov 2026): the painted home room and the Gu cabinet. Every object opens an existing page or action,
// cultivation state is derived by KgCult/KgRank from the real records (only read here), and the only storage is view preferences.
// All fixtures are synthetic. Run: node --test tests/quarters.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pick = s => scripts.find(x => x.includes(s));
const Q = pick('window.KgQuarters ='), CULT = pick('window.KgCult = {'), RANK = pick('window.KgRank =');

// every tab id the desk defines, per page
function tabs() {
  const t = {}, add = (p, id) => (t[p] = t[p] || new Set()).add(id);
  const dict = html.match(/const SECTIONS = \{([\s\S]*?)\n  \};/)[1];
  for (const line of dict.split('\n')) { const m = line.match(/^\s*(\w+): \[(.*)\],?$/); if (m) for (const x of m[2].matchAll(/\['(\w+)'/g)) add(m[1], x[1]); }
  for (const m of html.matchAll(/SECTIONS\.(\w+)\.(?:push|unshift|splice)\([^[]*\['(\w+)'/g)) add(m[1], m[2]);
  for (const id of html.match(/const LIB = \[([^\]]*)\]/)[1].match(/\w+/g)) add('library', id);
  add('library', 'memory');
  return t;
}
const KEYB = 'bm:Basic Mathematics';
const syl = done => ({ courses: { bm: { cls: 11, subj: 'maths', name: 'Maths', chapters: [['Basic Mathematics', 23], ['Sets', 10]], done: [done, 4] } } });
function load({ withM = true, prefs = null, stage = null, done = 20, cult = null, habit = null, flow = null } = {}) {
  const store = { 'kg-lab-v1': '{}' }, writes = [], clicks = [], went = [];
  if (prefs) store['kg-quarters-v1'] = JSON.stringify(prefs);
  if (cult) store['kg-cult-v1'] = JSON.stringify(cult);
  if (habit) store['ame-habit-v1'] = JSON.stringify(habit);
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { writes.push(k); store[k] = String(v); } };
  const body = { classList: { toggle() {}, contains: () => false, add() {}, remove() {} } }, root = { classList: { toggle() {} } };
  const doc = { createElement: () => ({}), head: { appendChild() {} }, body, documentElement: root, querySelector: () => null, addEventListener: (t, f) => { if (t === 'click') clicks.push(f); },
    getElementById: id => id === 'kg-scene' && stage ? { querySelector: s => stage.q(s), classList: { toggle() {}, add() {}, remove() {} } } : null };
  const ctx = { Math, JSON, Number, String, Object, Array, Set, Map, Date, console, localStorage: ls, document: doc, requestAnimationFrame: f => f(), matchMedia: () => ({ matches: false }),
    MouseEvent: function () {}, MutationObserver: function () { this.observe = () => {}; }, addEventListener() {}, setTimeout: () => 0, clearTimeout() {}, setInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInNewContext(CULT, ctx); vm.runInNewContext(RANK, ctx);
  ctx.StudyPlan = { templateDay: () => ({ rows: [] }) };
  if (withM) ctx.MoonLab = { PANELS: { cultivation: () => '<BASE>' }, ACTIONS: { go: b => went.push('action:' + b.dataset.v) }, SECTIONS: { study: [['cultivation'], ['session']] },
    L: { syl: syl(done), flow }, render() {}, go: (a, b) => went.push(a + ':' + (b || '')), esc: s => s };
  vm.runInNewContext(Q, ctx);
  // a click on an element carrying these data attributes, through the module's document listener
  const click = dataset => clicks.forEach(f => f({ target: { closest: () => ({ dataset }) }, preventDefault() {} }));
  return { ctx, Kq: ctx.KgQuarters, M: ctx.MoonLab, writes, store, click, went };
}
const gu = (name, level, skills, shown = [], kept = []) => ({ key: 'c:' + name, name, level, acq: level === 'none' ? 'not-obtained' : 'obtained', share: 40, done: 1, lectures: 2,
  skills: skills && skills.map(id => ({ id, name: 'skill ' + id })), refine: { shown: shown.map(id => ({ id })) }, retention: kept.length ? { covered: kept, next: [] } : null });

test('every place, menu entry and home object opens a tab that exists in the desk', () => {
  const T = tabs(), { Kq } = load({ withM: false });
  const all = [...Kq.targets()].concat([...Kq.HOME || []].filter(h => h[0] === 'qgo').map(h => h[1]));
  for (const t of all) { const [p, id] = t.split(':'); assert.ok(T[p] && T[p].has(id), 'missing tab ' + t); }
});

test('plates follow the approved skill list: none without one, gold only from a later retention check', () => {
  const { Kq } = load({ withM: false });
  assert.deepStrictEqual([...Kq.plates(gu('A', 'obtained', null))], []);
  assert.deepStrictEqual([...Kq.plates(gu('A', 'obtained', ['a', 'b', 'c', 'd'], ['a', 'b'], ['a']))], ['r', 'd', 'n', 'n']);
  assert.strictEqual(Kq.plates(gu('A', 'learning', Array.from({ length: 9 }, (_, i) => 's' + i))).length, 9);
});

test('nooks: chosen Gu first, then other obtained Gu by refinement, then chapters on their way; at most four', () => {
  const { Kq } = load({ withM: false });
  const v = { subjects: { maths: { gu: [gu('Sets', 'obtained', null), Object.assign(gu('Basic Mathematics', 'none', null), { done: 20, lectures: 23 })] },
    physics: { gu: [gu('Motion', 'proven', null), gu('Units', 'learning', null), gu('Vectors', 'proof', null)] } } };
  assert.deepStrictEqual([...Kq.nooks(v).map(g => g.name)], ['Motion', 'Vectors', 'Units', 'Sets']);
  assert.deepStrictEqual([...Kq.nooks(v, ['c:Sets']).map(g => g.name)], ['Sets', 'Motion', 'Vectors', 'Units']);
  const few = { subjects: { maths: { gu: [gu('Sets', 'obtained', null), Object.assign(gu('Basic Mathematics', 'none', null), { done: 20, lectures: 23 })] } } };
  assert.deepStrictEqual([...Kq.nooks(few).map(g => g.name)], ['Sets', 'Basic Mathematics'], 'a chapter being studied fills an empty nook');
  assert.deepStrictEqual([...Kq.nooks(v, ['c:Basic Mathematics']).map(g => g.name)].slice(0, 1), ['Motion'], 'only obtained Gu can be chosen for display');
});

test('journey on derived records: lectures → checklist → attempts → obtained → skills, each with its own next step', () => {
  // 1. lectures still running: acquisition progress, no refinement yet
  let { M } = load({ done: 20 });
  let h = M.PANELS.cultivation();
  assert.match(h, /GU CABINET/); assert.match(h, /Mathematics region/);
  assert.match(h, /Basic Mathematics<\/b> · On its way<br><span class="kl-small">lectures 20\/23 · assigned-work checklist not verified yet/);
  let r = load({ done: 20 }); r.click({ qsel: KEYB }); h = r.M.PANELS.cultivation();
  assert.match(h, /Next:<\/b> Finish 3 more lectures \(next: lecture 21 of 23\)/);
  assert.match(h, /Refinement<\/b> · refinement starts once the Gu is obtained/);
  // the lecture-stage hint follows the checklist: never asks to verify one that is already verified
  const ns = g => r.Kq.nextStep(Object.assign({ key: KEYB, acq: 'not-obtained', done: 20, lectures: 23, scope: 'unverified', attempted: 0, assigned: 0 }, g)).t;
  assert.match(ns({}), /You can verify the assigned-work checklist meanwhile/);
  assert.match(ns({ scope: 'verified', attempted: 1, assigned: 3 }), /Meanwhile, 2 assigned items still to attempt\./);
  assert.match(ns({ scope: 'verified', attempted: 1, assigned: 1 }), /Assigned work is all attempted\./);
  assert.doesNotMatch(ns({ scope: 'verified', attempted: 1, assigned: 1 }), /verify the assigned-work checklist/);
  // 2. lectures done, checklist not yet verified
  r = load({ done: 23 }); r.click({ qsel: KEYB }); assert.match(r.M.PANELS.cultivation(), /Next:<\/b> Lectures done\. Confirm the assigned-work checklist/);
  // 3. verified checklist with one assigned item, not attempted
  const inv = { [KEYB]: { status: 'verified', items: [{ id: 'q1', kind: 'hw', label: 'L21 Q1', status: 'confirmed' }] } };
  r = load({ done: 23, cult: { inv } }); r.click({ qsel: KEYB }); h = r.M.PANELS.cultivation();
  assert.match(h, /assigned attempts 0\/1/); assert.match(h, /Next:<\/b> Attempt 1 more assigned item\./);
  // 4. the attempt is saved as evidence of acquisition: the Gu is obtained; refinement waits for an approved skill list
  inv[KEYB].items[0].attempt = { how: 'independent', note: 'factorised, then a sign scheme', at: 1 };
  r = load({ done: 23, cult: { inv } }); r.click({ qsel: KEYB }); h = r.M.PANELS.cultivation();
  assert.match(h, /<b>Obtained<\/b>/); assert.match(h, /Acquisition<\/b> · Gu obtained/); assert.match(h, /Next:<\/b> Approve this chapter’s skill list/);
  // 5. an approved list gives plates; the next step is a study session (the table's destination)
  const skills = { [KEYB]: { status: 'approved', list: [{ id: 's1', name: 'sign scheme', depth: 'developed' }, { id: 's2', name: 'excluded points', depth: 'developed' }] } };
  r = load({ done: 23, cult: { inv, skills } }); r.click({ qsel: KEYB }); h = r.M.PANELS.cultivation();
  assert.match(h, /0 of 2 skills shown independently · 0 retained/); assert.match(h, /Next:<\/b> Show 2 more skills independently/); assert.match(h, /data-qtable="1">Begin studying/);
  assert.match(h, /aria-label="Wave-Sign Serpent/, 'the obtained serpent appears');
});

test('the writing table resumes an unfinished session, else opens the session entry, whatever Study tab was last open', () => {
  let r = load(); r.click({ qtable: '1' }); assert.deepStrictEqual([...r.went], ['study:session']);
  assert.strictEqual(r.Kq.sessionState().label, 'Begin studying');
  r = load({ habit: { active: { subject: 'Maths', running: true, accruedMs: 0, lastStart: Date.now(), targetMs: 1500000 } } }); r.click({ qtable: '1' });
  assert.deepStrictEqual([...r.went], ['action:resume']); assert.strictEqual(r.Kq.sessionState().label, 'Resume session');
  r = load({ flow: { step: 'attempt' } }); r.click({ qtable: '1' }); assert.deepStrictEqual([...r.went], ['study:session']);
  assert.strictEqual(r.Kq.sessionState().label, 'Resume guided session');
});

test('rank: unresolved placement says what is missing and links to resolve it; chapter progress still shows', () => {
  const { M } = load();
  const h = M.PANELS.cultivation();
  assert.match(h, /Rank not placed yet: the catalogue is incomplete for Physics, Chemistry <button class="kl-ghost kqc-link" data-qsetup="1">Resolve<\/button>/);
  assert.match(h, /Now: <button[^>]*data-qsel="bm:Basic Mathematics">Basic Mathematics<\/button> · lectures 20\/23/);
  // once every count is in, an unmet first gate is progress, not a setup gap: name the next gate, offer no "Resolve"
  const r = load(), id = r.Kq.identity({ v: { placement: 'computable', why: [], subjects: { maths: { gu: [] }, physics: { gu: [] }, chem: { gu: [] } } }, st: {} });
  assert.strictEqual(id.rank.t, 'Rank not placed yet'); assert.strictEqual(id.rank.why, '');
  assert.match(id.rank.next, /^next gate: Rank 3 · initial, every Class 11 chapter Gu obtained/);
});

test('rules, sources and setup sit behind labelled controls; the classic records open from there and come back', () => {
  const r = load(); let h = r.M.PANELS.cultivation();
  assert.ok(!h.includes('<BASE>')); assert.match(h, /<summary><b>How cultivation works<\/b><\/summary>/); assert.match(h, /Records, sources and catalogue setup/);
  r.click({ qsetup: '1' }); h = r.M.PANELS.cultivation(); assert.ok(h.endsWith('<BASE>')); assert.match(h, /Back to the Gu cabinet/);
  r.click({ qback: '1' }); assert.match(r.M.PANELS.cultivation(), /GU CABINET/);
});

test('display choice is a view preference: the only thing ever written', () => {
  const inv = { [KEYB]: { status: 'verified', items: [] } };
  const r = load({ done: 23, cult: { inv } });
  r.M.PANELS.cultivation(); r.click({ qsel: KEYB }); r.M.PANELS.cultivation();
  assert.deepStrictEqual([...r.writes], []);
  r.click({ qshow: KEYB }); assert.deepStrictEqual([...r.writes], ['kg-quarters-v1']);
  assert.deepStrictEqual(JSON.parse(r.store['kg-quarters-v1']).shown, [KEYB]);
  r.click({ qshow: KEYB }); assert.deepStrictEqual(JSON.parse(r.store['kg-quarters-v1']).shown, []);
});

// a stand-in for the desk's home stage (.kq-stage) with just what mountHome touches
const fakeStage = () => { const st = { cls: new Set(), html: '', classList: { toggle: (c, on) => on ? st.cls.add(c) : st.cls.delete(c) },
  q: s => s === '.kq-stage' ? st : s === '.kqp-home' && st.html ? { remove: () => { st.html = ''; } } : null, insertAdjacentHTML: (w, h) => { st.html = h; } }; st.querySelector = st.q; return st; };

test('home: painted by default, every old door has an object, labels appear on hover/focus unless switched on, and there is a room guide', () => {
  const st = fakeStage(), { Kq, writes } = load({ stage: st });
  assert.ok(st.cls.has('kqp-painted'));
  assert.match(st.html, /quarters\/room-plate\.webp/);
  const targets = [...Kq.HOME.map(h => h[0] === 'qtable' ? 'study:session' : h[1])];
  for (const sec of ['today', 'study', 'library', 'plan', 'progress', 'company', 'settings']) assert.ok(targets.some(t => t.split(':')[0] === sec), 'no object for ' + sec);
  assert.match(st.html, /<svg class="kqp-home" /, 'labels hidden until hover or focus');
  assert.match(st.html, /id="kqp-table" tabindex="0" role="button" aria-label="Begin studying · writing table"/);
  assert.match(st.html, /data-kv="plan" tabindex="0" role="button" aria-label="Planner · notebook"/);
  assert.match(st.html, /<details class="kqp-guide"><summary>Room guide<\/summary>/);
  assert.match(st.html, /class="kqp-id"[\s\S]*Mathematics region/);
  assert.ok(!/iroha-desk|kaguya-still/.test(st.html), 'the live companions stay; no painted duplicates');
  assert.deepStrictEqual(writes, []);
  const on = fakeStage(); load({ stage: on, prefs: { showLabels: true } }); assert.match(on.html, /<svg class="kqp-home kqp-labels"/);
});

test('home: switching the painted room off, or Simplify, restores the original scene', () => {
  for (const prefs of [{ home: false }, { simplify: true }]) { const st = fakeStage(); load({ stage: st, prefs }); assert.ok(!st.cls.has('kqp-painted')); assert.strictEqual(st.html, ''); }
  const simp = load({ prefs: { simplify: true } }).M.PANELS.cultivation();
  for (const id of ['scroll', 'table', 'planner', 'cabinet', 'shelf', 'chest', 'door', 'iroha', 'kaguya']) assert.match(simp, new RegExp(`id="kq-place-${id}"`));
});

test('the clock: quiet outside study, an explicitly labelled session timer with pause/resume while studying', () => {
  assert.match(Q, /Session timer · \$\{esc\(a\.subject \|\| 'study'\)\}/);
  assert.match(Q, /data-qpause="1">\$\{a\.running \? 'Pause' : 'Resume'\}/);
  assert.match(Q, /kqp-quiet/); assert.match(Q, /Planner · \$\{esc/);
  assert.match(Q, /prefers-reduced-motion:reduce\)\{\.kq-breathe\{animation:none/);
});

test('the serpent stays an illustrative sign diagram; no decay, upkeep or later-arc story names', () => {
  assert.match(Q, /illustrative sign diagram[^<]*not a graph/);
  assert.match(Q, /class="pt-excluded"/); assert.match(Q, /mask="url\(#\$\{P\}-hole\)"/);
  assert.ok(!/graph of/i.test(Q));
  assert.ok(!/decay\s*\(|upkeep\s*\(/.test(Q));
  assert.ok(!/Venerable|Heavenly Court|Lang Ya|Rank [6-9]|Fang Yuan/.test(Q));
});
