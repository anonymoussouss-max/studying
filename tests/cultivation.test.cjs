// Cultivation (Phase 1a + rev 4 design corrections). Synthetic records only; no real course data or model calls.
// Run: node --test tests/cultivation.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = /<script id="kg-cult-script">([\s\S]*?)<\/script>/.exec(html)[1];
const win = {}; vm.runInNewContext(src, { window: win, Object, Math, String, JSON, Set, Array, Number, Date });
const K = win.KgCult, { cultivation } = K;
const J = x => JSON.parse(JSON.stringify(x));
const course = (subj, chapters, done, extra = {}) => Object.assign({ subj, cls: 11, chapters, done }, extra);
const L = (o = {}) => ({ medals: o.medals || {}, syl: { courses: Object.assign({
  m11: course('maths', [['Quadratic Equations', 11], ['Basic Mathematics', 23]], [11, 20]),
  p11: course('physics', [['Laws of Motion', 15]], [15]),
  pc11: course('chem', [['Basic Concepts', 21]], [21]), oc11: course('chem', [['Class 11 organic (lecture count missing)', null]], []),
  m12: course('maths', [['Class 12 Maths', 135]], [], { cls: 12, provisional: true }) }, o.courses || {}), qs: o.qs || [] } });
const QE = 'm11:Quadratic Equations';
const gu = (v, s, name) => v.subjects[s].gu.find(g => g.name === name);
const item = (id, kind, status, attempt) => ({ id, kind, label: id, status, attempt });
const st = (o = {}) => Object.assign(K.blankStore(), o);
const skills = list => ({ status: 'approved', list });
const SK = [{ id: 'roots', name: 'nature of roots', depth: 'developed' }, { id: 'loc', name: 'location of roots', depth: 'developed' }];

