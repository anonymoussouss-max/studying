// Course Gu art: every course on the approved path has a design; the eight added 28 Nov 2026 carry no rank until approved.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const line = html.split('\n').find(l => l.startsWith('window.KgCourseGuArt = '));
const ART = JSON.parse(line.slice('window.KgCourseGuArt = '.length).replace(/;$/, ''));
const src = html.slice(html.indexOf('const ARRANGE = ['));
const ARRANGE = new Function('return ' + src.slice(src.indexOf('['), src.indexOf('];') + 1))();
const EIGHT = { analyze: 'Photon Lynx', 'space-mission-design-and-operations': 'Waystation Tern', 'theory-of-angular-momentum': 'Axis Crown Stag', 'spacecraft-dynamics-kinetics': 'Flywheel Tortoise',
  'statistical-thermodynamics': 'Ember Brood Toad', 'approximation-methods': 'Ripplewing Moth', 'introduction-python-scientific-computing': 'Lattice Newt', 'bayesian-statistics': 'Posterior Cuttle' };
test('all 37 courses on the path have art, keyed by stable id', () => {
  const ids = ARRANGE.flatMap(g => g.c.map(c => c[0]));
  assert.strictEqual(Object.keys(ART).length, 37);
  for (const id of ids) assert.ok(ART[id] && ART[id].gu && ART[id].svg.startsWith('<desc>'), id);
  for (const [id, gu] of Object.entries(EIGHT)) assert.strictEqual(ART[id].gu, gu, id);
});
test('new art uses the shared gradient id the renderer prefixes per instance, and nothing executable', () => {
  for (const id of Object.keys(EIGHT)) {
    const s = ART[id].svg; assert.deepStrictEqual([...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]), ['ink'], id);
    assert.ok(!/<script|\son\w+=|href=/i.test(s), id);
  }
});
test('the eight ranks approved 28 Nov 2026, as packaged, each dated', () => {
  const r = html.slice(html.indexOf('const CGU_RANK = {'), html.indexOf('};', html.indexOf('const CGU_RANK = {')) + 1);
  const CGU_RANK = new Function('return ' + r.slice(r.indexOf('{')))();
  const want = { 'introduction-python-scientific-computing': 2, analyze: 3, 'bayesian-statistics': 3, 'space-mission-design-and-operations': 4, 'spacecraft-dynamics-kinetics': 4, 'statistical-thermodynamics': 4, 'theory-of-angular-momentum': 5, 'approximation-methods': 5 };
  for (const [id, n] of Object.entries(want)) { assert.strictEqual(CGU_RANK[id], n, EIGHT[id]); assert.ok(html.includes(`'${id}': '28 Nov 2026'`), id); }
  assert.strictEqual(Object.keys(CGU_RANK).length, 37);
  assert.ok(html.includes('approved by you (${CGU_RANK_DATES[c.id] || CGU_RANK_APPROVED})'));
});
