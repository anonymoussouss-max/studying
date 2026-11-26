// Photo proofs, appeals, retention, exposure and tombstones (rev 4). Stand-in replies only: these tests check the desk's rules,
// NOT the quality of Iroha's real reading or marking, which no test here establishes. Synthetic data only.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = /<script id="kg-proof-script">([\s\S]*?)<\/script>/.exec(html)[1];
const cultSrc = /<script id="kg-cult-script">([\s\S]*?)<\/script>/.exec(html)[1];
const win = {}; const ctx = { window: win, Object, Math, String, JSON, Set, Array, Number, Date };
vm.runInNewContext(cultSrc, ctx); vm.runInNewContext(src, ctx);
const P = win.KgProof, K = win.KgCult, J = x => JSON.parse(JSON.stringify(x));
const MIN = 60000, DAY = 86400000, T0 = Date.UTC(2026, 10, 1, 10);
const need = [{ id: 'a', name: 'skill A' }, { id: 'b', name: 'skill B' }];
const qs = [{ id: 'q0', t: 'Q0', skills: ['a'] }, { id: 'q1', t: 'Q1', skills: ['b'] }];
const mk = (rubric, o = {}) => Object.assign({ readable: true, unclear: [], rubric, finalMatches: true }, o);
const R = (m, c, e, k = 1) => ({ method: m, concept: c, execution: e, checks: k });
const marked = (marks) => { let s = P.newSession({ id: 's', gu: 'g', qs, now: T0 }); s = P.step(s, 'photo', T0, { id: 'p1', q: 'q0', saved: true }); s = P.step(s, 'submit', T0 + MIN, { decl: { at: 1 } }); s = P.step(s, 'reading', T0 + MIN); return P.step(s, 'marked', T0 + 2 * MIN, { reads: {}, marks }); };

