// Phones: no route lays out wider than the screen. Library connection: a blocked browser and a stopped server get different messages.
// Run: node --test tests/mobile-connection.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

test('narrow screens: long links wrap, flex and grid children shrink, the restore picker fits', () => {
  const css = html.match(/<style id="kg-narrow-fit">([\s\S]*?)<\/style>/)[1];
  assert.match(css, /@media \(max-width:480px\)/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /#kg-main \.grid>\*\{min-width:0\}/);
  assert.match(css, /#kg-main input\[type=file\]\{max-width:100%;width:100%\}/);
  assert.match(css, /#kg-main \.flex\.justify-between\{flex-wrap:wrap/);
});

const src = html.match(/  async function netWhy\(\) \{[\s\S]*?\n    return '[^\n]*\n/)[0];
const why = async ({ host, protocol = 'https:', state, kind = 'url' }) => {
  const navigator = { permissions: { query: async ({ name }) => { if (state === 'throw' || name !== 'local-network-access') throw new TypeError('unknown'); return { state }; } } };
  const fn = new Function('store', 'location', 'navigator', src + '\nreturn netWhy();');
  return fn(() => ({ src: { kind } }), { hostname: host, protocol }, navigator);
};

test('connection: a blocked browser, a pending prompt and a stopped server each get their own message', async () => {
  assert.match(await why({ host: 'desk.example.org', state: 'denied' }), /browser is blocking the page.*allow local network access/);
  assert.match(await why({ host: 'desk.example.org', state: 'prompt' }), /choose Allow/);
  assert.match(await why({ host: 'desk.example.org', state: 'granted' }), /server is not reachable: start it/, 'permission allowed: the server must be down');
  assert.match(await why({ host: 'desk.example.org', state: 'throw' }), /server is not reachable/, 'a browser without the permission API');
  assert.match(await why({ host: '127.0.0.1', protocol: 'http:', state: 'denied' }), /server is not reachable/, 'a page served from this computer is never blocked from it');
  assert.match(await why({ host: '127.0.0.1', state: 'denied' }), /progress and the shelf are kept/);
});

test('disconnected keeps the last known shelf; a later recheck explains the failure the same way', () => {
  assert.ok(html.includes("err = /fetch|network/i.test(String(e)) ? await netWhy() :"));
  assert.ok(html.includes("phase = 'error'; err = await netWhy(); if (onCourses()) M.render();"));
});
