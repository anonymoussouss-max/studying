// Tests for the dated C exam plan (IT23102, Thu 26 Nov 2026): it uses study time the day already has, stays inside the
// gentle-return maximum, and is gone after Thursday. All fixtures are synthetic. Run: node --test tests/cexam.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } };
ctx.globalThis = ctx; vm.runInNewContext(src, ctx); const SP = ctx.StudyPlan;
const C0 = { actual14: {}, loggedAny: false, diplomaToday: 0 };
const day = (d, gentle) => SP.templateDay({ syl: SP.seedSyllabus(), sched: { wake: { [d]: 720 }, gentle } }, d, new Date(d + 'T12:00:00').getDay(), -1, Object.assign({}, C0));
const study = t => t.rows.filter(r => r.kind === 'study'), sum = rs => rs.reduce((n, r) => n + r.e - r.s, 0);
const cx = t => study(t).filter(r => /^C exam/.test(r.title || ''));

const at = rs => JSON.stringify(rs.map(r => [r.s, r.e]));
const CORE = [[1020, 1060], [1080, 1120], [1140, 1170]], OPT = [[1200, 1230], [1260, 1290]];

test("Mon-Wed follow Ayan's timetable: core 5:00, 6:00, 7:00-7:30, optional 8:00 and 9:00; C replaces other study", () => {
  for (const d of ['2026-11-23', '2026-11-24', '2026-11-25']) {
    const t = day(d, { on: true, max: 180 });
    assert.strictEqual(at(study(t)), JSON.stringify(CORE.concat(OPT)), d);
    assert.strictEqual(cx(t).length, 5, d + ' all study is C');
    for (const id of ['lunch', 'snacks', 'personal', 'dinner']) { const r = t.rows.find(x => x.id === id); assert.ok(!r || !study(t).some(s => s.s < r.e && r.s < s.e), d + ' ' + id + ' untouched'); }
  }
});

test('the gentle maximum still rules: core first, optional only if it fits; Done for today or no maximum plans nothing', () => {
  assert.strictEqual(at(study(day('2026-11-24', { on: true, max: 120 }))), JSON.stringify(CORE), '120 min: core only');
  assert.strictEqual(sum(study(day('2026-11-24', { on: true, max: 60 }))), 40, '60 min: only what fits whole');
  assert.strictEqual(study(day('2026-11-24', { on: true })).length, 0, 'no maximum');
  assert.strictEqual(study(day('2026-11-24', { on: true, max: 180, day: { '2026-11-24': { stopped: true } } })).length, 0, 'done for today');
  assert.strictEqual(at(study(day('2026-11-24'))), JSON.stringify(CORE.concat(OPT)), 'gentle return off: the whole timetable');
});

test('exam day has no block, and from Friday the plan is gone', () => {
  assert.ok(SP.cExam('2026-11-26'), 'Thursday card');
  assert.strictEqual(cx(day('2026-11-26', { on: true, max: 180 })).length, 0, 'no block on exam day');
  assert.strictEqual(SP.cExam('2026-11-27'), null);
  assert.strictEqual(cx(day('2026-11-27', { on: true, max: 180 })).length, 0);
  assert.strictEqual(SP.cExam('2026-11-22'), null, 'and nothing before');
  assert.match(html, /const x = SP\.cExam\(day\(\)\); if \(!x\) return '';/, 'the card hides itself');
});

test('the answer bank is in the desk: every question has an answer and a memory line, with unique ids', () => {
  const bank = /<template id="kg-cexam-bank">([\s\S]*?)<\/template>/.exec(html)[1];
  const ids = [...bank.matchAll(/<details class="q" id="([^"]+)">/g)].map(m => m[1]);
  assert.ok(ids.length >= 60, ids.length + ' questions');
  assert.strictEqual(new Set(ids).size, ids.length, 'unique');
  for (const part of bank.split('<details class="q"').slice(1)) assert.match(part, /class="hook"/);
  assert.ok(!/class="mermaid"/.test(bank), 'flowcharts are plain text in the desk');
  for (const m of [...bank.matchAll(/href="#(q[\d-]+)"/g)]) assert.ok(ids.includes(m[1]), 'Top 10 link ' + m[1]);
});