test('the clock pauses while photographing and resumes when solving again; a refresh keeps the right state and time', () => {
  let s = P.newSession({ id: 's', gu: 'g', qs, now: T0 });
  s = P.step(s, 'capture', T0 + 10 * MIN); assert.strictEqual(P.elapsed(s, T0 + 30 * MIN), 10 * MIN);
  s = P.step(s, 'resume', T0 + 30 * MIN); assert.strictEqual(P.elapsed(s, T0 + 35 * MIN), 15 * MIN);
  const back = P.restore(JSON.parse(JSON.stringify(P.step(s, 'capture', T0 + 35 * MIN))), T0 + 90 * MIN);
  assert.strictEqual(back.state, 'capturing'); assert.strictEqual(P.elapsed(back, T0 + 90 * MIN), 15 * MIN); assert.strictEqual(back.notSubmitted, true);
});
test('unsubmitted work is never assessed; submitting needs a saved photo and the closed-book declaration', () => {
  let s = P.newSession({ id: 's', gu: 'g', qs, now: T0 });
  assert.strictEqual(P.chapterResult(s, need).result, 'not-submitted');
  assert.strictEqual(P.step(s, 'submit', T0, { decl: { at: 1 } }).state, 'solving', 'no photo yet');
  s = P.step(s, 'photo', T0, { id: 'p1', q: 'q0', saved: false });
  assert.strictEqual(P.step(s, 'submit', T0, { decl: { at: 1 } }).state, 'solving', 'a failed upload is not a saved photo');
  s = P.step(s, 'photo', T0, { id: 'p2', q: 'q0', saved: true });
  assert.strictEqual(P.step(s, 'submit', T0, {}).state, 'solving', 'no declaration');
  assert.strictEqual(P.step(s, 'submit', T0, { decl: { at: 1 } }).state, 'submitted');
});
test('an upload or reading failure keeps the photos, returns to Submitted and awards nothing', () => {
  let s = P.newSession({ id: 's', gu: 'g', qs, now: T0 }); s = P.step(s, 'photo', T0, { id: 'p1', q: 'q0', saved: true });
  s = P.step(P.step(s, 'submit', T0, { decl: { at: 1 } }), 'reading', T0); s = P.step(s, 'read-failed', T0, 'timeout');
  assert.strictEqual(s.state, 'submitted'); assert.strictEqual(s.photos.length, 1); assert.strictEqual(P.chapterResult(s, need).result, 'pending');
});
test('marking: right answer with invalid reasoning is Not yet; a slip with sound reasoning passes; a valid alternative passes', () => {
  assert.strictEqual(P.decide(mk(R(1, 2, 2), { finalMatches: true })), 'not-yet');
  assert.strictEqual(P.decide(mk(R(2, 1, 2))), 'not-yet');
  assert.strictEqual(P.decide(mk(R(2, 2, 1), { finalMatches: false })), 'pass-slip');
  assert.strictEqual(P.decide(mk(R(1, 2, 2), { validAlternative: true })), 'pass');
  assert.strictEqual(P.decide(mk(R(2, 2, 2))), 'pass');
});
test('unreadable photos, verdict-changing ambiguity and malformed replies stay Pending, never wrong', () => {
  assert.strictEqual(P.decide(mk(R(0, 0, 0), { readable: false })), 'pending');
  assert.strictEqual(P.decide(mk(R(2, 2, 2), { unclear: [{ where: 'sign in line 3', changesVerdict: true }] })), 'pending');
  assert.strictEqual(P.decide(mk(R(2, 2, 2), { unclear: [{ where: 'smudge', changesVerdict: false }] })), 'pass');
  assert.strictEqual(P.decide(mk({ method: 'good' })), 'pending');
  const pm = P.parseMarks('sorry, I could not do that', qs);
  assert.strictEqual(pm.ok, false); assert.ok(qs.every(q => P.decide(pm.marks[q.id]) === 'pending'));
  const good = P.parseMarks('Here: {"questions":[{"id":"q0","transcription":"x=2","readable":true,"unclear":[],"rubric":{"method":2,"concept":2,"execution":2,"checks":1},"skills":["a"],"rationale":"ok"}]}', qs);
  assert.strictEqual(P.decide(good.marks.q0), 'pass'); assert.strictEqual(good.marks.q0.by, 'Iroha (AI, provisional)'); assert.strictEqual(P.decide(good.marks.q1), 'pending');
});
test('chapter result: every approved skill shown; no approved list means pending; pending questions keep it pending', () => {
  const pass = marked({ q0: mk(R(2, 2, 2), { skills: ['a'] }), q1: mk(R(2, 2, 1), { skills: ['b'] }) });
  assert.strictEqual(P.chapterResult(pass, need).result, 'pass');
  assert.strictEqual(P.chapterResult(pass, null).result, 'pending');
  const unclear = marked({ q0: mk(R(2, 2, 2), { skills: ['a'] }), q1: mk(R(2, 2, 2), { skills: ['b'], readable: false }) });
  assert.strictEqual(unclear.state, 'pending'); assert.strictEqual(P.chapterResult(unclear, need).result, 'pending');
  const miss = marked({ q0: mk(R(2, 2, 2), { skills: ['a'] }), q1: mk(R(0, 1, 2), { skills: ['b'] }) });
  assert.strictEqual(P.chapterResult(miss, need).result, 'not-yet');
});
test('a correction to the reading is kept with the original and re-opens assessment', () => {
  const s = P.step(marked({ q0: mk(R(2, 2, 2), { skills: ['a'] }), q1: mk(R(2, 2, 2), { skills: ['b'] }) }), 'clarify', T0 + 3 * MIN, { q: 'q1', text: 'it is x^2 not x2' });
  assert.strictEqual(s.reads.q1.fix, 'it is x^2 not x2'); assert.strictEqual(s.state, 'pending');
});
test('appeals: model agreement never closes one; a faulty question is voided and never counts against you; history is kept', () => {
  let s = marked({ q0: mk(R(2, 2, 2), { skills: ['a'] }), q1: mk(R(0, 0, 0), { skills: ['b'], why: 'key says 4' }) });
  s = P.appeal(s, 'q1', 'reference', 'textbook gives 5', T0 + 5 * MIN);
  assert.strictEqual(P.decide(s.marks.q1), 'pending'); assert.strictEqual(P.chapterResult(s, need).result, 'pending');
  const r1 = P.resolve(s, s.appeals[0].id, { basis: 'model-agreement', reasoning: 'two models agree', outcome: 'rejected' }, T0 + 6 * MIN);
  assert.strictEqual(r1.ok, false); assert.ok(/stays open/.test(r1.why));
  const r2 = P.resolve(s, s.appeals[0].id, { basis: 'reference', ref: 'NCERT p.12', reasoning: 'the given data make the key wrong', outcome: 'faulty-question' }, T0 + 7 * MIN);
  assert.ok(r2.ok); assert.strictEqual(P.decide(r2.s.marks.q1), 'void'); assert.strictEqual(r2.s.marks.q1.prior[0].why, 'key says 4');
  assert.strictEqual(r2.s.appeals[0].history.length, 2);
  const res = P.chapterResult(r2.s, need); assert.strictEqual(res.result, 'pending'); assert.ok(/skill B/.test(res.why), 'a voided question needs a replacement, it does not fail the skill');
});
test('retention: opens 7 days after the proof, rest days postpone it without debt, one later answer is never enough', () => {
  const base = { proofAt: T0, need, evidence: [] };
  assert.strictEqual(P.retention(Object.assign({}, base, { now: T0 + 6 * DAY })).open, false);
  const r7 = P.retention(Object.assign({}, base, { now: T0 + 7 * DAY })); assert.strictEqual(r7.open, true); assert.deepStrictEqual(J(r7.next), ['a', 'b']);
  const d0 = Math.floor(T0 / DAY), rest = P.retention(Object.assign({}, base, { now: T0 + 7 * DAY, pausedDays: [d0 + 2, d0 + 3] }));
  assert.strictEqual(rest.open, false); assert.ok(/without debt/.test(rest.note));
  const one = P.retention(Object.assign({}, base, { now: T0 + 9 * DAY, evidence: [{ id: 'e1', skills: ['a', 'b'], how: 'independent', fresh: true, at: T0 + 8 * DAY }] }));
  assert.strictEqual(one.proven, false); assert.strictEqual(one.covered.length, 2);
  const two = P.retention(Object.assign({}, base, { now: T0 + 9 * DAY, evidence: [{ id: 'e1', skills: ['a', 'b'], how: 'independent', fresh: true, at: T0 + 8 * DAY }, { id: 'e2', skill: 'b', how: 'independent', fresh: true, at: T0 + 9 * DAY }] }));
  assert.strictEqual(two.proven, true);
});
test('retention evidence must be later, fresh and independent; integrated questions credit each skill once', () => {
  const ev = [{ id: 'same-day', skill: 'a', how: 'independent', fresh: true, at: T0 + 1000 }, { id: 'help', skill: 'a', how: 'assisted', fresh: true, at: T0 + 8 * DAY }, { id: 'seen', skill: 'a', how: 'independent', fresh: false, at: T0 + 8 * DAY }];
  assert.strictEqual(P.retention({ proofAt: T0, now: T0 + 9 * DAY, need, evidence: ev }).covered.length, 0);
  const big = Array.from({ length: 9 }, (_, i) => ({ id: 's' + i, name: 'S' + i }));
  assert.strictEqual(P.retention({ proofAt: T0, now: T0 + 8 * DAY, need: big, evidence: [] }).next.length, 3, 'a large chapter is checked a few skills at a time');
});
test('exposure is per question: practising a method keeps other questions eligible; a seen solution makes that question training', () => {
  const ex = { q1: { seen: 1, solution: 1 }, q2: { attempted: 1 } };
  assert.strictEqual(P.eligible(ex, 'q1', 'proof'), false); assert.strictEqual(P.eligible(ex, 'q1', 'training'), true);
  assert.strictEqual(P.eligible(ex, 'q9', 'proof'), true);
  assert.strictEqual(P.replacementOk('numeric-substitution', 'proof'), false); assert.strictEqual(P.replacementOk('changed-unknown', 'retention'), true);
  assert.strictEqual(P.replacementOk('numeric-substitution', 'bank', { handsSteps: true }), false);
});
test('bank completion: a successful fresh replacement fulfils the original entry and creates nothing new', () => {
  const entry = { id: 'b1' };
  assert.strictEqual(P.bankDone(entry, [{ entry: 'b1', ok: false, how: 'independent' }]), false);
  assert.strictEqual(P.bankDone(entry, [{ replaces: 'b1', kind: 'new-setup', ok: true, how: 'independent' }]), true);
  assert.strictEqual(P.bankDone(entry, [{ replaces: 'b1', kind: 'new-setup', ok: true, how: 'assisted' }]), false);
});
test('a recorded proof pass gives "Proof passed — retention pending" (90), and fresh later retention makes it Proven (100)', () => {
  const course = { subj: 'maths', cls: 11, chapters: [['Quadratic Equations', 11]], done: [11] };
  const L = { medals: {}, syl: { courses: { m11: course }, qs: [] } }, key = 'm11:Quadratic Equations';
  const st = Object.assign(K.blankStore(), { inv: { [key]: { status: 'verified', items: [] } }, skills: { [key]: { status: 'approved', list: need } }, passes: { [key]: { at: T0 } } });
  L.__now = T0 + 8 * DAY;
  let g = K.cultivation(L, null, st).subjects.maths.gu[0]; assert.strictEqual(g.level, 'proof'); assert.strictEqual(g.share, 90);
  st.ev = [{ id: 'e1', gu: key, skills: ['a'], how: 'independent', fresh: true, at: T0 + 8 * DAY }, { id: 'e2', gu: key, skill: 'b', how: 'independent', fresh: true, at: T0 + 8 * DAY }];
  g = K.cultivation(L, null, st).subjects.maths.gu[0]; assert.strictEqual(g.level, 'proven'); assert.strictEqual(g.share, 100);
});
test('tombstones: a deleted photo is skipped by the integrity check, never reported missing, and survives a restore', async () => {
  const a = html.indexOf('  const sha = async s =>'), b = html.indexOf('  M.bkCheck = bkCheck;');
  const { sha, bkCheck } = new Function(html.slice(a, b) + '; return { sha, bkCheck };')();
  const url = 'data:text/plain;base64,' + Buffer.from('synthetic photo').toString('base64');
  const arc = { format: 'kaguya-desk-full-v2', at: 1, data: { 'kg-lab-v1': '{}' }, files: [], manifest: [{ id: 'ev:p1', name: 'p1.jpg', sha: await sha(url) }] };
  assert.strictEqual((await bkCheck(arc)).bad.length, 1, 'without a tombstone it is missing');
  assert.strictEqual((await bkCheck(arc, { 'ev:p1': { at: 1 } })).bad.length, 0, 'deleted on this device: skipped');
  arc.data['kg-tomb-v1'] = JSON.stringify({ 'ev:p1': { at: 1 } }); assert.strictEqual((await bkCheck(arc)).bad.length, 0, 'deleted before the backup: skipped');
  assert.ok(html.includes("const tombAll = Object.assign({}, tombOld, tombNow)") && html.includes("concat(Object.keys(tombAll))"), 'restore keeps every tombstone and skips those files');
  assert.ok(/BK_KEYS = \[[^\]]*'kg-tomb-v1'/.test(html) && /'kg-cult-v1', 'kg-tomb-v1'\];/.test(html), 'tombstones are backed up and synced');
});
test('the desk never awards from seed data, never writes the study record from here, and labels AI marking as provisional', () => {
  assert.ok(!/L\.medals\[[^\]]*\]\s*=|L\.ch\[|M\.save\(/.test(src));
  assert.ok(src.includes("not an authoritative verdict")); assert.ok(src.includes('closed-book declaration'));
  assert.ok(html.includes("window.__kgPurpose ? { purpose: window.__kgPurpose } : {}"));
});
