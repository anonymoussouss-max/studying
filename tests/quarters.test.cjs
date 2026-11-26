// Tests for the quarters (26 Nov 2026): an opt-in painted view of ⛰ Cultivation. Every place opens an existing page or action,
// rules are only read (plates from approved skills, Blessed Land from KgRank.land), and the only storage is view preferences.
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
function load({ withM = true, prefs = null, today = null } = {}) {
  const store = { 'kg-lab-v1': '{}' }, writes = [];
  if (prefs) store['kg-quarters-v1'] = JSON.stringify(prefs);
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { writes.push(k); store[k] = String(v); } };
  const doc = { createElement: () => ({}), head: { appendChild() {} }, addEventListener() {}, getElementById: () => null };
  const ctx = { Math, JSON, Number, String, Object, Array, Set, Map, Date, console, localStorage: ls, document: doc, requestAnimationFrame: f => f(), matchMedia: () => ({ matches: false }), MouseEvent: function () {} };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInNewContext(CULT, ctx); vm.runInNewContext(RANK, ctx);
  if (today) ctx.StudyPlan = { templateDay: () => ({ rows: today }), clk: m => String(m) };
  if (withM) ctx.MoonLab = { PANELS: { cultivation: () => '<BASE>' }, ACTIONS: {}, SECTIONS: { study: [['cultivation']] }, L: {}, render() {}, esc: s => s };
  vm.runInNewContext(Q, ctx);
  return { ctx, Kq: ctx.KgQuarters, M: ctx.MoonLab, writes, store };
}
const gu = (name, level, skills, shown = [], kept = []) => ({ key: 'c:' + name, name, level, acq: level === 'none' ? 'not-obtained' : 'obtained', share: 40, done: 1, lectures: 2,
  skills: skills && skills.map(id => ({ id, name: 'skill ' + id })), refine: { shown: shown.map(id => ({ id })) }, retention: kept.length ? { covered: kept, next: [] } : null });

test('off by default: Cultivation shows its usual panel plus one button, and nothing is stored', () => {
  const { M, writes, Kq } = load();
  assert.strictEqual(Kq.prefs().on, false);
  const h = M.PANELS.cultivation();
  assert.ok(h.endsWith('<BASE>'), 'the classic panel is unchanged underneath');
  assert.match(h, /Open the quarters \(preview\)/);
  assert.deepStrictEqual(writes, []);
});

test('every place and menu entry opens a tab that exists in the desk', () => {
  const T = tabs(), { Kq } = load({ withM: false });
  for (const t of Kq.targets()) { const [p, id] = t.split(':'); assert.ok(T[p] && T[p].has(id), 'missing tab ' + t); }
  const ids = [...Kq.PLACES.map(p => p.id)];
  assert.deepStrictEqual(ids, ['scroll', 'table', 'cabinet', 'shelf', 'chest', 'door', 'iroha', 'kaguya']);
});

test('plates follow the approved skill list: none without one, gold only from a later retention check', () => {
  const { Kq } = load({ withM: false });
  assert.deepStrictEqual([...Kq.plates(gu('A', 'obtained', null))], []);
  assert.deepStrictEqual([...Kq.plates(gu('A', 'obtained', ['a', 'b', 'c', 'd'], ['a', 'b'], ['a']))], ['r', 'd', 'n', 'n']);
  assert.strictEqual(Kq.plates(gu('A', 'learning', Array.from({ length: 9 }, (_, i) => 's' + i))).length, 9, 'nine skills, nine plates');
  assert.deepStrictEqual([...Kq.plates(gu('A', 'obtained', ['a'], [], ['a']))], ['r']);
});

test('nooks: Basic Mathematics first, then the most refined, at most four', () => {
  const { Kq } = load({ withM: false });
  const v = { subjects: { maths: { gu: [gu('Sets', 'obtained', null), gu('Basic Mathematics', 'none', null)] }, physics: { gu: [gu('Motion', 'proven', null), gu('Units', 'learning', null), gu('Vectors', 'proof', null)] } } };
  assert.deepStrictEqual([...Kq.nooks(v).map(g => g.name)], ['Basic Mathematics', 'Motion', 'Vectors', 'Units']);
});

