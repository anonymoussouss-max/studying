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
test('shelf: Optional branches, right after Introduction to Python for Scientific Computing; watching and opening never create progress', () => {
  const k = K(), opt = k.ARRANGE.find(g => g.h === 'Optional branches').c.map(x => x[0]);
  assert.deepStrictEqual([...opt.slice(-2)], ['introduction-python-scientific-computing', ID]);
  assert.strictEqual(k.ARRANGE.flatMap(g => g.c).filter(x => x[0] === ID).length, 1);
  const c = { id: ID, kind: 'workshop', status: 'available', modules: [] }, s = { lec: {}, asm: {} };
  assert.strictEqual(k.ensureDue(s, c).length, 0, 'no lectures, so no assessment ever becomes due');
  assert.strictEqual(k.courseState(c, s), 'unstarted');
  assert.strictEqual(WORKSHOPS[0].id, ID);
});

// the twelve Gu from the 28 Nov 2026 pack: ranks, art keyed by registered id, the new shelf
const R12 = { 'astronomical-data-in-python': ['Stream-Sorting Silkworm', 3], 'astronomy-technology': ['Mirror-Eye Moth', 2], 'matrix-algebra-engineers': ['Basis Weevil', 3], 'oscillators-waves': ['Standing-Wave Looper', 3],
  dsp1: ['Fourier Fan Cricket', 4], 'complex-analysis': ['Residue Coil Snail', 4], 'computers-waves-simulations': ['Meshwave Caddisfly', 4], 'statistical-mechanics': ['Monte Carlo Pillbug', 5],
  'analytical-mechanics-spacecraft-dynamics': ['Action Rail Centipede', 4], 'nonlinear-spacecraft-attitude-control': ['Gyro-Cradle Beetle', 5], 'general-relativity-i': ['Curvature Loom Spider', 5], 'general-relativity-ii': ['Horizon Wake Longwing', 5] };
