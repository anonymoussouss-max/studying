// Handoff §6 (learning cycle) and §7 (question tracking). Synthetic lectures and questions only.
// Run: node --test tests/cycle.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
ctx.globalThis = ctx; vm.runInNewContext(src, ctx); const SP = ctx.StudyPlan;
const D = '2026-12-02', C0 = { actual14: {}, loggedAny: false, diplomaToday: 0 };
const day = (syl, d = D, extra = {}) => SP.templateDay({ syl, sched: Object.assign({ wake: { [d]: 600 }, focus: { [d]: 'maths' } }, extra) }, d, new Date(d + 'T12:00:00').getDay(), -1, C0).rows;
const studyTitles = rows => rows.filter(r => r.kind === 'study' && r.task).map(r => r.title);
const finished = () => { const syl = SP.seedSyllabus(); syl.revs.push({ id: 'rvA', subj: 'maths', title: 'Basic Mathematics · lecture 21', done: false, made: D }); SP.cycleAfterLecture(syl, 'maths', 'Basic Mathematics · lecture 21', 'rvA', D); return syl; };

test('a finished Maths lecture opens re-attempts, then TAH/KCLS, then KTK; never DPP or module work', () => {
  const syl = finished(), [tah, ktk] = syl.hw;
  assert.strictEqual(syl.hw.length, 2);
  assert.match(tah.title, /^TAH\/KCLS/); assert.strictEqual(tah.after, 'rvA');
  assert.match(ktk.title, /^KTK/); assert.strictEqual(ktk.after, tah.id);
  assert.strictEqual(SP.cycleAfterLecture(SP.seedSyllabus(), 'physics', 'x', 'rv1', D).length, 0, 'physics homework is added by hand');
  assert.ok(!syl.hw.some(h => /DPP|module/i.test(h.title)));
});

test('the day keeps the order: all class re-attempts, then TAH/KCLS, then KTK', () => {
  const t = studyTitles(day(finished())), r = t.findIndex(x => /^Revise .*re-solve ALL class examples/.test(x)), a = t.findIndex(x => /TAH\/KCLS/.test(x)), k = t.findIndex(x => /KTK/.test(x));
  assert.ok(r >= 0, 're-attempts are planned'); assert.ok(a > r, 'TAH/KCLS after the re-attempts');
  if (k >= 0) assert.ok(k > a, 'KTK after TAH/KCLS');
  assert.ok(!t.some(x => /DPP|module/i.test(x)), 'no DPP or module work appears automatically');
});

test('KTK waits while TAH/KCLS is open, and TAH/KCLS waits while re-attempts are open', () => {
  const syl = finished(), tasks = SP.buildTasks({ syl }, D), by = re => tasks.find(x => re.test(x.title));
  assert.strictEqual(by(/TAH/).after, 'rv:rvA'); assert.strictEqual(by(/KTK/).after, 'hw:' + syl.hw[0].id);
  syl.revs[0].done = true; const t2 = SP.buildTasks({ syl }, D);
  assert.strictEqual(t2.find(x => /TAH/.test(x.title)).after, '', 'a done stage no longer blocks');
});

test('a new Maths lecture day: lecture first, then re-attempts; study never runs past 01:20', () => {
  const rows = day(SP.seedSyllabus()), t = studyTitles(rows), l = t.findIndex(x => /^Watch /.test(x) && /lecture 21/.test(x)), r = t.findIndex(x => /^Revise .*lecture 21/.test(x));
  assert.ok(l >= 0, 'the lecture is planned');
  assert.ok(r > l, 're-attempts begin after the lecture when time remains');
  assert.ok(!t.some(x => /TAH\/KCLS|KTK/.test(x)), 'TAH/KCLS and KTK belong to day 2 of the cycle');
  const bed = 25 * 60 + 20; for (const x of rows.filter(x => x.kind === 'study')) assert.ok(x.e <= bed, 'study ends by 01:20');
  assert.ok(rows.some(x => x.kind === 'sleep'), 'sleep stays');
});

test('over the week the same lecture reaches TAH/KCLS and then KTK on a later day', () => {
  const syl = SP.seedSyllabus(), focus = {}; for (let k = 0; k < 7; k++) { const d = new Date(D + 'T12:00:00'); d.setDate(d.getDate() + k); focus[d.toISOString().slice(0, 10)] = 'maths'; }
  const days = SP.weekPreview({ syl, sched: { wake: {}, focus } }, D, -1, C0);
  const find = re => days.findIndex(x => (x.items || []).some(r => re.test(r.title || '')));
  const l = find(/^Watch Basic Mathematics · lecture 21/), a = find(/TAH\/KCLS · Basic Mathematics · lecture 21/), k = find(/KTK · Basic Mathematics · lecture 21/);
  assert.ok(l >= 0 && a > l, 'TAH/KCLS on a later day than the lecture'); assert.ok(k >= a, 'KTK not before TAH/KCLS');
});

test('the next allocation resumes at the exact unattempted class example', () => {
  const syl = finished(), lec = 'Basic Mathematics · lecture 21';
  for (const label of ['Q1', 'Q2', 'Q3', 'Q4']) SP.qAdd(syl, { subj: 'maths', lec, page: '3', label, role: 'class' });
  for (const q of syl.qs.slice(0, 3)) SP.qMark(syl, q.id, { how: 'independent' }, D);
  const rev = SP.buildTasks({ syl }, D).find(x => x.type === 'revision');
  assert.match(rev.title, /resume at Q4/); assert.match(rev.title, /1 of 4 untouched/);
  syl.revs[0].spent = 50; assert.strictEqual(SP.buildTasks({ syl }, D).find(x => x.type === 'revision').rem, Math.max(10, SP.revMin(syl, 'maths') - 50), 'only the rest is planned, today is not lengthened');
});

