// Moving around mid-session: leaving practice steps out of the shh view without touching the timer; resuming restores it.
// The Writing Table has one entrance, and an unread pavilion letter is drawn once, after travel.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const travel = html.slice(html.indexOf('<script id="kt-travel-script">'), html.indexOf('</script>', html.indexOf('<script id="kt-travel-script">')));
const awayFn = html.slice(html.indexOf('away(on){'), html.indexOf('},', html.indexOf('away(on){')) + 1);

test('stepping away from a session leaves the shh view and keeps the timer as it was', () => {
  assert.ok(awayFn, 'HabitDesk.away exists');
  assert.ok(!/running|pause\(|lastStart|accruedMs/.test(awayFn), 'away never starts, pauses or edits the timer');
  assert.match(awayFn, /if\(h\.shh\)\{h\.shh=false;h\.shhAway=true;save\(\);render\(\);\}/);
  assert.match(awayFn, /else if\(h\.shhAway\)\{delete h\.shhAway;if\(h\.active\.phase!=='closeout'\)h\.shh=true;/, 'coming back restores the shh view, never in close-out');
  // ending, finishing or toggling the session clears the marker
  assert.ok(html.includes("h.shh=false;delete h.shhAway;$('hb-session-card')") || html.includes("view='start';h.shh=false;delete h.shhAway;"));
  assert.ok(html.includes('h.sessions.push(s);h.active=null;h.shh=false;delete h.shhAway;'));
  assert.ok(html.includes('h.shh=!h.shh;delete h.shhAway;'));
});
test('travel steps away whenever you are anywhere but the practice place, and back when you return', () => {
  assert.ok(travel.includes("if (moved) { window.HabitDesk?.away?.(p !== 'practice');"));
});
test('Return to quarters is there during a session; the place band stays out of the quiet view', () => {
  assert.ok(!html.includes('body.habit-shh :is(#kt-return,#kt-band){display:none!important}'));
  assert.ok(html.includes('body.habit-shh #kt-band{display:none!important}'));
});
test('in a session, focus lands on the work: the answer box, or the timer\'s Pause', () => {
  const i = travel.indexOf("else if (p === 'practice' && (h = ["), line = travel.slice(i, travel.indexOf('\n', i));
  assert.ok(i > 0);
  const order = ['[data-flow="attempt"]', '[data-flow="warm"]', '#hb-session-card [data-action="pause"]', '#hb-session-card button'].map(q => line.indexOf(q));
  assert.ok(order.every((x, k) => x > 0 && (k === 0 || x > order[k - 1])), 'checked in priority order');
});
test('the Writing Table has one entrance: the travel movement', () => {
  assert.ok(html.includes('html body.kt-on.kt-on{transition:none!important}html body.kt-p-table #kg-main #habit-desk :is(#hb-day-map,#hb-day-map *){transition:none!important;animation:none!important}'));
});
test('an unread letter is drawn once, after the blind, and read/unread lives on the letter', () => {
  assert.ok(html.includes("L.letters.push({ d, kind, who, text: r.reply.trim(), unread: true })"), 'the writer marks a new letter unread');
  assert.ok(html.includes(`<article class="kl-letter"\${x.unread ? ' data-unread="1"' : ''}>`));
  assert.ok(html.includes('M.lettersRead = () => { let n = 0; for (const x of L.letters) if (x.unread) { delete x.unread; n++; } if (n) save(); return n; };'));
  const fn = travel.slice(travel.indexOf('function letters()'), travel.indexOf('\n  }\n', travel.indexOf('function letters()')));
  assert.match(fn, /M\.lettersRead && M\.lettersRead\(\)/);
  assert.match(fn, /Math\.max\(0, 360 - \(performance\.now\(\) - movedAt\)\)/, 'waits until the travel movement has ended');
  assert.match(fn, /if \(mine === trip\)/, 'a new trip cancels the drawing');
  assert.ok(!/localStorage/.test(fn));
});
test('the guided session on screen hides the station tabs and the bench card that would return to it', () => {
  assert.ok(html.includes('html body.kt-on.kg-flow-on #kg-main #moon-lab>:is(#kt-bench,.kl-tabs){display:none!important}'));
});