test('twelve Gu: each rank and design on its registered id, dated; display only; GR I prepares GR II on a shelf after Stage 5', () => {
  const k = K(), art = {}; vm.runInNewContext(html.match(/<script id="kg-course-gu-art">([\s\S]*?)<\/script>/)[1], { window: art });
  for (const [id, [gu, r]] of Object.entries(R12)) {
    assert.strictEqual(k.CGU_RANK[id], r, id); assert.strictEqual(k.CGU_RANK_DATES[id], '28 Nov 2026', id);
    const A = art.KgCourseGuArt[id]; assert.strictEqual(A.gu, gu, id); assert.deepStrictEqual([...A.svg.matchAll(/id="([^"]+)"/g)].map(m => m[1]), ['ink'], id + ': shared gradient id');
    assert.ok(!/<script|\son\w+=|href=/i.test(A.svg), id);
  }
  const hs = k.ARRANGE.map(g => g.h), fi = hs.indexOf('Further physics and engineering'), f = k.ARRANGE[fi].c;
  assert.strictEqual(hs[fi - 1].split(' —')[0], 'Stage 5');
  assert.deepStrictEqual(f.map(x => x[0]).filter(id => R12[id]).length, 11);
  const g1 = f.findIndex(x => x[0] === 'general-relativity-i'), g2 = f.findIndex(x => x[0] === 'general-relativity-ii');
  assert.ok(g1 < g2); assert.match(f[g1][2], /Preparation for General Relativity II/); assert.match(f[g2][2], /after GR I/);
  const ladder = html.slice(html.indexOf('<script id="kg-courses-script">')); assert.ok(!/CGU_RANK[^\n]*cultivator|rank\(|ladder/.test(ladder.slice(0, ladder.indexOf('</script>')).split('CGU_RANK_APPROVED')[0]), 'Gu ranks never feed the cultivator ladder');
});

test('workshop evidence: seven checkpoints keyed by lesson id; obtained → refining → proven → retained; errors count nothing', () => {
  const k = K(), c = { id: ID, kind: 'workshop', status: 'available', modules: [] }, s = { lec: {}, asm: {} };
  const ids = k.WS[ID].map(x => x.id);
  assert.deepStrictEqual([...ids], ['01_query', '02_coords', '03_motion', '04_select', '05_join', '06_photo', '07_plot']);
  for (const x of k.WS[ID]) { assert.ok(x.skill && x.example && x.rubric.length === 4, x.id); }
  for (const id of ['01_query', '02_coords', '04_select', '05_join']) assert.ok(k.WS[ID].find(x => x.id === id).rubric.some(r => /query/i.test(r) && /constraint/i.test(r)), id + ': a querying lesson asks for the query and its constraints');
  assert.strictEqual(k.mkey(c, '01_query'), ID + '#01_query:Notebook 1 · Queries', 'stable key by lesson id');
  assert.strictEqual(k.courseGu(c, s).stage, 'none');
  const open = id => { s.asm[k.mkey(c, id)] = k.asmBlank(); return s.asm[k.mkey(c, id)]; };
  const pass = id => { const a = s.asm[k.mkey(c, id)] || open(id); a.cur = k.wsQuestion(c, id, a, s); a.cur.answer = 'x'; return k.applyGrade(a, a.cur.id, 'pass'); };
  open('01_query'); assert.strictEqual(k.courseGu(c, s).stage, 'none', 'opening a checkpoint earns nothing');
  // a failed grading request keeps the answer and counts no miss
  const a1 = s.asm[k.mkey(c, '01_query')]; a1.cur = k.wsQuestion(c, '01_query', a1, s); assert.match(a1.cur.draft, /^Code or output excerpt:[\s\S]*Explanation:/);
  a1.cur.answer = 'Code or output excerpt:\nSELECT TOP 10 …\nExplanation:\nTOP keeps it small.'; a1.cur.state = 'grading';
  assert.strictEqual(k.applyGrade(a1, a1.cur.id, null), false); assert.strictEqual(a1.cur.state, 'error'); assert.strictEqual(a1.fails, 0); assert.strictEqual(a1.hist.length, 0); assert.match(a1.cur.answer, /TOP keeps it small/);
  assert.ok(k.applyGrade(a1, a1.cur.id, 'pass')); assert.strictEqual(k.courseGu(c, s).stage, 'obtained');
  pass('02_coords'); let g = k.courseGu(c, s); assert.strictEqual(g.stage, 'refining'); assert.ok(g.pending.includes('2 of 7 notebook checkpoints passed'));
  assert.strictEqual(pass('02_coords'), false, 'a checkpoint passes once; repeats are not distinct passes');
  for (const id of ['03_motion', '04_select', '05_join', '06_photo']) pass(id);
  g = k.courseGu(c, s); assert.strictEqual(g.passes.length, 6); assert.strictEqual(g.canS, false, 'synthesis needs seven distinct passes');
  pass('07_plot'); g = k.courseGu(c, s); assert.strictEqual(g.canS, true); assert.strictEqual(g.stage, 'refining');
  assert.strictEqual(k.courseGu({ ...c, status: 'partial' }, s).canS, false, 'missing workshop files block proof');
  const S = open('S'), qS = k.wsQuestion(c, 'S', S, s); assert.match(qS.q, /GD-1 data/); assert.match(qS.q, /vary exactly one cut/);
  S.cur = qS; S.cur.answer = 'x'; k.applyGrade(S, qS.id, 'pass'); const sAt = S.hist[0].at;
  g = k.courseGu(c, s, sAt + 13.9 * 864e5); assert.strictEqual(g.stage, 'proven'); assert.strictEqual(g.canR, false, 'retention is not open before day 14');
  g = k.courseGu(c, s, sAt + 14 * 864e5); assert.strictEqual(g.canR, true, 'retention opens on day 14');
  const R = open('R'), qR = k.wsQuestion(c, 'R', R, s); assert.match(qR.q, /different local subset/); assert.match(qR.q, /predict/); assert.ok(!/vary exactly one cut/.test(qR.q));
  R.cur = qR; R.cur.answer = 'x'; k.applyGrade(R, qR.id, 'pass'); assert.strictEqual(k.courseGu(c, s, sAt + 15 * 864e5).stage, 'retained');
  const easy = k.asmBlank(); easy.tier = 'easy'; assert.strictEqual(k.wsQuestion(c, '03_motion', easy, s).rubric.length, 3);
});

test('workshop grading reads evidence and never runs it; lecture courses keep their own flow', () => {
  assert.match(html, /Read it; never run or execute anything in it\. Accept cached query results and equivalent local exercises/);
  assert.match(html, /a pasted worked solution, a file name or a claim of having opened the notebook is not evidence/);
  assert.match(html, /Lesson notebook \(read only, never run\)/);
  assert.ok(!/eval\(|new Function\(/.test(html.slice(html.indexOf('function wsQuestion'), html.indexOf('async function grade('))), 'no code execution in the workshop path');
  assert.match(html, /Write ONE assessment question for a learner who has just finished this module/, 'lecture courses still generate their questions');
  assert.match(html, /const PM = v => SPECIAL\[v\] \? v : \/\^\\d\+\$\/\.test\(String\(v\)\) \? \+v : String\(v\);/);
});

test('page and cache: Start here first, notebooks, lessons, data and starter; offline catalogue keeps the workshop files', () => {
  const v = html.slice(html.indexOf('function workshopView(c)'), html.indexOf('function courseView(c)'));
  assert.ok(v.indexOf("'Open Start here'") < v.indexOf('Notebooks, in order') && v.indexOf('Notebooks, in order') < v.indexOf('Read the lessons') && v.indexOf('Read the lessons') < v.indexOf('Datasets and starter exercise'));
  assert.match(v, /Hands-on workshop · 7 notebook lessons/); assert.match(v, /python "Starter exercise\.py"/); assert.match(v, /live Gaia queries in the notebooks need internet access/);
  assert.ok(!/[A-Z]:\\|\/Users\//.test(v), 'no machine-specific paths');
  assert.ok(html.includes("...(c.kind === 'workshop' ? { kind: c.kind, blurb: c.blurb, resources:"), 'the saved catalogue keeps the workshop entry for the disconnected view');
});
