// Chapter retention checks from the Gu cabinet. Stand-in questions and marks only: these tests check the desk's recording rules,
// NOT the quality of Iroha's real marking. Synthetic data only.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const grab = id => new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`).exec(html)[1];
const DAY = 86400000, KEY = 'm11:Sets';
const skills = [{ id: 's1', name: 'Set operations', depth: 'developed' }, { id: 's2', name: 'Venn diagram counting', depth: 'developed' }, { id: 's3', name: 'Power sets', depth: 'developed' }];

function desk({ approved = false } = {}) {
  const mem = {}, alerts = [];
  const localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const M = { PANELS: {}, ACTIONS: {}, FORMS: {}, render() {}, esc: s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
    getSet: async (ch, n) => ({ qs: Array.from({ length: n }, (_, i) => ({ t: 'Fresh ' + i, a: 'x', bid: 'b' + Math.random().toString(36).slice(2) })) }) };
  const win = { localStorage }; // the cultivation UI stays off; only the proof script sees the desk
  const document = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, body: { classList: { contains: () => false } } };
  const ctx = { window: win, localStorage, document, alert: m => alerts.push(m), setInterval: () => 0, setTimeout: () => 0, console, Object, Math, String, JSON, Set, Map, Array, Number, Date, Promise, CSS: { escape: s => s } };
  vm.runInNewContext(grab('kg-cult-script'), ctx); win.MoonLab = M; vm.runInNewContext(grab('kg-proof-script'), ctx);
  const K = win.KgCult, st = K.readStore(localStorage), t0 = Date.now() - 8 * DAY;
  st.skills[KEY] = { status: 'approved', at: t0 - DAY, list: skills };
  st.passes = { [KEY]: { at: t0, session: 'pf-old', by: 'photo proof (Iroha, provisional)' } };
  st.proofs = [{ id: 'pf-old', gu: KEY, state: 'assessed', qs: [], marks: {} }];
  st.ev.push({ id: 'old-1', gu: KEY, skill: 's1', depth: 'developed', how: 'independent', at: t0 - 2 * DAY });
  st.earned = [{ gate: 'r1-initial', at: t0 - 3 * DAY, by: 'you' }];
  if (approved) st.approvals = { chapterRetention: { at: t0, by: 'you' } };
  localStorage.setItem(K.STORE, JSON.stringify(st));
  return { win, M, K, alerts, read: () => K.readStore(localStorage), write: s => localStorage.setItem(K.STORE, JSON.stringify(s)), t0 };
}
const J = x => JSON.parse(JSON.stringify(x));
const mark = (ok, sk) => ({ readable: true, unclear: [], discrepancies: [], rubric: { method: ok ? 2 : 1, concept: 2, execution: 2, checks: 2 }, finalMatches: ok, skills: sk });

test('a check cannot start until the four proposed chapter rules are approved; approving stores the exact rule texts', async () => {
  const d = desk(); assert.strictEqual(d.win.KgRetention.RULES.length, 4);
  await d.M.ACTIONS.retstart({ dataset: { k: KEY, due: 's1,s2' } });
  assert.ok(!d.read().proof, 'nothing opens before approval');
  d.M.ACTIONS.retapprove(); const a = d.read().approvals.chapterRetention;
  assert.strictEqual(a.by, 'you'); assert.strictEqual(a.rules.length, 4); assert.match(a.rules[0], /7 days after the passed proof, due by day 14/);
  assert.match(a.rules[0], /14-day wait belongs to Course Gu/);
});

test('double-clicking Start opens one check with the due skills, 8 minutes a question (15 minimum)', async () => {
  const d = desk({ approved: true }), b = { dataset: { k: KEY, due: 's1,s2' } };
  await Promise.all([d.M.ACTIONS.retstart(b), d.M.ACTIONS.retstart(b)]);
  const st = d.read(); assert.strictEqual(st.proof.kind, 'retention'); assert.deepStrictEqual(J(st.proof.due), ['s1', 's2']);
  assert.strictEqual(st.proof.qs.length, 2); assert.strictEqual(st.proof.limit, 16 * 60000, 'two questions: 2 x 8 minutes');
  await d.M.ACTIONS.retstart(b); assert.strictEqual(d.read().proof.id, st.proof.id, 'an open check is never replaced');
});

