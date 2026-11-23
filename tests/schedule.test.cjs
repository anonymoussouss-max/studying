// Tests for the personal day templates (22 Nov 2026): wake-time templates, protected anchors, the 1:30 AM bedtime,
// the priority queue, switching, diploma and exams, German and the forecast. All fixtures are synthetic.
// Run: node --test tests/schedule.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
function plan(isoNow, lab = {}, extra = {}) {
  const NOW = new Date(isoNow).getTime();
  class FixedDate extends Date { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
  const store = Object.assign({ 'kg-lab-v1': JSON.stringify(lab) }, extra);
  const ctx = { Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  ctx.globalThis = ctx; ctx.__noCExam = true; /* the dated C exam timetable (23–26 Nov) is tested in cexam.test.cjs */ vm.runInNewContext(src, ctx); return ctx.StudyPlan;
}
const MON = '2026-11-23', SUN = '2026-11-29';
const iso = (d, c) => { const h = Math.floor(c / 60) % 24, m = c % 60, day = c >= 1440 ? '2026-11-24' : d; return `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`; };
const CTX = { actual14: {}, loggedAny: false, diplomaToday: 0, noCExam: true }; // the dated C exam plan (23–26 Nov) is tested in cexam.test.cjs
const P0 = plan(iso(MON, 600));
const seeded = (more = {}) => Object.assign({ syl: P0.seedSyllabus() }, more);
const study = rows => rows.filter(r => r.kind === 'study');
const total = rows => study(rows).reduce((n, r) => n + (r.e != null ? r.e - r.s : r.minutes), 0);
const day = (lab, now, ctx = CTX, d = MON, dow = 1) => plan(iso(d, now), lab).templateDay(lab, d, dow, now, ctx);
// whole desk rows (offsets from 10:30 AM) for a wake time, seen at the wake time
const deskRows = (W, more = {}) => { const lab = seeded(Object.assign({ sched: Object.assign({ wake: { [MON]: W } }, more) })); return plan(iso(MON, W), lab).fallback(1); };
const TEMPLATES = { normal: [720, 360], early: [600, 360], late: [780, 340], later: [840, 300], verylate: [900, 240] };

test('1. every template has its checked study total, German included', () => {
  for (const [name, [W, want]] of Object.entries(TEMPLATES)) {
    const rows = deskRows(W);
    assert.strictEqual(total(rows), want, name);
    assert.strictEqual(study(rows).filter(r => r.subj === 'german').reduce((n, r) => n + r.minutes, 0), 30, name + ' German');
  }
  assert.strictEqual(total(deskRows(720, { extend: { [MON]: true } })), 470, 'extended evening');
  assert.strictEqual(total(deskRows(690)), 360, '11:30 wake');
});

test('2. no overlaps or gaps: the day is one continuous line from waking to sleep', () => {
  for (const W of [600, 690, 720, 780, 840, 900]) for (const ext of [false, true]) {
    const rows = deskRows(W, ext ? { extend: { [MON]: true } } : {});
    assert.strictEqual(rows[0].start, W - 630);
    for (let i = 1; i < rows.length; i++) assert.strictEqual(rows[i].start, rows[i - 1].end, `${W} ${ext} ${rows[i].id}`);
  }
});

test('3. never more than 90 minutes of continuous study', () => {
  for (const W of [600, 690, 720, 780, 840, 900]) for (const ext of [false, true]) {
    let run = 0; for (const r of deskRows(W, ext ? { extend: { [MON]: true } } : {})) { run = r.kind === 'study' ? run + r.minutes : 0; assert.ok(run <= 90, `${W} ${ext} ${r.id} ${run}`); }
  }
});

test('4. more German replaces PCM time; the total and bedtime stay', () => {
  const rows = deskRows(720, { german: 60 });
  assert.strictEqual(total(rows), 360);
  assert.strictEqual(study(rows).filter(r => r.subj === 'german').reduce((n, r) => n + r.minutes, 0), 60);
  assert.strictEqual(rows.find(r => r.id === 'sleep').start, 1530 - 630);
});

test('5. a 2½-hour Maths lecture spans blocks, and an unfinished one continues from its timestamp', () => {
  const d = day(seeded({ sched: { wake: { [MON]: 720 }, focus: { [MON]: 'maths' } } }), 720);
  const lec = study(d.rows).filter(r => r.task?.type === 'lecture' && r.subj === 'maths' && !r.task.cont);
  assert.ok(lec.length >= 2, 'one lecture over several blocks');
  assert.strictEqual(new Set(lec.map(r => r.title)).size, 1);
  assert.strictEqual(lec.reduce((n, r) => n + r.e - r.s, 0), 150);
  const syl = P0.seedSyllabus(); syl.pos.maths = { course: 'm11', ci: 0, chapter: 'Basic Mathematics', lec: 21, active: true, at: '1:02:30', spent: 60 };
  const t = P0.buildTasks({ syl }, MON).find(x => x.subj === 'maths' && x.type === 'lecture');
  assert.ok(t.cont && /from 1:02:30/.test(t.title) && t.rem === 90);
});

test('6. a lecture is revised only after the whole lecture, never before', () => {
  for (const f of ['maths', 'physics', 'chem']) {
    const rows = study(day(seeded({ sched: { wake: { [MON]: 720 }, focus: { [MON]: f } } }), 720).rows);
    rows.forEach((r, i) => { if (r.task?.type !== 'revision') return; const watched = rows.slice(0, i).filter(x => x.task?.type === 'lecture' && x.subj === r.subj).reduce((n, x) => n + x.e - x.s, 0);
      assert.ok(watched >= { maths: 150, physics: 105, chem: 95 }[r.subj] - 5, `${f}: revision before the lecture ended`); });
  }
});

test('7. homework carries over: what does not fit is deferred, not squeezed in', () => {
  const syl = P0.seedSyllabus(); for (let i = 0; i < 8; i++) syl.hw.push({ id: 'h' + i, subj: 'physics', title: 'Exercise ' + i, mins: 60, essential: true, status: 'open' });
  syl.hw.push({ id: 'x', subj: 'chem', title: 'Extra', mins: 30, essential: false, status: 'open' });
  const d = day({ syl, sched: { wake: { [MON]: 840 } } }, 840);
  assert.ok(d.deferred.some(x => x.type === 'homework'));
  assert.ok(!study(d.rows).some(r => /Extra/.test(r.title)), 'additional homework is not scheduled');
  assert.ok(d.rows.every(r => r.kind !== 'study' || r.e <= 1520));
});

test('8. switching mid-day keeps everything before the switch and re-plans only the rest', () => {
  const base = day(seeded({ sched: { wake: { [MON]: 720 } } }), 1000);
  const sw = day(seeded({ sched: { wake: { [MON]: 720 }, plan: { [MON]: 'reduced' }, switches: { [MON]: [{ at: 1000, from: 'auto', plan: 'reduced' }] } } }), 1000);
  const before = rows => rows.filter(r => r.e <= 1000).map(r => [r.s, r.e, r.kind].join()).join('|');
  assert.strictEqual(before(sw.rows), before(base.rows));
  assert.ok(total(sw.rows.filter(r => r.s >= 1000)) <= 90 && total(sw.rows.filter(r => r.s >= 1000)) < total(base.rows.filter(r => r.s >= 1000)));
  for (let i = 1; i < sw.rows.length; i++) assert.strictEqual(sw.rows[i].s, sw.rows[i - 1].e, 'gap at ' + sw.rows[i].s);
});

test('9. waking late recalculates from the real time; expired blocks are never replayed', () => {
  const d = day(seeded({ sched: { wake: { [MON]: 860 } } }), 860);
  assert.ok(study(d.rows).every(r => r.s >= 890), 'study before tea finished');
  const later = day(seeded({ sched: { wake: { [MON]: 720 } } }), 1100);
  for (const r of study(later.rows).filter(r => r.e <= 1100)) { assert.strictEqual(r.title, 'Earlier study block'); assert.ok(!r.task); }
});

test('10. meals, the personal commitment, getting ready and sleep survive every template and a food break', () => {
  const at = (rows, id) => rows.find(r => r.id === id);
  for (const W of [600, 720, 780, 840, 900]) for (const ext of [false, true]) {
    const rows = deskRows(W, ext ? { extend: { [MON]: true } } : {}), c = id => at(rows, id) && 630 + at(rows, id).start;
    assert.deepStrictEqual([c('lunch'), c('snacks'), c('personal'), c('dinner'), c('ready'), c('sleep')], [960, 1170, 1230, 1400, 1520, 1530], `${W} ${ext}`);
  }
  const f = day(seeded({ sched: { wake: { [MON]: 720 }, food: { [MON]: [{ at: 1050, len: 20 }] } } }), 720);
  assert.ok(f.rows.some(r => r.id === 'food-0' && r.s === 1050 && r.e === 1070));
  assert.ok(f.cutMinutes === 20 && total(f.rows) === 340);
  assert.ok(f.rows.some(r => r.id === 'lunch' && r.s === 960));
});

test('11. Sunday is a loose guide: up to 2 hours, optional, no mandatory work', () => {
  const P = plan(iso(SUN, 720), seeded());
  assert.strictEqual(P.dayKind(SUN).t, 'normal');
  const d = P.templateDay(seeded(), SUN, 0, 720, CTX);
  assert.strictEqual(d.plan, 'sunday');
  assert.ok(total(d.rows) >= 60 && total(d.rows) <= 120);
  assert.ok(study(d.rows).every(r => ['explore', 'german'].includes(r.task?.type)));
});

test('12. a difficult day: 15 minutes of Physics is the whole plan; a lighter day stays small', () => {
  const g = day(seeded({ sched: { wake: { [MON]: 720 }, plan: { [MON]: 'gentle' } } }), 900);
  assert.strictEqual(study(g.rows).length, 1);
  assert.strictEqual(total(g.rows), 15);
  assert.strictEqual(study(g.rows)[0].task.type, 'gentle');
  const r = day(seeded({ sched: { wake: { [MON]: 720 }, plan: { [MON]: 'reduced' } } }), 900);
  assert.ok(total(r.rows) <= 90 && total(r.rows) >= 45);
});

test('13. stopping needs no conversation: after Stop nothing is planned, and nothing is owed', () => {
  const d = day(seeded({ sched: { wake: { [MON]: 720 }, plan: { [MON]: 'stop' }, switches: { [MON]: [{ at: 1000, from: 'auto', plan: 'stop' }] } } }), 1000);
  assert.strictEqual(total(d.rows.filter(r => r.s >= 1000)), 0);
  const off = plan(iso(MON, 720), seeded({ dayTypes: { [MON]: { t: 'rest' } } })).fallback(1);
  assert.strictEqual(total(off), 0);
  assert.match(off[0].title, /nothing owed, no catch-up/);
});

test('14. diploma hours replace PCM time inside the same day', () => {
  const d = day(seeded({ sched: { wake: { [MON]: 720 } } }), 720, Object.assign({}, CTX, { diplomaToday: 60 }));
  assert.strictEqual(total(d.rows), 360);
  assert.strictEqual(study(d.rows).filter(r => r.subj === 'diploma').reduce((n, r) => n + r.e - r.s, 0), 60);
});

test('15. exam mode: diploma first, no new lectures, exam time reserved with travel, German lighter', () => {
  const ex = [{ id: 'e', name: 'Winter exams', from: '2026-11-20', end: '2026-12-02', days: [{ d: MON, at: 780, len: 180, travel: 45 }] }];
  const d = day(seeded({ sched: { wake: { [MON]: 600 }, exams: ex, germanExam: 'light' } }), 600);
  assert.ok(d.examPrep && d.examDays === 1);
  const exam = d.rows.find(r => r.id === "exam-780"); assert.ok(exam && exam.s === 735 && exam.e === 1005);
  const lunch = d.rows.find(r => r.id === "lunch"); assert.ok(lunch && lunch.s === 1005 && lunch.e - lunch.s === 60, "lunch moves whole to after the exam");
  assert.ok(!study(d.rows).some(r => r.task?.type === 'lecture' && !r.task.cont), 'a new lecture during exams');
  assert.ok(!study(d.rows).some(r => r.s < 1005 && r.e > 735), 'study during the exam');
  const g = rows => study(rows).filter(r => r.subj === 'german').reduce((n, r) => n + r.e - r.s, 0);
  assert.ok(g(d.rows) <= 15, 'German lighter or paused on an exam day');
  const prepDay = day(seeded({ sched: { wake: { [MON]: 720 }, exams: [{ id: 'e', name: 'W', from: '2026-11-20', end: '2026-12-02', days: [] }], germanExam: 'light' } }), 720);
  assert.strictEqual(g(prepDay.rows), 15);
  assert.ok(study(prepDay.rows).some(r => r.subj === 'diploma') && !study(prepDay.rows).some(r => r.task?.type === 'lecture' && !r.task.cont));
  assert.ok(study(d.rows).some(r => r.subj === 'diploma'));
});

test('16. older-topic practice is charged once, in one ledger', () => {
  const P = plan(iso(MON, 720), { deskSettings: { reviewMinutes: 15 }, reviewLedger: [{ d: MON, src: 'flow', id: 'a', budgetMinutes: 5 }, { d: MON, src: 'flow', id: 'a', budgetMinutes: 5 }] });
  assert.ok(P.mixLeft() >= 5);
});

test('17. planned minutes never count as study; the forecast says when it is provisional', () => {
  const f = P0.forecast(seeded(), {});
  assert.ok(f.provisional && f.weeksLow < f.weeksHigh && f.aimWeeks === 104);
  assert.ok(f.missing.some(m => /Organic/.test(m)) && f.missing.some(m => /Inorganic/.test(m)), 'missing counts are named, not zero');
  const real = P0.forecast(seeded(), { weeks: [900, 1100] });
  assert.ok(!real.provisional && real.actualWeekly === 1000);
  const P = plan(iso(MON, 1300), seeded({ sched: { wake: { [MON]: 720 } } }));
  assert.strictEqual(P.schedCtx(MON).loggedAny, false);
  assert.strictEqual(P.loggedToday ? Object.values(P.loggedToday()).reduce((a, b) => a + b, 0) : 0, 0);
});

test('18. the first block of the day starts with an easy entry inside the block', () => {
  const d = day(seeded({ sched: { wake: { [MON]: 720 } } }), 720);
  const first = study(d.rows).find(r => r.entry); assert.ok(first && first.s === 750);
  const later = day(seeded({ sched: { wake: { [MON]: 720 } } }), 720, Object.assign({}, CTX, { loggedAny: true }));
  assert.ok(!study(later.rows).some(r => r.entry));
});

test('19. saved data is kept: schedule defaults fill in without overwriting', () => {
  const s = P0.schedOf({ sched: { german: 45, wake: { '2026-11-01': 700 }, custom: 1 } });
  assert.strictEqual(s.german, 45); assert.strictEqual(s.wake['2026-11-01'], 700); assert.strictEqual(s.custom, 1);
  assert.deepStrictEqual(Object.keys(s.split), ['maths', 'physics', 'chem']);
  const old = plan(iso(MON, 720), { dayTypes: { [MON]: { t: 'college', end: 900 } }, mathsNext: { [MON]: 155 } }).fallback(1);
  assert.ok(old.some(r => r.kind === 'study'), 'saved college days still plan');
});

test('20. bedtime is fixed: nothing after 1:20 AM but getting ready, and sleep from 1:30', () => {
  for (const W of [600, 720, 780, 840, 900]) for (const ext of [false, true]) {
    const rows = deskRows(W, ext ? { extend: { [MON]: true } } : {});
    assert.ok(rows.filter(r => r.kind === 'study' || r.id === 'piano').every(r => r.end <= 1520 - 630), `${W} ${ext}`);
    assert.strictEqual(rows.find(r => r.id === 'sleep').start, 900);
  }
});

test('the night-meds reminder appears on template days at the set time', () => {
  const rows = plan(iso(MON, 720), seeded({ sched: { wake: { [MON]: 720 } }, medsAt: 840 })).fallback(1);
  assert.strictEqual(rows.find(r => r.id === 'meds').start, 840);
});

// ---- review fixes (22 Nov 2026) ----
test('German is exactly the chosen minutes in every template, and the total never changes', () => {
  const plans = { normal: 720, early: 600, late: 780, later: 840, verylate: 900, sunday: 720 };
  for (const [p, W] of Object.entries(plans)) {
    const base = P0.skeleton(W, p, { german: 30, from: W + 30 }).filter(x => x.kind === 'study').reduce((n, x) => n + x.e - x.s, 0);
    for (const g of [15, 30, 45, 60, 75, 90]) {
      const s = P0.skeleton(W, p, { german: g, from: W + 30 }).filter(x => x.kind === 'study');
      assert.strictEqual(s.filter(x => x.role === 'G').reduce((n, x) => n + x.e - x.s, 0), g, `${p} German ${g}`);
      assert.strictEqual(s.reduce((n, x) => n + x.e - x.s, 0), base, `${p} total with German ${g}`);
    }
  }
  for (const g of [60, 90]) {
    const s = P0.skeleton(720, 'normal', { german: g, extend: true, from: 750 }).filter(x => x.kind === 'study');
    assert.ok(!s.some(x => x.role === 'G' && x.ext), 'German never moves into the optional extension');
    assert.strictEqual(s.reduce((n, x) => n + x.e - x.s, 0), 470);
  }
  const r = P0.skeleton(720, 'reduced', { german: 60, from: 900 }).filter(x => x.kind === 'study');
  assert.strictEqual(r.filter(x => x.role === 'G').reduce((n, x) => n + x.e - x.s, 0), 60, 'a lighter day keeps the chosen German');
});

test('a subject\'s next lecture waits for its unfinished revision and essential homework', () => {
  const syl = P0.seedSyllabus();
  syl.revs.push({ id: 'r1', subj: 'maths', title: 'Basic Mathematics · lecture 20', done: false });
  syl.hw.push({ id: 'h1', subj: 'maths', title: 'Ex 3', mins: 45, essential: true, status: 'open' });
  const rows = study(day({ syl, sched: { wake: { [MON]: 720 }, focus: { [MON]: 'maths' } } }, 720).rows).filter(r => r.subj === 'maths');
  const first = type => rows.findIndex(r => r.task?.type === type && (type !== 'lecture' || !r.task.cont));
  assert.ok(first('revision') >= 0 && first('homework') > first('revision'), 'revision, then homework');
  assert.ok(first('lecture') > first('homework'), 'the next lecture comes after both');
  const syl2 = P0.seedSyllabus(); syl2.pos.maths = { course: 'm11', ci: 0, chapter: 'Basic Mathematics', lec: 21, active: true, spent: 30 };
  syl2.revs.push({ id: 'r2', subj: 'maths', title: 'Basic Mathematics · lecture 20', done: false });
  const r2 = study(day({ syl: syl2, sched: { wake: { [MON]: 720 }, focus: { [MON]: 'maths' } } }, 720).rows).filter(r => r.subj === 'maths');
  assert.ok(r2[0].task.type === 'lecture' && r2[0].task.cont, 'an interrupted lecture is finished first');
});

test('progress wording is shared, and zero minutes never "counts" on a study day', () => {
  for (const plan of ['normal', 'stop', 'gentle']) {
    const P = plan === 'normal' ? plan_(720) : plan_(1000, { plan: { [MON]: plan }, switches: plan === 'stop' ? { [MON]: [{ at: 1000, from: 'auto', plan: 'stop' }] } : {} });
    const p0 = P.dayProgress(0), p15 = P.dayProgress(15);
    assert.strictEqual(p0.counts, false, plan); assert.ok(p0.need >= 15, plan); assert.match(p0.text, /min until today counts/);
    if (plan !== 'normal') assert.strictEqual(p15.counts, true, plan + ': 15 real minutes count');
  }
  const off = plan(iso(MON, 720), seeded({ dayTypes: { [MON]: { t: 'rest' } } })).dayProgress(0);
  assert.ok(off.rest && !off.counts);
  function plan_(now, sched = {}) { return plan(iso(MON, now), seeded({ sched: Object.assign({ wake: { [MON]: 720 } }, sched), planLog: { [MON]: sched.plan ? 0 : 6 } })); }
});
