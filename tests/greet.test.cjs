// Opening greeting: shown on every open, audio from the user's own file kept on the device. No real media in tests.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = /<script id="kg-greet-script">([\s\S]*?)<\/script>/.exec(html)[1];
test('greeting runs on every open unless switched off, with the requested line as the default', () => {
  assert.ok(src.includes("DEF = 'You are an amazing guy, Ayan'"));
  assert.ok(src.includes("window.addEventListener('load', start, { once: true })"));
  assert.ok(src.includes('document.documentElement.appendChild(ov)'), 'kept outside <body>, which the desk re-renders on start');
  assert.ok(/if \(!c\.on\) return;/.test(src));
});
test('the clip is stored on the device, not in the site code, sync or backup', () => {
  assert.ok(!/data:audio|data:video|\.mp4['"]/.test(src));
  assert.ok(src.includes("indexedDB.open('kg-greet'"));
  assert.ok(!/'kg-greet'/.test(html.slice(0, html.indexOf('<script id="kg-greet-script">'))));
});
test('blocked autoplay falls back to tap-to-play, and the desk is always reachable', () => {
  assert.ok(src.includes('Tap anywhere to play')); assert.ok(src.includes('Continue to the desk')); assert.ok(src.includes("e.key === 'Escape'"));
});
