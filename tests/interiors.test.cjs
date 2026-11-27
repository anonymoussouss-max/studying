// Interiors: specimen drawers and slip, archive contents page and return-to-row, terrace day/week/forecast.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const css = /<style id="kt-interior-style">([\s\S]*?)<\/style>/.exec(html)[1];
test('Gu repository: specimen label, evidence slip, back to the drawer you came from', () => {
  assert.ok(html.includes('<dl class="kqc-label"><dt>Chapter</dt>') && html.includes('<div class="kqc-slip">'));
  assert.ok(html.includes("ret = t.closest && t.closest('[data-qrow]') ? { key: d.qsel, y: scrollY } : null"));
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
