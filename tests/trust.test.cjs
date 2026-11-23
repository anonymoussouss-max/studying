// One-time screen check, honest self-rating labels, saved C doubts, the Today clock wording and astrophysics doubt
// bookmarks. All fixtures are synthetic; no screen, chat or saved record is used. Run: node --test tests/trust.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const cx = html.slice(html.indexOf('id="kg-cexam-script"'));

// a fake screen: counts share prompts, stopped tracks and anything that tries to repeat
function fakeScreen(fail) {
  const st = { calls: 0, stopped: 0, intervals: 0, timers: [] };
  const ctx = { Math, String, Number, Promise,
    setTimeout: (fn, ms) => { st.timers.push(ms); setImmediate(fn); }, setInterval: () => { st.intervals++; },
    navigator: { mediaDevices: { getDisplayMedia: async () => { st.calls++; if (fail) throw new Error('cancelled'); return { getTracks: () => [{ stop: () => { st.stopped++; } }] }; } } },
    document: { createElement: t => t === 'video' ? { videoWidth: 0, async play() { this.videoWidth = 1920; this.videoHeight = 1080; } } : { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,QUJD' } } };
  ctx.window = ctx; vm.runInNewContext(/<script id="kg-shot-script">([\s\S]*?)<\/script>/.exec(html)[1], ctx);
  return { ctx, st };
}

test('Check this answer once: exactly one picture, sharing released, nothing left running five minutes later', async () => {
  const { ctx, st } = fakeScreen(false);
  assert.strictEqual(await ctx.KgShot.grab(null), 'QUJD');
  await new Promise(r => setTimeout(r, 20)); // anything scheduled would have run by now
  assert.ok(st.timers.every(ms => ms <= 300), 'no timer anywhere near the 4-minute watch cadence');
  assert.strictEqual(st.calls, 1, 'one capture'); assert.strictEqual(st.stopped, 1, 'sharing ended'); assert.strictEqual(st.intervals, 0, 'nothing repeating');
  assert.strictEqual(await ctx.KgShot.grab({ videoWidth: 800, videoHeight: 600 }), 'QUJD');
  assert.strictEqual(st.calls, 1, 'if Ayan already had watch on, its picture is reused and no new share starts');
  const f = fakeScreen(true); assert.strictEqual(await f.ctx.KgShot.grab(null), null, 'a cancelled share gives nothing');
  const chk = cx.slice(cx.indexOf('cxcheck: async'), cx.indexOf('cxres:'));
  assert.ok(!/toggle\(|startWatch/.test(chk), 'the check never turns on screen watch');
  assert.ok(chk.indexOf('KgShot.grab') < chk.indexOf('__kgAsk'), 'the screen is released before the request, so a failed request changes nothing');
});

test('self-ratings are labelled as yours; feedback shows only when it arrived', () => {
  assert.match(cx, /Tests today: you marked \$\{got\} of \$\{todayRes\.length\} as recalled/);
  assert.ok(!/Iroha's tests today|got it\./.test(cx), 'old wording gone');
  assert.match(cx, />I recalled it<\/button>/);
  assert.match(cx, /if \(X\(\)\.test === t\) \{ \(t\.fb = t\.fb \|\| \{\}\)\[q\.id\] = true;/, 'feedback flag only after a reply');
  assert.match(cx, /if \(!r\?\.reply\) \{ M\.render\(\); return/, 'a failed request marks nothing');
});

test('saved doubts: one new question on exactly that point, only ever added to', () => {
  assert.match(cx, /with a different example from the one I got stuck on/);
  assert.match(cx, /X\(\)\.doubts\.push\(/);
  assert.ok(!/doubts\.(splice|pop|shift)\(/.test(cx), 'no doubt removed');
  assert.match(cx, /if \(r === 'ok'\) d\.ok = day\(\)/, 'a recalled doubt is marked, not deleted');
});

test('Today clock: minutes studied; a maximum is not a target; Done says finished', () => {
  assert.match(html, /\$\{got\} min studied · \$\{cap\} min maximum/);
  assert.match(html, /Finished for today · \$\{got\} min studied/);
  assert.ok(html.includes('[`${got} min`, `${got} min studied`]'), 'no maximum: no fraction like 80/0');
});

test('astrophysics doubts remember part, time and notes page, and reopen there', () => {
  assert.match(html, /<input name="ts" maxlength="8"/); assert.match(html, /<input name="pg" type="number"/); assert.match(html, /name="url2"/);
  assert.match(html, /u\.searchParams\.set\('t', sec \+ 's'\)/);
  assert.match(html, /The doubt came up in the recording \$\{where\(l, d\)\}/);
});