test('estimates start from the handoff and are refined from real records', () => {
  const syl = SP.seedSyllabus();
  assert.strictEqual(SP.revMin(syl, 'maths'), 75); assert.strictEqual(SP.revMin(syl, 'physics'), 45); assert.strictEqual(SP.revMin(syl, 'chem'), 30);
  syl.took = { re: { maths: [40, 50, 60] } }; assert.strictEqual(SP.revMin(syl, 'maths'), 50);
});

test('one unique question is one item: same source merges roles, a solution slide is not a task', () => {
  const syl = SP.seedSyllabus(), q = { subj: 'maths', lec: 'Sets · lecture 2', page: '5', label: 'Q 3', part: 'b' };
  const a = SP.qAdd(syl, Object.assign({ role: 'class' }, q)).item, b = SP.qAdd(syl, Object.assign({}, q, { label: 'q3', role: 'tah' }));
  assert.strictEqual(b.item, a); assert.strictEqual(b.same, true); assert.deepStrictEqual([...a.roles].sort(), ['class', 'tah']);
  assert.strictEqual(syl.qs.length, 1);
  const s = SP.qAdd(syl, Object.assign({}, q, { page: '9', solution: true })); assert.strictEqual(s.solution, true); assert.strictEqual(syl.qs.length, 1, 'solution slide adds nothing');
  assert.strictEqual(SP.qAdd(syl, { subj: 'maths', lec: 'Sets · lecture 2', page: '12', label: 'Q9', solution: true }).item, null);
  assert.strictEqual(syl.qs.length, 1);
  SP.qMark(syl, a.id, { how: 'independent' }, D);
  assert.strictEqual(SP.qProgress(syl, 'maths', 'Sets · lecture 2', 'class').open, 0); assert.strictEqual(SP.qProgress(syl, 'maths', 'Sets · lecture 2', 'tah').open, 0, 'one attempt covers both');
  assert.ok(a.label && a.page && a.lec && a.part === 'b', 'source, page, label and part are kept');
});

test('an uncertain duplicate asks Ayan; yes merges, no keeps both', () => {
  const syl = SP.seedSyllabus(), A = SP.qAdd(syl, { subj: 'maths', lec: 'Sets · lecture 2', page: '5', label: 'Q3', role: 'class' }).item;
  const r = SP.qAdd(syl, { subj: 'maths', lec: 'Sets · lecture 3', page: '1', label: 'Q3', role: 'tah' });
  assert.strictEqual(r.ask, A.id); assert.strictEqual(r.item.ask, A.id); assert.strictEqual(syl.qs.length, 2, 'nothing merged without asking');
  SP.qMark(syl, r.item.id, { how: 'independent' }, D);
  SP.qConfirm(syl, r.item.id, true); assert.strictEqual(r.item.dupOf, A.id); assert.ok(A.roles.includes('tah')); assert.strictEqual(SP.qCredit(A), true, 'the attempt carries over');
  const syl2 = SP.seedSyllabus(); SP.qAdd(syl2, { subj: 'maths', lec: 'L1', label: 'Q3' }); const r2 = SP.qAdd(syl2, { subj: 'maths', lec: 'L4', label: 'Q3' });
  SP.qConfirm(syl2, r2.item.id, false); assert.ok(!r2.item.dupOf && !r2.item.ask && r2.item.notSame.length === 1);
});

test('a supported attempt never becomes independent credit; checking and doubts are separate', () => {
  const syl = SP.seedSyllabus(), q = SP.qAdd(syl, { subj: 'physics', lec: 'Laws of Motion · lecture 3', page: '2', label: 'Ex 4' }).item;
  assert.strictEqual(q.state, 'unattempted');
  SP.qMark(syl, q.id, { how: 'help' }, D); SP.qMark(syl, q.id, { checked: true }, D); SP.qMark(syl, q.id, { doubt: 'why is friction static here?' }, D);
  assert.strictEqual(q.state, 'help'); assert.strictEqual(q.retry, true); assert.strictEqual(q.checked, true); assert.strictEqual(SP.qCredit(q), false, 'checked + helped is not independent');
  assert.strictEqual(q.doubts[0].open, true);
  SP.qMark(syl, q.id, { how: 'independent' }, '2026-12-05');
  assert.strictEqual(SP.qCredit(q), true); assert.strictEqual(q.tries[0].how, 'help', 'the helped attempt is never rewritten'); assert.strictEqual(q.retry, false);
  SP.qMark(syl, q.id, { how: 'retry' }); assert.strictEqual(q.state, 'retry'); assert.strictEqual(q.tries.length, 2, 'a retry marker is not an attempt');
  assert.deepStrictEqual([...SP.Q_STATES], ['unattempted', 'independent', 'help', 'retry']);
});

test('old records still plan: no qs, no took, homework without stages', () => {
  const syl = SP.seedSyllabus(); delete syl.qs; delete syl.took;
  syl.revs.push({ id: 'rvOld', subj: 'chem', title: 'Basic Concepts · lecture 6', done: false, made: '2026-11-20' });
  syl.hw.push({ id: 'hwOld', subj: 'maths', title: 'Basic Maths L20 exercise 1-12', essential: true, mins: 45, next: 'Q9', status: 'open', made: '2026-11-20' });
  const before = JSON.stringify(syl), t = SP.buildTasks({ syl }, D);
  assert.ok(t.some(x => /exercise 1-12 · next: Q9/.test(x.title) && x.after === ''));
  assert.ok(t.some(x => x.type === 'revision' && x.subj === 'chem'));
  assert.ok(studyTitles(day(syl)).length > 0); assert.strictEqual(JSON.stringify(syl), before, 'planning never changes saved records');
});
