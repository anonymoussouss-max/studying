// Cliffside archive: courses are the main collection, one named shelf per approved stage, last known catalogue kept.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
test('stage shelves follow ARRANGE; stage-less courses are flagged; reference is the supporting shelf', () => {
  assert.ok(!html.includes("h: 'Recommended next courses'"), 'the eight review courses now sit in approved stages');
  assert.ok(html.includes("{ h: 'Reference shelf', support: true,"));
  assert.ok(html.includes('const out = ARRANGE.map((g, gi) =>'), 'shelves in approved order');
  assert.ok(html.includes('Download status not established yet'), 'a planned course keeps its place, marked Unknown until a status is established');
  assert.ok(html.includes("['ready', 'Ready'] : ['wip', 'WIP']") && html.includes('<b>Library disconnected</b>'));
  for (const q of ['Understanding Modern Physics II: Quantum Mechanics and Atoms', 'Foundations of Quantum Mechanics', 'Quantum Mechanics — University of Colorado Boulder', 'Exploring Quantum Physics']) assert.ok(html.includes(`'${q}'`), q);
});
test('one heading: the old library headings are gone, the explanation sits in details', () => {
  assert.ok(!html.includes('<h2>Your offline courses</h2>'));
  assert.ok(html.includes('<summary>About course progress, Course Gu and Chapter Gu</summary>'));
  assert.ok(html.includes('html body.kt-p-library #kg-strip{display:none!important}'));
});
test('disconnected library keeps the last known catalogue; nothing but titles, ids and statuses is cached', () => {
  assert.ok(html.includes("const CAT = 'kg-library-cat-v1';") && html.includes('phase = \'ready\'; saveCat(index);'));
  assert.ok(html.includes('<b>Library disconnected</b> · showing the last known catalogue'));
  const save = html.slice(html.indexOf('function saveCat'), html.indexOf('const cached ='));
  assert.ok(!/src|base|url|cookie|session/i.test(save.replace('saveCat', '')), 'no source address or credentials in the cache');
});
test('open a book at its resume point; back restores scroll and focus to that book', () => {
  assert.ok(html.includes("shelfRet = { c: d.c, y: scrollY }"));
  assert.ok(html.includes("document.querySelector(`#moon-lab .klib-book[data-c=\"${CSS.escape(r.c)}\"]`)"));
  assert.ok(html.includes("document.querySelector('#moon-lab .klib-toc .kl-primary')"));
});
test('approved placement of the eight former review courses (28 Nov 2026)', () => {
  const src = html.slice(html.indexOf('const ARRANGE = ['), html.indexOf('];', html.indexOf('const ARRANGE = [')));
  const ARRANGE = new Function('return ' + src.slice(src.indexOf('[')) + '];')();
  const where = id => { for (const g of ARRANGE) { const i = g.c.findIndex(c => c[0] === id); if (i >= 0) return [g.h.split(' —')[0], g.c[i - 1] && g.c[i - 1][0]]; } };
  const want = { analyze: ['Stage 2', 'astro'], 'space-mission-design-and-operations': ['Stage 3', 'spacecraft-dynamics-kinematics'], 'theory-of-angular-momentum': ['Stage 4', 'quantum-physics'],
    'spacecraft-dynamics-kinetics': ['Stage 4', 'robotic-methodologies'], 'statistical-thermodynamics': ['Stage 5', 'phases-of-matter-solid-liquid-gas-and-beyond'], 'approximation-methods': ['Stage 5', 'particle-physics'],
    'bayesian-statistics': ['Reference shelf', 'numerical-methods-engineers'], 'introduction-python-scientific-computing': ['Optional branches', 'astrobiology'] };
  for (const [id, w] of Object.entries(want)) assert.deepStrictEqual(where(id), w, id);
  const ids = ARRANGE.flatMap(g => g.c.filter(c => c[3] !== 'workshop').map(c => c[0])); assert.strictEqual(ids.length, 48); assert.strictEqual(new Set(ids).size, 48);
  assert.ok(!ARRANGE.some(g => g.review), 'nothing left to review');
});

test('stale WIP: the index is re-read on revisiting the archive, never from a browser cache; offline keeps each last verified status', () => {
  assert.match(html, /p === 'kaguya-library\.json' \? \{ cache: 'no-store' \}/, 'the index is never served from the HTTP cache');
  assert.match(html, /async function recheck\(\)/); assert.match(html, /else setTimeout\(recheck, 0\);/, 'every visit to the shelves or a course page rechecks quietly');
  assert.match(html, /const st = !c\.status \? \['off', 'Unknown'\] : av === 'available' \? \['ready', 'Ready'\] : \['wip', 'WIP'\];/, 'books show Ready / WIP / Unknown, also when disconnected');
  assert.ok(!/\['off', 'Library disconnected'\]/.test(html), 'Library disconnected is shown once, not on every book');
});