test("Iroha's test: model answers go only to Iroha, one question at a time; results are only ever added", () => {
  assert.match(html, /window\.__kgProofNote = \(\) => \{ let out = ''; try \{ out = base \? base\(\) \|\| '' : ''; \} catch \(e\) \{\} return out \+ testNote\(\); \}/);
  assert.match(html, /never show it before I have tried/);
  assert.match(html, /C\.results\.push\(\{ d: day\(\), id, r, t: Date\.now\(\) \}\)/);
  assert.ok(!/C\.results\s*=\s*\[|results\.(splice|pop|shift)\(/.test(html.slice(html.indexOf('id="kg-cexam-script"'))), 'no result is removed');
  assert.match(html, /const x = SP\.cExam\(day\(\)\); if \(!x\) return '';/, 'the card still hides itself after Thursday');
});

test('a test on only the ticked answers, and Check my work sends one screenshot with hints, never the answer', () => {
  const s = html.slice(html.indexOf('id="kg-cexam-script"'));
  assert.match(s, /const ticked = mod => QS\.filter\(q => X\(\)\.learned\[q\.id\]/, 'ticked test draws only from learned answers');
  assert.match(s, /ids = tk \? pickTicked\(tmod\) : pick\(\)/);
  assert.match(s, /never paste it or reveal it in full/);
  assert.match(s, /with a hint toward the fix, not the fixed code/);
  assert.match(s, /Don't give a mark; I decide Got it or Review/);
  assert.match(html, /!window\.__kgShortBreak && !window\.__kgCxTest\?\.\(\) && !waiting/, 'no random screen-watch questions during a C test');
});

test('the card knows when the core sittings are over (past rows keep their cx id)', () => {
  assert.ok(html.includes(String.raw`/^cx\d/.test(r.id || '')); doneC = x.mins > 0 && !!rows.length && rows.filter(r => !r.optional).every(r => r.past)`));
  assert.match(html, /'2026-11-26':\{what:'Exam at 10:00 AM\./, 'Thursday: no early blocks, sleep unchanged');
});

test('schedule blocks can be ticked done without the timer: one ordinary session per block, only ever added', () => {
  assert.match(html, /'block-done':el=>/, 'the action exists');
  assert.match(html, /if\(h\.sessions\.some\(s=>s\.date===today\(\)&&s\.block===b\.id\)\)\{toast\('This block is already marked done\.'\)/, 'one per block per day');
  assert.match(html, /h\.sessions\.push\(s\);save\(\);render\(\);toast\(`Logged \$\{m\} min/, 'saved as a session, so tracking counts it');
  assert.match(html, /b\.start<=nowOff\?button\('✓ Done','block-done'/, 'only blocks that have started');
  assert.ok(html.includes(String.raw`/^diploma|(^|-)cx\d/.test(b.id)?'Diploma'`), 'C exam blocks count as diploma study');
});

test("Today's schedule sits above the C card, and the Study tab has an independent session with no recall", () => {
  assert.ok(html.includes('body.kg-sec-today #kg-main .kg-cexam{order:2}'), 'C card after the day map (order 1)');
  assert.ok(html.includes("free:!!values.free,noRecall:!!values.free||"), 'independent sessions skip recall');
  assert.ok(html.includes("if (a.free) values={...values,win:String(values.win||'').trim()||'Independent session',mood:values.mood||'calm'};"), 'no note or mood required');
  assert.ok(html.includes('<form data-f="freesess"'), 'Study tab card');
  assert.ok(html.includes("begin({phone:true,free:true,"), 'starts the normal desk timer, so the minutes count');
});

test("every program in the answer bank has an explanation (the teacher asked for them), and programs show their output", () => {
  const bank = /<template id="kg-cexam-bank">([\s\S]*?)<\/template>/.exec(html)[1];
  for (const part of bank.split('<details class="q"').slice(1)) {
    const id = /id="([^"]+)"/.exec(part)[1];
    if (part.includes('<pre><code>')) assert.ok(part.includes('<div class="expl"><p class="expl-h">Explanation</p>'), id + ' has an explanation');
    if (/class="qt">Program/.test(part)) assert.ok(part.includes('<p class="expl-h">Output</p>'), id + ' shows its output');
  }
});