test('no checklist: "Assignment scope unverified", not obtained and not failed; logged questions are not a checklist', () => {
  const qs = [{ id: 'a', subj: 'maths', lec: 'Quadratic Equations L3', roles: ['tah'], state: 'independent' }];
  const g = gu(cultivation(L({ qs })), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.acq, 'scope-unverified'); assert.strictEqual(g.share, 0); assert.strictEqual(g.logged, 1);
});
test('a verified checklist with every item genuinely attempted (wrong, assisted or stuck-with-note) obtains the Gu; modules never count', () => {
  const inv = { status: 'verified', items: [item('d1', 'dpp', 'confirmed', { how: 'independent', working: 'x=2' }), item('k1', 'ktk', 'confirmed', { how: 'assisted', note: 'used a hint at step 2' }), item('t1', 'tah', 'confirmed', { how: 'stuck', note: 'stuck at the discriminant case' }), item('mod', 'module', 'confirmed')] };
  const g = gu(cultivation(L(), null, st({ inv: { [QE]: inv } })), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.acq, 'obtained'); assert.strictEqual(g.share, 40); assert.strictEqual(g.modules, 1); assert.strictEqual(g.inv.assisted, 2);
});
test('opening an item, or "stuck" with no note, is not an attempt', () => {
  assert.strictEqual(K.genuine({ how: 'independent' }), false);
  assert.strictEqual(K.genuine({ how: 'stuck', working: 'some lines' }), false);
  assert.strictEqual(K.genuine({ opened: true }), false);
  const inv = { status: 'verified', items: [item('d1', 'dpp', 'confirmed', { how: 'independent' })] };
  assert.strictEqual(gu(cultivation(L(), null, st({ inv: { [QE]: inv } })), 'maths', 'Quadratic Equations').acq, 'attempts-open');
});
test('unreviewed proposals keep the scope unverified; "not assigned" corrections are recorded and recalculate acquisition', () => {
  const items = [item('d1', 'dpp', 'confirmed', { how: 'independent', note: 'done' }), item('d2', 'dpp', 'proposed')];
  assert.strictEqual(gu(cultivation(L(), null, st({ inv: { [QE]: { status: 'verified', items } } })), 'maths', 'Quadratic Equations').acq, 'scope-unverified');
  items[1].status = 'not-assigned';
  assert.strictEqual(gu(cultivation(L(), null, st({ inv: { [QE]: { status: 'verified', items } } })), 'maths', 'Quadratic Equations').acq, 'obtained');
});
test('lectures unfinished means not obtained, whatever the checklist says', () => {
  const inv = { status: 'verified', items: [] };
  assert.strictEqual(gu(cultivation(L(), null, st({ inv: { 'm11:Basic Mathematics': inv } })), 'maths', 'Basic Mathematics').acq, 'not-obtained');
});
test('DPP text becomes proposals only, with its source; the answer key is not read as questions', () => {
  const text = 'Course 2.0 JEE\nMaths DPP: 3\nQuadratic Equations\nQ1 Solve x^2-5x+6=0\nQ2 Find k\nQ3 Show that\nAnswer Key\nQ1 2,3 Q2 4 Q3 -\nQ9 stray';
  const p = K.parseDPP(text, 'Quadratic Equations DPP 03 (of lec 4).pdf');
  assert.strictEqual(p.no, 3); assert.strictEqual(p.subj, 'maths'); assert.strictEqual(p.lec, 4); assert.strictEqual(p.chapter, 'Quadratic Equations');
  assert.deepStrictEqual(J(p.items.map(i => i.label)), ['DPP 3 · Q1', 'DPP 3 · Q2', 'DPP 3 · Q3']);
  assert.ok(p.items.every(i => i.status === 'proposed' && i.src.file.includes('DPP 03')));
  assert.ok(K.parseDPP('no number here', 'notes.pdf').error);
});
test('legacy medal: kept, but "scope uncertain" without an approved skill list; requests only what is missing', () => {
  const medals = { 'm-quadratic-equations': { d: '2026-10-01', score: 90 } }, before = JSON.stringify(medals);
  const inv = { status: 'verified', items: [] };
  const g = gu(cultivation(L({ medals }), null, st({ inv: { [QE]: inv } })), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.legacy, 'uncertain'); assert.strictEqual(g.share, 40);
  assert.deepStrictEqual(J(g.legacyInfo.missing), ['an approved essential-skill list for this chapter']);
  assert.strictEqual(JSON.stringify(medals), before);
  const g2 = gu(cultivation(L({ medals }), null, st({ inv: { [QE]: inv }, skills: { [QE]: skills(SK) }, legacy: { 'm-quadratic-equations': { covered: ['roots'] } } })), 'maths', 'Quadratic Equations');
  assert.strictEqual(g2.legacy, 'uncertain'); assert.deepStrictEqual(J(g2.legacyInfo.missing), ['skill not shown by the medal: location of roots']);
});
test('legacy medal: recognised (retention pending, share 90 not 100) only when scope is supported; a draft skill list does not count', () => {
  const medals = { 'm-quadratic-equations': { d: '2026-10-01', score: 90 } }, inv = { status: 'verified', items: [] };
  const ok = st({ inv: { [QE]: inv }, skills: { [QE]: skills(SK) }, legacy: { 'm-quadratic-equations': { covered: ['roots', 'loc'] } } });
  const g = gu(cultivation(L({ medals }), null, ok), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.legacy, 'recognised'); assert.strictEqual(g.level, 'proof'); assert.strictEqual(g.share, 90);
  ok.skills[QE].status = 'draft';
  assert.strictEqual(gu(cultivation(L({ medals }), null, ok), 'maths', 'Quadratic Equations').legacy, 'uncertain');
  const part = gu(cultivation(L({ medals: { 'p-friction': { d: 'x', score: 80 } } })), 'physics', 'Laws of Motion');
  assert.strictEqual(part.legacy, 'uncertain'); assert.ok(part.legacyInfo.missing[0].includes('p-newton-s-laws-of-motion'));
});
test('shared skills: one piece of evidence is credited once, to the matching depth; prerequisite use is a retention signal only', () => {
  const covers = { c11: [{ id: 'fn', depth: 'introduced' }], c12: [{ id: 'fn', depth: 'advanced' }, { id: 'inv', depth: 'developed' }] };
  const ev = [{ id: 'e1', gu: 'c11', skill: 'fn', depth: 'advanced', how: 'independent' }, { id: 'e1', gu: 'c12', skill: 'fn', depth: 'advanced', how: 'independent' }, { id: 'e2', gu: 'c11', skill: 'fn', depth: 'introduced', how: 'independent' }];
  const a = K.allocate(ev, covers);
  assert.deepStrictEqual(J(Object.fromEntries(Object.entries(a.credit).map(([k, v]) => [k, v.map(e => e.id)]))), { c12: ['e1'], c11: ['e2'] });
  assert.deepStrictEqual(J(a.signals), { c11: ['e1'] });
});
test('assisted work and a completed re-attempt set add no mastery; only independently solved questions count, each for its own skill', () => {
  const covers = { [QE]: SK };
  const ev = [{ id: 'r1', gu: QE, skill: 'roots', depth: 'developed', how: 'assisted', kind: 'reattempt' }, { id: 'r2', gu: QE, skill: 'loc', depth: 'developed', how: 'independent', kind: 'reattempt' }];
  const a = K.allocate(ev, covers), r = K.refinement(SK, a.credit[QE]);
  assert.strictEqual(r.shown.length, 1); assert.strictEqual(r.share, 17.5); assert.strictEqual(a.skipped[0].why, 'assisted');
  const inv = { status: 'verified', items: [] };
  const g = gu(cultivation(L(), null, st({ inv: { [QE]: inv }, skills: { [QE]: skills(SK) }, ev })), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.share, 57.5); assert.strictEqual(g.level, 'obtained');
  assert.strictEqual(K.refinement(null, []).defined, false);
});
test('weights: lecture count x subject multiplier; subject multipliers cancel within a subject', () => {
  const v = cultivation(L());
  assert.strictEqual(gu(v, 'maths', 'Basic Mathematics').weight, 207); assert.strictEqual(gu(v, 'physics', 'Laws of Motion').weight, 82.5);
});
test('editions: Class 11 only, incomplete while Organic/Inorganic are missing; never presented as a Class 11-12 catalogue; no placement', () => {
  const v = cultivation(L(), null, st({ frozen11: true }));
  assert.strictEqual(v.placement, 'not-computed'); assert.deepStrictEqual(J(v.why), ['chem']);
  assert.deepStrictEqual(J(v.ed.classes), [11]); assert.strictEqual(v.ed.complete, false); assert.strictEqual(v.ed.frozen, false);
  assert.ok(/not catalogued/.test(v.ed.class12)); assert.ok(!v.subjects.maths.gu.some(g => g.name === 'Class 12 Maths'));
});
test('it never writes the study record; its own writes go only to kg-cult-v1; and the "Practising" rename stays', () => {
  assert.ok(!/L\.ch\[|L\.medals\[[^\]]*\]\s*=|M\.save\(|\bsave\(\)/.test(src));
  for (const m of src.matchAll(/setItem\(([^,]+),/g)) assert.strictEqual(m[1].trim(), 'STORE');
  assert.ok(html.includes("learning: ['Practising'"));
  assert.ok(/BK_KEYS = \[[^\]]*'kg-cult-v1'/.test(html), 'complete backup includes the cultivation records');
});
test('planned Inorganic counts are proposals: unused until accepted, provisional after, and incomplete chapters still block placement', () => {
  const base = L({ courses: { ic11: course('chem', [['Class 11 inorganic (lecture count missing)', null]], []) } });
  const v0 = cultivation(base);
  assert.ok(v0.subjects.chem.missing.includes('Class 11 inorganic (lecture count missing)'));
  const ver = id => K.PLANNED.ic11.versions.find(v => v.id === id);
  assert.strictEqual(ver('pw-a').chapters.find(c => c[0].startsWith('p-Block'))[1], 5); assert.strictEqual(ver('pw-b').chapters.find(c => c[0].startsWith('p-Block'))[1], 6);
  const acc = st({ catalog: { ic11: { version: 'pw-a', label: 'A', chapters: ver('pw-a').chapters, by: 'you', confirmed: false } } });
  const v1 = cultivation(base, null, acc), bond = gu(v1, 'chem', 'Chemical Bonding and Molecular Structure');
  assert.strictEqual(bond.lectures, 23); assert.strictEqual(bond.planned, true); assert.strictEqual(bond.done, 0);
  assert.strictEqual(v1.placement, 'not-computed', 'Organic still missing'); assert.strictEqual(v1.ed.provisional, true);
});
test('with both chemistry plans in use but unconfirmed, placement is provisional only; confirming them is a separate step', () => {
  const base = L({ courses: { ic11: course('chem', [['x', null]], []), oc11: course('chem', [['y', null]], []) } });
  const cat = { ic11: { version: 'pw-b', label: 'B', chapters: K.PLANNED.ic11.versions[1].chapters, confirmed: false }, oc11: { version: 'scribd-ra', label: 'RA', chapters: K.PLANNED.oc11.versions[0].chapters, confirmed: false } };
  const v = cultivation(base, null, st({ catalog: cat }));
  assert.strictEqual(v.ed.complete, true); assert.strictEqual(v.placement, 'provisional'); assert.strictEqual(v.ed.provisionalWhy.length, 2);
  assert.strictEqual(gu(v, 'chem', 'Isomerism').lectures, 13); assert.ok(/2\.0/.test(K.PLANNED.oc11.versions[0].status + K.PLANNED.oc11.versions[0].src));
  cat.ic11.confirmed = cat.oc11.confirmed = true;
  assert.strictEqual(cultivation(base, null, st({ catalog: cat })).placement, 'computable');
});
test('amended drafts: Units and Dimensions is separate from Errors; scope notes say what is still unverified', () => {
  assert.ok(K.DRAFTS['Units and Dimensions'] && K.DRAFTS['Errors']);
  assert.ok(!K.DRAFTS['Errors'].list.some(([n]) => /dimension/i.test(n)));
  assert.ok(/remaining lectures/.test(K.DRAFTS['Basic Mathematics'].scope));
  assert.ok(K.DRAFTS['Basic Mathematics'].list.some(([n]) => /denominator/.test(n)) && K.DRAFTS['Basic Mathematics'].list.some(([n]) => /base cases/.test(n)));
  assert.ok(/percentage yield/.test(K.DRAFTS['Basic Concepts'].scope) && K.DRAFTS['Basic Concepts'].list.filter(([n]) => /yield|gas|normality/i.test(n)).every(([n]) => /keep only if taught/.test(n)), 'worksheet-evidenced candidates are labelled, not made mandatory');
  assert.ok(K.DRAFTS['Chemical Bonding and Molecular Structure'].list.some(([n]) => /Bond polarity versus molecular polarity/.test(n)));
  assert.ok(K.SOURCES.some(x => x.chapter === 'Vectors') && !K.LINKS['Motion in a Plane'].includes('vectors'));
  assert.ok(html.includes('It does not certify any generated question or reference solution.'));
});
test('the prepared DPP 07 checklist is document-complete (Q1–Q10, no answer key), proposed only, unattempted, and never chapter-complete', () => {
  const s = K.STARTERS['m11:Basic Mathematics'];
  assert.strictEqual(s.items.length, 10); assert.strictEqual(s.doc.docComplete, true); assert.strictEqual(s.doc.lec, 15);
  assert.ok(s.items.every(i => i.status === 'proposed' && !i.attempt && i.kind === 'dpp'));
  assert.ok(!s.items.some(i => /answer|key/i.test(i.label)));
  const inv = { status: 'incomplete', docs: [s.doc], items: s.items.map(i => Object.assign({}, i, { status: 'confirmed' })) };
  const g = gu(cultivation(L(), null, st({ inv: { 'm11:Basic Mathematics': inv } })), 'maths', 'Basic Mathematics');
  assert.strictEqual(g.inv.scope, 'unverified'); assert.strictEqual(g.inv.attempted, 0);
});
test('provisional skill drafts are never mastery gates until approved', () => {
  const d = K.DRAFTS['Basic Mathematics']; assert.ok(/reference-only/.test(d.src));
  const list = d.list.map(([name, depth], i) => ({ id: 's' + i, name, depth }));
  const inv = { status: 'verified', items: [] }, medals = { 'm-quadratic-equations': { d: 'x', score: 80 } };
  const draft = st({ inv: { [QE]: inv }, skills: { [QE]: { status: 'draft', list } } });
  const g = gu(cultivation(L({ medals }), null, draft), 'maths', 'Quadratic Equations');
  assert.strictEqual(g.skills, null); assert.strictEqual(g.refine.defined, false);
  assert.ok(Object.values(K.DRAFTS).every(x => x.src && x.list.length));
});
test('the same DPP question from two files is proposed once (content identity), different questions are kept', () => {
  const a = K.parseDPP('Physics DPP: 1\nVectors\nQ1 Find the resultant of two forces of 3 N and 4 N at right angles\nQ2 A unit vector along i + j', 'Vectors DPP 01 (of lec 02).pdf');
  const b = K.parseDPP('Physics DPP: 1\nVectors\nQ1 Find the resultant of two forces of 3 N and 4 N at right angles\nQ2 Something different entirely here', 'merged.pdf');
  assert.strictEqual(a.items[0].fp, b.items[0].fp); assert.notStrictEqual(a.items[1].fp, b.items[1].fp);
  assert.ok(html.includes('fps.has(x.fp)'));
  assert.strictEqual(K.parseDPP('Physics DPP: 4\nVectors\nQ1 x', 'Vectors  DPP 04 (Extra DPP).pdf').items[0].label, 'DPP 4 (extra) · Q1');
});
test('handoff skill tags ride on DPP proposals as unapproved content tags, with their source batch', () => {
  assert.strictEqual(Object.values(K.TAGS).reduce((a, t) => a + Object.keys(t.q).length, 0), 180);
  const t = K.tagFor('Some Basic Concepts of Chemistry _ DPP 07 (Of Lec 14).pdf', 5);
  assert.ok(t && t.status === 'proposed' && /2026/.test(t.batch));
  const p = K.parseDPP('Chemistry DPP: 7\nQ5 yield question here', 'Some Basic Concepts of Chemistry _ DPP 07 (Of Lec 14).pdf');
  assert.strictEqual(p.items[0].tag.status, 'proposed'); assert.strictEqual(p.items[0].status, 'proposed');
  assert.strictEqual(K.DRAFTS['Basic Concepts'].list.filter(([n]) => /candidate: keep only if taught/.test(n)).length, 3);
  assert.ok(/does not validate the rest of the bank/.test(K.STARTERS['m11:Basic Mathematics'].doc.keyAudit));
});
