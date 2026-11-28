// Interiors: specimen drawers and slip, archive contents page and return-to-row, terrace day/week/forecast.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const css = /<style id="kt-interior-style">([\s\S]*?)<\/style>/.exec(html)[1];
test('Gu repository: specimen label, evidence slip, back to the drawer you came from', () => {
  assert.ok(html.includes('<dl class="kqc-label"><dt>Chapter</dt>') && html.includes('<div class="kqc-slip">'));
  assert.ok(html.includes("ret = row ? { key: d.qsel, y: scrollY } : null"));
  assert.ok(html.includes('data-qret="1">← Back to cabinet'));
  assert.match(css, /li\[data-qrow\]::after/, 'drawer pull');
});
test('archive: contents page, return to the lecture row, no duplicate resume block', () => {
  assert.ok(html.includes('<nav class="klib-toc" aria-label="Contents">') && html.includes('Pending assessment'));
  assert.ok(html.includes('data-from="${esc(l.id)}"') && html.includes("classList.add('klib-back')"));
  assert.ok(!html.includes('<div class="klib-resume"><span>${lecState(s.lec[lk(c.id, r.id)])'));
});
test('terrace: one time column, a shared week axis, a forecast marked provisional; nothing stored', () => {
  assert.ok(html.includes('<ol class="kt-ledger">') && html.includes('class="kt-week"') && html.includes('FORECAST · NOT A PLAN'));
  assert.match(css, /\.kt-ledger li\{display:grid;grid-template-columns:4\.6em 4\.6em/);
  const card = html.slice(html.indexOf("let tv = 'day';"), html.indexOf('function card()'));
  assert.ok(!/localStorage|L\.\w+\s*=/.test(card), 'view choice is not saved');
});
test('question banks load from the site root only', () => { assert.ok(!html.includes("['data/' + f, f]")); });
test('forecast: planner and progress share one calculation; real-study forecast appears only with two logged weeks', () => {
  const vm = require('vm'), src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
  const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; ctx.__noCExam = true; vm.runInNewContext(src, ctx);
  const SP = ctx.StudyPlan, L = { syl: SP.seedSyllabus() }; SP.applyConfirmed11(L.syl);
  const none = SP.forecast(L, { weeks: [] }), one = SP.forecast(L, { weeks: [900] }), two = SP.forecast(L, { weeks: [900, 1100] });
  assert.strictEqual(none.actual, null); assert.strictEqual(none.provisional, true); assert.strictEqual(one.actual, null, 'one week is not history');
  assert.ok(two.actual && two.actual.weeksUsed === 2 && two.provisional === false); assert.strictEqual(two.actual.weekly, 1000);
  assert.deepStrictEqual([none.pace.weeksLow, none.pace.weeksHigh], [two.pace.weeksLow, two.pace.weeksHigh], 'the hypothetical pace ignores history');
  assert.ok(html.includes("const wk = M.weeksHistory ? M.weeksHistory() : [], f = SP().forecast(L, { weeks: wk })") && html.includes('M.weeksHistory = weeksHistory;'));
});
test('observatory: every milestone opens its evidence; states are told apart in words; focus returns to the milestone', () => {
  assert.ok(html.includes('data-a="rev" data-g="${g.id}">Evidence for ${esc(g.name)} →'));
  for (const t of ['Earned · refresh requested', 'Earned · permanent', 'Provisional criterion · not counted until you approve it', 'Missing evidence', 'Still needed', 'Satisfies']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('data-qdetail="${esc(x.key)}">Proof and retention'), 'chapter records link to proof and retention');
  assert.ok(html.includes('document.querySelector(`[data-a="rev"][data-g="${CSS.escape(id || \'\')}"]`)'), 'back restores focus to the milestone');
});
test("steward's station: a ledger index; backup and restore are separate controls", () => {
  assert.ok(html.includes("['app', '📱 Appearance & app']"));
  assert.ok(html.includes('data-a="fullbackup">⬇ Download a full backup') && html.includes('data-a="ktrestore">⬆ Restore from a backup file…'));
  assert.ok(html.includes("M.ACTIONS.ktrestore = () => { const i = document.getElementById('kg-fullrestore'); if (i) i.click(); };"));
});
test('desk targets (exam date, Class 12 scenario, Khazana, full forecast) stay reachable on the calendar terrace', () => {
  assert.ok(html.includes('M.deskTargetsHTML = () =>') && html.includes('DESK TARGETS · CLASS 12 SCENARIO · KHAZANA · FULL FORECAST'));
});