test('the room reads; only view preferences are ever written', () => {
  const { M, writes, store } = load({ prefs: { on: true }, today: [{ s: 700, e: 760, title: 'Maths', kind: 'study' }, { s: 1280, e: 1400, title: 'Reading · protected personal time', kind: 'life' }] });
  const h = M.PANELS.cultivation();
  assert.match(h, /YOUR QUARTERS/); assert.match(h, /quarters\/room-plate\.webp/);
  for (const id of ['scroll', 'table', 'cabinet', 'shelf', 'chest', 'door', 'iroha', 'kaguya']) M.ACTIONS.qplace({ dataset: { v: id } }), M.PANELS.cultivation();
  assert.deepStrictEqual(writes, []);
  M.ACTIONS.qpref({ dataset: { v: 'labels' } });
  assert.deepStrictEqual(writes, ['kg-quarters-v1']);
  assert.strictEqual(JSON.parse(store['kg-quarters-v1']).labels, false);
});

test('the scroll shows fixed bands as fixed and offers no way to edit times', () => {
  const { M } = load({ prefs: { on: true }, today: [{ s: 1280, e: 1400, title: 'Reading · protected personal time', kind: 'life' }, { s: 1530, e: 2070, title: 'Sleep', kind: 'sleep' }] });
  M.ACTIONS.qplace({ dataset: { v: 'scroll' } });
  const h = M.PANELS.cultivation();
  assert.match(h, /Reading · protected personal time <span class="kl-small">· fixed/);
  assert.ok(!/<input|<form|data-a="kgd/.test(h.split('WALL SCROLL')[1]), 'no editing controls in the scroll');
});

test('Blessed Land: locked until Rank 4 or the first Immortal Gu', () => {
  const locked = load({ prefs: { on: true } }); locked.M.ACTIONS.qplace({ dataset: { v: 'door' } });
  assert.match(locked.M.PANELS.cultivation(), /Blessed Land<\/b> · locked: opens at Rank 4/);
  const open = load({ prefs: { on: true } }); open.store['kg-cult-v1'] = JSON.stringify({ earned: [{ gate: 'r4-initial', at: 1 }] });
  open.M.ACTIONS.qplace({ dataset: { v: 'door' } });
  assert.match(open.M.PANELS.cultivation(), /Blessed Land<\/b> · open \(Cultivator Rank 4\)/);
});

test('hiding characters, Gu or labels keeps every place reachable; simplify lists them all', () => {
  const hid = load({ prefs: { on: true, chars: false, gu: false, labels: false, content: false } }).M.PANELS.cultivation();
  for (const id of ['iroha', 'kaguya', 'cabinet']) assert.match(hid, new RegExp(`data-a="qplace" data-v="${id}"`));
  assert.ok(!/iroha-desk\.webp/.test(hid), 'characters hidden');
  const simp = load({ prefs: { on: true, simplify: true } }).M.PANELS.cultivation();
  assert.ok(!/<svg class="kq-svg"/.test(simp), 'no painting in simplify');
  for (const id of ['scroll', 'table', 'cabinet', 'shelf', 'chest', 'door', 'iroha', 'kaguya']) assert.match(simp, new RegExp(`id="kq-place-${id}"`));
  assert.match(load({ prefs: { on: true, still: true } }).M.PANELS.cultivation(), /kq-still/, 'reduced motion switch');
  assert.match(Q, /prefers-reduced-motion:reduce\)\{\.kq-breathe\{animation:none/);
});

test('the serpent stays an illustrative sign diagram with the undefined point excluded', () => {
  assert.match(Q, /illustrative sign diagram[^<]*not a graph/);
  assert.match(Q, /class="pt-excluded"/); assert.match(Q, /mask="url\(#\$\{P\}-hole\)"/);
  assert.ok(!/graph of/i.test(Q));
});

test('no decay, no upkeep, and no story content past the agreed boundary', () => {
  assert.ok(!/decay\s*\(|upkeep\s*\(|setInterval/.test(Q), 'nothing ticks down');
  // the room's story vocabulary is limited to Gu, Immortal Gu, Blessed Land and Rank 1–5; later-arc names are a guard
  assert.ok(!/Venerable|Heavenly Court|Lang Ya|Rank [6-9]|Fang Yuan/.test(Q));
});
