// Travel motion: one cancellable movement per click, timings in range, reduced motion instant, earning shown once and never stored.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = html.slice(html.indexOf('<script id="kt-travel-script">'), html.indexOf('</script>', html.indexOf('<script id="kt-travel-script">')));
const block = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
test('travel between places takes 280–360 ms; local moves 160–220 ms', () => {
  const travel = block('const MOVE = {', '  function travel(p)');
  const t = [...travel.matchAll(/\}, (\d+)\)/g)].map(m => +m[1]); assert.ok(t.length >= 9);
  for (const ms of t) assert.ok(ms >= 280 && ms <= 360, 'travel ' + ms);
  const local = [...src.slice(src.indexOf('function inner(')).matchAll(/(?:\}, |flip\([^)]*, )(\d+)(?:, true)?\)/g)].map(m => +m[1]).filter(ms => ms < 280);
  assert.ok(local.length >= 5); for (const ms of local) assert.ok(ms >= 160 && ms <= 220, 'local ' + ms);
});
test('a new movement, Back or another destination cancels the last; reduced motion plays nothing', () => {
  assert.ok(src.includes("function travel(p) { cancelMotion();"));
  assert.ok(src.includes("addEventListener('popstate', cancelMotion);"));
  assert.ok(src.includes("if (!el || !el.animate || still()) return null;"), 'every movement goes through play(), which is a no-op when still');
  assert.ok(!/setTimeout\([^)]*(location|M\.go|save)/.test(block('function play(', 'const to =')), 'nothing waits for an animation');
  assert.ok(html.includes('@media(prefers-reduced-motion:reduce){.kt-fx{display:none!important}'));
});
test('at most a foreground layer and a backdrop', () => {
  const travel = block('const MOVE = {', '  function travel(p)');
  for (const line of travel.split('\n').filter(l => /^\s+\w+: \(\) =>/.test(l))) assert.ok((line.match(/\b(move|fx)\(/g) || []).length <= 2, line.trim().slice(0, 40));
});
test('return to quarters lands on the room object, or the doorway when you came through it', () => {
  assert.ok(src.includes("const OBJ = { table: '[data-kv=\"today\"]', cabinet: '[data-qgo=\"study:cultivation\"]', library: '[data-qgo=\"library:courses\"]'"));
  assert.ok(src.includes("door = entered[from] === 'doorway' || !OBJ[from]"));
  assert.ok(src.includes("el.focus({ preventScroll: true }); el.classList.add('kt-lantern');"));
});
test('earning: set by the award event, taken once, never stored', () => {
  const api = block('const pend = new Map()', 'window.KtTravel =');
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(api), 'in memory only, so reload / sync / restore show the state at once');
  assert.ok(html.includes("window.KtMotion?.award(was === 'none' && now !== 'none' ? 'ink'"), 'course Gu: from the successful grade');
  assert.ok(html.includes("const save = (s, what) => { window.KtMotion?.arm();"), 'chapter Gu: armed only on an award path');
  assert.ok(html.includes("lecturedone: o => { window.KtMotion?.arm();"));
  assert.ok(html.includes("const mk = g.stage !== 'none' && window.KtMotion ? window.KtMotion.take('cgu:' + c.id) : '';"));
});
test('cabinet round trip: drawer forward, label into the slip, back into the same drawer with scroll and focus', () => {
  assert.ok(html.includes('window.KtMotion.drawerOpen(g, from)') && html.includes('window.KtMotion.drawerClose(b.closest(\'[data-qrow]\'), from)'));
  assert.ok(html.includes("scrollTo(0, r ? r.y : 0);") && html.includes("if (innerWidth <= 720) scrollTo(0, scrollY + lab.getBoundingClientRect().top - off - 8)"));
});
