// Astronomical Data in Python: a hands-on workshop in the Cliffside Archive. Builder, server and shelf rules on a synthetic folder.
// Run: node --test tests/workshop.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), vm = require('vm');
const { build, WORKSHOPS } = require('../tools/library-index.cjs'), { create } = require('../tools/library-server.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const D = 'Astronomical Data in Python', ID = 'astronomical-data-in-python';
const FILES = ['Start here.html', 'Offline reading/index.html', '01_query.ipynb', '02_coords.ipynb', '03_motion.ipynb', '04_select.ipynb', '05_join.ipynb', 'soln/06_photo.ipynb', '07_plot.ipynb',
  'data/gd1_results.fits', 'data/gd1_photo.fits', 'data/gd1-joined-sample.csv', 'Starter exercise.py'];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kgws-')), w = (rel, data) => { const a = path.join(root, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, data); };
  for (const f of FILES) w(`${D}/${f}`, f.endsWith('.csv') ? 'source_id,g_mag,i_mag\n1,18.0,17.2\n' : 'x'.repeat(64));
  w(`${D}/README.md`, '# setup'); w(`${D}/Offline reading/06_photo.html`, '<p>lesson</p>'); w(`${D}/Offline reading/_static/styles/theme.css`, 'body{}');
  w(`${D}/Offline reading/_images/a.png`, 'png'); w(`${D}/Offline reading/.git/config`, 'secret'); w(`${D}/.git/config`, 'secret'); w(`${D}/Offline reading/.buildinfo`, 'x');
  w(`${D}/data/other.hdf5`, 'x'); w('coursera-session.txt', 'CAUTH=super-secret-cookie');
  return root;
}
const ws = idx => idx.courses.filter(c => c.id === ID);

test('builder: the workshop appears once with its 13 resources in syllabus order, relative paths, no dot-folders; a rebuild keeps it', () => {
  const root = fixture(), idx = build(root), [c] = ws(idx);
  assert.strictEqual(ws(idx).length, 1); assert.strictEqual(c.kind, 'workshop'); assert.strictEqual(c.status, 'available'); assert.strictEqual(c.modules.length, 0);
  assert.deepStrictEqual(c.resources.map(r => r.path), FILES.map(f => `${D}/${f}`));
  assert.deepStrictEqual(c.resources.filter(r => r.kind === 'notebook').map(r => r.name), ['1. Queries', '2. Coordinates and Units', '3. Proper Motion', '4. Transformation and Selection', '5. Joining Tables', '6. Photometry', '7. Visualization']);
  assert.ok(c.site.includes(`${D}/Offline reading/_static/styles/theme.css`) && c.site.includes(`${D}/Offline reading/_images/a.png`));
  assert.ok(!c.site.some(p => /\/\./.test(p)), 'no .git or dot-files'); assert.ok(!JSON.stringify(idx).includes(path.basename(root)), 'no machine paths');
  fs.writeFileSync(path.join(root, 'kaguya-library.json'), JSON.stringify(idx));
  assert.strictEqual(ws(build(root)).length, 1, 'a catalogue rebuild preserves the entry');
  fs.unlinkSync(path.join(root, D, 'data/gd1_photo.fits'));
  const p = ws(build(root))[0]; assert.strictEqual(p.status, 'partial'); assert.match(p.note, /1 of 13/);
});

test('server: all 13 resources, the lesson site and its assets resolve; Save downloads; .git and secrets stay hidden', async () => {
  const root = fixture(); fs.writeFileSync(path.join(root, 'kaguya-library.json'), JSON.stringify(build(root)));
  const srv = create(root); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const get = p => new Promise((ok, no) => http.get({ host: '127.0.0.1', port, path: p }, res => { res.resume(); res.on('end', () => ok({ s: res.statusCode, h: res.headers })); }).on('error', no));
  const u = rel => '/' + rel.split('/').map(encodeURIComponent).join('/');
  try {
    for (const f of FILES) assert.strictEqual((await get(u(`${D}/${f}`))).s, 200, f);
    assert.match((await get(u(`${D}/Offline reading/index.html`))).h['content-type'], /text\/html/);
    assert.match((await get(u(`${D}/Offline reading/_static/styles/theme.css`) + '?digest=abc')).h['content-type'], /text\/css/, 'cache-busting queries are ignored');
    assert.match((await get(u(`${D}/Offline reading`) + '/')).h['content-type'], /text\/html/, 'a folder link opens the lesson index');
    assert.strictEqual((await get(u(`${D}/data`) + '/')).s, 404, 'other folders are not listed');
    assert.strictEqual((await get(u(`${D}/Offline reading/_images/a.png`))).s, 200); assert.strictEqual((await get(u(`${D}/README.md`))).s, 200);
    assert.match((await get(u(`${D}/01_query.ipynb`))).h['content-type'], /text\/plain/, 'Open shows a notebook as text');
    assert.match((await get(u(`${D}/Starter exercise.py`) + '?download=1')).h['content-disposition'], /^attachment; filename\*=UTF-8''Starter%20exercise\.py$/);
    assert.strictEqual((await get(u(`${D}/01_query.ipynb`))).h['content-disposition'], undefined);
    for (const p of [`${D}/.git/config`, `${D}/Offline reading/.git/config`, `${D}/Offline reading/.buildinfo`, `${D}/data/other.hdf5`, 'coursera-session.txt']) assert.strictEqual((await get(u(p))).s, 404, p);
  } finally { srv.close(); }
});

function K() {
  const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1];
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx); return ctx.window.KgCourses;
}
test('shelf: Optional branches, right after Introduction to Python for Scientific Computing; no Course Gu, rank, art or assessment', () => {
  const k = K(), opt = k.ARRANGE.find(g => g.h === 'Optional branches').c.map(x => x[0]);
  assert.deepStrictEqual([...opt.slice(-2)], ['introduction-python-scientific-computing', ID]);
  assert.strictEqual(k.ARRANGE.flatMap(g => g.c).filter(x => x[0] === ID).length, 1);
  assert.ok(!k.CGU_RANK[ID]); assert.ok(!html.includes(`"${ID}":{"gu"`));
  assert.ok(html.includes(".filter(c => c.kind !== 'workshop'), gs ="), 'the Course Gu shelf skips workshops');
  const c = { id: ID, kind: 'workshop', status: 'available', modules: [] }, s = { lec: {}, asm: {} };
  assert.strictEqual(k.ensureDue(s, c).length, 0, 'no lectures, so no assessment ever becomes due');
  assert.strictEqual(k.courseState(c, s), 'unstarted');
  assert.strictEqual(WORKSHOPS[0].id, ID);
});

test('page and cache: Start here first, notebooks, lessons, data and starter; offline catalogue keeps the workshop files', () => {
  const v = html.slice(html.indexOf('function workshopView(c)'), html.indexOf('function courseView(c)'));
  assert.ok(v.indexOf("'Open Start here'") < v.indexOf('Notebooks, in order') && v.indexOf('Notebooks, in order') < v.indexOf('Read the lessons') && v.indexOf('Read the lessons') < v.indexOf('Datasets and starter exercise'));
  assert.match(v, /Hands-on workshop · 7 notebook lessons/); assert.match(v, /python "Starter exercise\.py"/); assert.match(v, /live Gaia queries in the notebooks need internet access/);
  assert.ok(!/[A-Z]:\\|\/Users\//.test(v), 'no machine-specific paths');
  assert.ok(html.includes("...(c.kind === 'workshop' ? { kind: c.kind, blurb: c.blurb, resources:"), 'the saved catalogue keeps the workshop entry for the disconnected view');
});
