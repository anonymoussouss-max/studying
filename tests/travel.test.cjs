// Travel UI: one typographic voice, one way home, the daily-only writing table, and routes that keep their addresses.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const css = /<style id="kt-travel-style">([\s\S]*?)<\/style>/.exec(html)[1], js = /<script id="kt-travel-script">([\s\S]*?)<\/script>/.exec(html)[1];
test('one typographic voice, offline: shared tokens, no web fonts, tabular numerals for times', () => {
  assert.ok(!/fonts\.googleapis\.com\/css2/.test(html.slice(0, 2000)), 'no web font stylesheet in the head');
  assert.match(css, /--kt-serif:Georgia/); assert.match(css, /--kt-sans:'Segoe UI'/);
  assert.match(css, /:is\(button,input,select,textarea,optgroup\)\{font-family:var\(--kt-sans\)!important\}/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
});
test('one way home: the old strips are retired, the return control shows everywhere but home', () => {
  assert.match(css, /body\.kt-on :is\(#kg-nav,\.kv-dock,\.kv-hud,\.kv-lens,\.kq-doorbar,\.kv-spot\)\{display:none!important\}/);
  assert.match(css, /body\.kt-p-home #kt-return\{display:none\}/);
  assert.match(js, /ret\.innerHTML = '<span aria-hidden="true">↩<\/span> Return to quarters'/);
  for (const p of ['table', 'cabinet', 'library', 'plan', 'practice', 'progress', 'company', 'settings']) assert.ok(js.includes(`['${p}', '`), p + ' is a destination');
});
test('the writing table holds only the daily leaf; sessions open at the writing bench', () => {
  assert.match(css, /body\.kt-p-table #kg-main>:not\(#habit-desk\)\{display:none!important\}/);
  assert.match(css, /#hb-day-map :is\(\.hb-block-btns,\.hb-done,\.hb-caption\)/);
  assert.strictEqual((html.match(/window\.__ktWant='session';window\.MoonLab\?\.go\('today'\)/g) || []).length, 3);
  assert.match(html, /const h = sec === 'today' \? \(\/\^\(quarters\|session\|today\)\$\/\.test\(want\) \? want : want \? 'today' : 'quarters'\) : sec;/);
  assert.match(html, /history\[booted \? 'pushState' : 'replaceState'\]/, 'travel adds history entries so Back and Forward work');
});
test('motion respects reduced motion, and travel stores nothing', () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.kt-a-push,\.kt-a-drawer,\.kt-a-volume,\.kt-a-pull,\.kt-a-walk\{animation:none!important\}\}/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.ok(!/localStorage\.setItem|indexedDB/.test(js), 'navigation state is derived, never saved');
  assert.match(html, /vid\.addEventListener\('pause', \(\) => save\(true\)\)/, 'leaving a lecture saves its position');
});