test('recording: one evidence record per demonstrated due skill, in the existing format, written once however often it runs', () => {
  const d = desk({ approved: true }), st = d.read();
  st.proof = { id: 'rt1', kind: 'retention', gu: KEY, due: ['s1', 's2'], state: 'assessed', qs: [{ id: 'q0' }, { id: 'q1' }], marks: { q0: mark(true, ['s1']), q1: mark(false, ['s2']) } };
  const before = st.ev.length; d.win.KgRetention.record(st); d.win.KgRetention.record(st); d.win.KgRetention.record(st);
  const added = st.ev.slice(before); assert.strictEqual(added.length, 1);
  const e = added[0]; assert.deepStrictEqual([e.id, e.gu, e.skill, e.depth, e.how, e.fresh, e.kind], ['rc:rt1:s1', KEY, 's1', 'developed', 'independent', true, 'retention-check']);
  assert.ok(Number.isFinite(e.at)); assert.deepStrictEqual(J(st.proof.result), J({ at: st.proof.result.at, shown: ['s1'], review: ['s2'] }));
  assert.ok(st.ev.some(x => x.id === 'old-1'), 'earlier records are kept');
});

test('recording ignores skills outside the due list and anything not yet assessed (a failed or cancelled check writes nothing)', () => {
  const d = desk({ approved: true }), st = d.read(), n = st.ev.length;
  st.proof = { id: 'rt2', kind: 'retention', gu: KEY, due: ['s2'], state: 'submitted', error: 'network', qs: [{ id: 'q0' }], marks: {} };
  d.win.KgRetention.record(st); assert.strictEqual(st.ev.length, n); assert.strictEqual(st.proof.result, undefined);
  st.proof.state = 'assessed'; st.proof.marks = { q0: mark(true, ['s2', 's3']) }; d.win.KgRetention.record(st);
  assert.deepStrictEqual(J(st.ev.slice(n).map(e => e.skill)), ['s2'], 's3 was not due in this check');
});

test('the progression logic reads the new records: partial stays at proof, all skills retained makes the chapter proven; proofs and earned stages stay', () => {
  const d = desk({ approved: true }), st = d.read(), now = Date.now(), need = skills;
  const ret = s => d.win.KgProof.retention({ proofAt: s.passes[KEY].at, now, need, evidence: s.ev.filter(e => e.gu === KEY) });
  st.proof = { id: 'rt3', kind: 'retention', gu: KEY, due: ['s1', 's2'], state: 'assessed', qs: [{ id: 'q0' }, { id: 'q1' }], marks: { q0: mark(true, ['s1']), q1: mark(false, ['s2']) } };
  d.win.KgRetention.record(st); let r = ret(st); assert.deepStrictEqual(J(r.covered), ['s1']); assert.strictEqual(r.proven, false);
  st.proof = { id: 'rt4', kind: 'retention', gu: KEY, due: ['s2', 's3'], state: 'assessed', qs: [{ id: 'q0' }, { id: 'q1' }], marks: { q0: mark(true, ['s2']), q1: mark(true, ['s3']) } };
  d.win.KgRetention.record(st); r = ret(st); assert.strictEqual(r.proven, true);
  assert.deepStrictEqual(st.passes[KEY].session, 'pf-old'); assert.strictEqual(st.earned[0].gate, 'r1-initial');
});

test('a retention check never writes a chapter proof pass, and the slip names what is still owed', () => {
  assert.match(html, /if \(st\.proof\.kind === 'retention'\) retain\(st\);\s*else \{/);
  assert.match(html, /Demonstrated: \$\{[^}]*\} · Still needs review:/);
});

test('the "one task. phone away" bubble sits above Return to quarters during a session', () => {
  assert.match(html, /body\.kt-on:not\(\.kt-p-home\) #habit-notice\{bottom:calc\(max\(14px,env\(safe-area-inset-bottom\)\) \+ 62px\)\}/);
});
