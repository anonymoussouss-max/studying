// Course library: the index builder, the local server and the progress rules. Synthetic fixtures in a temp folder only.
// Run: node --test tests/courses.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), vm = require('vm');
const { build } = require('../tools/library-index.cjs'), { create } = require('../tools/library-server.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2048)]);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kglib-'));
  const w = (rel, data) => { const a = path.join(root, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, data); };
  const d = 'stars/01_the-sun/01_lesson';
  w(`${d}/01_welcome.mp4`, MP4); w(`${d}/01_welcome.en.srt`, '1\n00:00:01,000 --> 00:00:02,500\nHello\n'); w(`${d}/01_welcome.fr.srt`, 'x'); w(`${d}/01_welcome.en.txt`, 'Hello');
  w(`${d}/02_fusion.mp4`, Buffer.from('not a video at all, just text that is long enough'.repeat(40)));
  w(`${d}/02_fusion_slides.pdf`, '%PDF-1.4'); w(`${d}/05_reading_notes.pdf`, '%PDF-1.4');
  w('course-catalogue.json', JSON.stringify([{ course: 'stars', url: 'https://www.coursera.org/learn/stars', lectures: [
    { id: 'a1', name: 'Welcome', module: 'The Sun', video_files: [`stars\\01_the-sun\\01_lesson\\01_welcome.mp4`] },
    { id: 'a2', name: 'Fusion', module: 'The Sun', video_files: [`stars\\01_the-sun\\01_lesson\\02_fusion.mp4`] },
    { id: 'a3', name: 'Gone', module: 'Later', video_files: [`stars\\02_later\\01_gone.mp4`] }] }]));
  w('verification.json', JSON.stringify([{ course: 'stars', expected: 3, video_files: 3, invalid_video_files: [] }]));
  // a planned course, half downloaded; its syllabus carries signed URLs that must never reach the index
  w('python-syllabus-parsed.json', JSON.stringify([['m1', [['l1', [['intro', { mp4: [['https://d3c33hcgiwev3.cloudfront.net/x.mp4?Expires=1&Signature=SECRET', '']] }], ['more', { mp4: [['https://cdn/y.mp4?Signature=SECRET2', '']] }]]]]]]));
  w('python/01_chapter-one/01_intro.mp4', MP4);
  w('recommended-status.json', JSON.stringify([{ course: 'python', status: 'running' }]));
  w('coursera-session.txt', 'CAUTH=super-secret-cookie');
  return root;
}

test('index: modules, ordered lectures, sidecar files, invalid and missing videos; no URLs or secrets', () => {
  const root = fixture(), idx = build(root), s = JSON.stringify(idx);
  assert.doesNotMatch(s, /https?:|Signature|SECRET|CAUTH|cookie/i);
  const c = idx.courses.find(x => x.id === 'stars');
  assert.deepStrictEqual(c.modules.map(m => m.name), ['The Sun', 'Later']);
  const [a, b] = c.modules[0].lectures, g = c.modules[1].lectures[0];
  assert.ok(a.ok); assert.deepStrictEqual(a.subs.map(x => x.lang), ['en', 'fr']); assert.strictEqual(a.transcripts[0].path, 'stars/01_the-sun/01_lesson/01_welcome.en.txt');
  assert.strictEqual(b.ok, false); assert.strictEqual(b.why, 'not a playable MP4'); assert.strictEqual(b.pdfs[0].path, 'stars/01_the-sun/01_lesson/02_fusion_slides.pdf');
  assert.strictEqual(g.ok, false); assert.strictEqual(g.why, 'missing');
  assert.deepStrictEqual(c.modules[0].resources.map(r => r.name), ['Reading notes'], 'a PDF of no lecture is a module resource');
  assert.strictEqual(c.status, 'partial', 'a folder with missing or invalid videos is never "available"');
});

test('WIP: a planned course keeps its badge until every expected lecture has a valid video and the download finished', () => {
  const root = fixture(), idx = build(root), py = idx.courses.find(x => x.id === 'python'), vc = idx.courses.find(x => x.id === 'vector-calculus-engineers');
  assert.strictEqual(py.status, 'wip'); assert.strictEqual(py.expected, 2); assert.strictEqual(py.valid, 1); assert.match(py.note, /1 of 2 expected lectures/);
  assert.strictEqual(vc.status, 'wip'); assert.strictEqual(vc.present, false); assert.match(vc.note, /not present/);
  fs.copyFileSync(path.join(root, 'python/01_chapter-one/01_intro.mp4'), path.join(root, 'python/01_chapter-one/02_more.mp4'));
  assert.strictEqual(build(root).courses.find(x => x.id === 'python').status, 'wip', 'all files present but the download is still running');
  fs.writeFileSync(path.join(root, 'recommended-status.json'), JSON.stringify([{ course: 'python', status: 'finished' }]));
  assert.strictEqual(build(root).courses.find(x => x.id === 'python').status, 'available');
});

test('server: only indexed files, byte ranges for seeking, nothing outside the folder', async () => {
  const root = fixture(); fs.writeFileSync(path.join(root, 'kaguya-library.json'), JSON.stringify(build(root)));
  const srv = create(root); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const get = (p, h = {}) => new Promise((ok, no) => http.get({ host: '127.0.0.1', port, path: p, headers: h }, res => { const b = []; res.on('data', x => b.push(x)); res.on('end', () => ok({ s: res.statusCode, h: res.headers, b: Buffer.concat(b) })); }).on('error', no));
  try {
    const r = await get('/stars/01_the-sun/01_lesson/01_welcome.mp4', { Range: 'bytes=4-11' });
    assert.strictEqual(r.s, 206); assert.strictEqual(r.b.toString('latin1'), 'ftypisom'); assert.match(r.h['content-range'], /^bytes 4-11\/\d+$/);
    assert.strictEqual((await get('/kaguya-library.json')).s, 200);
    for (const p of ['/coursera-session.txt', '/python-syllabus-parsed.json', '/course-catalogue.json', '/..%2f..%2fwindows', '/stars/../coursera-session.txt']) assert.strictEqual((await get(p)).s, 404, p);
    assert.strictEqual((await get('/stars/01_the-sun/01_lesson/01_welcome.en.srt')).h['access-control-allow-origin'], '*');
  } finally { srv.close(); }
});

test('progress: positions, completion at 92%, course states; completion is never mastery', () => {
  const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1];
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx);
  const K = ctx.window.KgCourses, c = { id: 'stars', modules: [{ lectures: [{ id: 'a', ok: true }, { id: 'b', ok: true }] }] }, s = { lec: {}, notes: [] };
  assert.strictEqual(K.courseState(c, s), 'unstarted'); assert.strictEqual(K.resumeOf(c, s).id, 'a');
  K.record(s, 'stars', 'a', 120, 600); assert.strictEqual(K.lecState(s.lec['stars/a']), 'in-progress'); assert.strictEqual(K.courseState(c, s), 'in-progress');
  assert.deepStrictEqual({ ...s.last }, { c: 'stars', l: 'a' }); assert.strictEqual(K.resumeOf(c, s).id, 'a');
  K.record(s, 'stars', 'a', 560, 600); assert.strictEqual(K.lecState(s.lec['stars/a']), 'completed'); assert.strictEqual(K.resumeOf(c, s).id, 'b');
  K.record(s, 'stars', 'b', 600, 600); assert.strictEqual(K.courseState(c, s), 'completed');
  assert.strictEqual(K.availOf({ status: 'wip' }), 'wip'); assert.strictEqual(K.availOf({ status: 'partial' }), 'partial');
  assert.strictEqual(K.srtToVtt('1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n');
  // the module touches no cultivation record
  assert.doesNotMatch(src, /kg-cult-v1|KgCult\.|KgRank\.|KgProof\./);
});

test('arrangement: 37 courses exactly once in stage order, by id, whatever their download status', () => {
  const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1];
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx);
  const K = ctx.window.KgCourses, ids = K.ARRANGE.flatMap(g => g.c.map(x => x[0]));
  assert.strictEqual(ids.length, 37); assert.strictEqual(new Set(ids).size, 37);
  assert.deepStrictEqual([...K.ARRANGE.map(g => g.c.length)], [3, 3, 3, 4, 5, 2, 8, 9], '18 main, 2 optional, 8 recommended, 9 reference');
  const { WIP } = require('../tools/library-index.cjs');
  assert.deepStrictEqual([...[...K.ARRANGE[6].c, ...K.ARRANGE[7].c.slice(1)].map(x => x[0])].sort(), WIP.map(w => w.id).sort(), 'planned courses appear on the recommended and reference shelves');
  // download order and status never move a course; an unknown course falls into "Other courses"; lecture order is untouched
  const mk = (id, status) => ({ id, title: id, status, kind: status === 'wip' ? 'planned' : 'verified', modules: [{ lectures: [{ id: 'b' }, { id: 'a' }] }] });
  const courses = [...ids].reverse().map((id, i) => mk(id, i % 2 ? 'wip' : 'available')).concat(mk('new-course', 'available'));
  const g = K.arrange(courses);
  assert.deepStrictEqual([...g.flatMap(x => x.items.map(i => i.c.id))], [...ids, 'new-course']);
  assert.strictEqual(g[8].h, 'Other courses'); assert.strictEqual(g[0].items[0].c.modules[0].lectures[0].id, 'b');
});

function assessK() {
  const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1];
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx); return ctx.window.KgCourses;
}
const C2 = (status = 'available') => ({ id: 'stars', status, modules: [{ name: 'The Sun', lectures: [{ id: 'a', ok: true }, { id: 'b', ok: true }] }, { name: 'Later', lectures: [{ id: 'c', ok: true }] }] });

test('module assessment: only a fully completed module becomes due, once; a single lecture never triggers it', () => {
  const K = assessK(), c = C2(), s = { lec: {}, notes: [] };
  K.record(s, 'stars', 'a', 600, 600); assert.strictEqual(K.ensureDue(s, c).length, 0, 'one lecture of two completed: no assessment');
  K.record(s, 'stars', 'b', 100, 600); assert.strictEqual(K.ensureDue(s, c).length, 0, 'opening / partly watching is not completion');
  K.record(s, 'stars', 'b', 560, 600); assert.deepStrictEqual([...K.ensureDue(s, c)], [0]);
  assert.strictEqual(K.ensureDue(s, c).length, 0, 'never created twice');
  const a = s.asm[K.mkey(c, 0)]; assert.strictEqual(a.tier, 'hard'); assert.strictEqual(a.fails, 0); assert.strictEqual(a.pending, true);
  assert.match(K.asmLabel(a), /^Assessment pending/); assert.strictEqual(K.asmLabel(undefined), 'Not yet due');
  // invalid or missing files never let a module count; a WIP course's last module on disk may still be downloading
  const bad = C2(); bad.modules[0].lectures[1].ok = false; const s2 = { lec: { 'stars/a': { done: true }, 'stars/b': { done: true } }, notes: [] };
  assert.strictEqual(K.ensureDue(s2, bad).length, 0);
  const w = C2('wip'), s3 = { lec: { 'stars/a': { done: true }, 'stars/b': { done: true }, 'stars/c': { done: true } }, notes: [] };
  assert.deepStrictEqual([...K.ensureDue(s3, w)], [0], 'earlier WIP modules count once a later module has arrived; the last one does not');
});

test('module assessment: HARD → MEDIUM → EASY after three graded misses each; Easy floor; errors, deferral and duplicates count nothing', () => {
  const K = assessK(), a = K.asmBlank(); let n = 0;
  const ask = () => { a.cur = { id: 'q' + (++n), state: 'ready' }; return a.cur.id; };
  // an error, then leaving and coming back (a JSON round trip, like a refresh) change nothing
  let q = ask(); assert.strictEqual(K.applyGrade(a, q, 'error'), false); assert.strictEqual(a.fails, 0); assert.strictEqual(a.cur.state, 'error');
  const back = JSON.parse(JSON.stringify(a)); assert.strictEqual(back.tier, 'hard'); assert.strictEqual(back.fails, 0);
  assert.strictEqual(K.applyGrade(a, q, 'fail'), true); assert.strictEqual(K.applyGrade(a, q, 'fail'), false, 'the same submission is graded once');
  q = ask(); K.applyGrade(a, q, 'fail'); assert.strictEqual(a.tier, 'hard'); assert.strictEqual(a.fails, 2);
  const saved = JSON.parse(JSON.stringify(a)); assert.strictEqual(saved.fails, 2, 'the counter survives a refresh');
  q = ask(); K.applyGrade(a, q, 'fail'); assert.strictEqual(a.tier, 'medium'); assert.strictEqual(a.fails, 0, 'reset on tier change');
  for (let i = 0; i < 3; i++) { q = ask(); K.applyGrade(a, q, 'fail'); } assert.strictEqual(a.tier, 'easy'); assert.strictEqual(a.fails, 0);
  for (let i = 0; i < 3; i++) { q = ask(); K.applyGrade(a, q, 'fail'); } assert.strictEqual(a.tier, 'easy', 'Easy is the floor'); assert.strictEqual(a.revise, true, 'targeted revision is offered');
  assert.strictEqual(K.applyGrade(a, 'stale-id', 'pass'), false, 'an old question cannot be submitted');
  q = ask(); K.applyGrade(a, q, 'pass'); assert.strictEqual(a.passed, 'easy'); assert.strictEqual(K.asmLabel(a), 'Passed — Easy');
  assert.strictEqual(a.hist.length, 10, "3 Hard + 3 Medium + 3 Easy misses + the pass; the error is not in the history"); assert.ok(a.hist.every(h => h.v === 'pass' || h.v === 'fail'));
  assert.strictEqual(K.applyGrade(a, q, 'pass'), false, 'nothing after a pass');
  // a pass at Hard is labelled Hard; a new module always starts at Hard
  const h = K.asmBlank(); h.cur = { id: 'x' }; K.applyGrade(h, 'x', 'pass'); assert.strictEqual(K.asmLabel(h), 'Passed — Hard');
  assert.strictEqual(K.asmBlank().tier, 'hard');
  assert.deepStrictEqual({ ...K.parseJSON('noise {"verdict":"fail"} tail') }, { verdict: 'fail' }); assert.strictEqual(K.parseJSON('no json'), null);
});

test('Course Gu: obtained → refining → proven → retained from saved assessment passes only, keeping each tier', () => {
  const K = assessK(), c = C2(), s = { lec: {}, notes: [], asm: {} }, DAY = 864e5;
  const pass = (mi, tier, at) => { const a = K.asmBlank(); a.tier = tier; a.cur = { id: 'q' + mi }; K.applyGrade(a, 'q' + mi, 'pass'); a.hist[0].at = at; s.asm[K.mkey(c, mi)] = a; };
  assert.strictEqual(K.courseGu(c, s).stage, 'none', 'watching alone never obtains a Course Gu');
  for (const id of ['a', 'b', 'c']) s.lec['stars/' + id] = { done: true };
  assert.strictEqual(K.courseGu(c, s).stage, 'none');
  pass(0, 'medium', 1000); let g = K.courseGu(c, s); assert.strictEqual(g.stage, 'obtained'); assert.strictEqual(g.passes[0].tier, 'medium');
  assert.strictEqual(g.canS, false, 'synthesis opens only after every module');
  pass(1, 'hard', 2000); g = K.courseGu(c, s); assert.strictEqual(g.stage, 'refining'); assert.strictEqual(g.canS, true);
  pass('S', 'easy', 3000); g = K.courseGu(c, s, 3000 + 13 * DAY); assert.strictEqual(g.stage, 'proven'); assert.strictEqual(g.synth.tier, 'easy', 'a lower-tier pass stays lower-tier');
  assert.strictEqual(g.canR, false, 'retention opens later'); assert.strictEqual(K.courseGu(c, s, 3000 + 14 * DAY).canR, true);
  pass('R', 'hard', 3000 + 15 * DAY); g = K.courseGu(c, s, 3000 + 15 * DAY); assert.strictEqual(g.stage, 'retained');
  const back = JSON.parse(JSON.stringify(s)); assert.strictEqual(K.courseGu(c, back, 3000 + 15 * DAY).stage, 'retained', 'survives a save/reload round trip');
});

test('Course Gu: a WIP course cannot be proven; missing evidence is pending; ranks are approved and descriptive; kept apart from chapter rank', () => {
  const K = assessK(), c = C2('wip'), s = { lec: {}, notes: [], asm: {} };
  for (const mi of [0, 1]) { const a = K.asmBlank(); a.cur = { id: 'q' }; K.applyGrade(a, 'q', 'pass'); s.asm[K.mkey(c, mi)] = a; }
  const g = K.courseGu(c, s); assert.strictEqual(g.stage, 'refining'); assert.strictEqual(g.canS, false); assert.match(g.pending.join(' '), /WIP/);
  assert.strictEqual(Object.keys(K.CGU_RANK).length, 29); assert.ok(Object.values(K.CGU_RANK).every(r => Number.isInteger(r) && r >= 1 && r <= 5));
  const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1]; assert.match(src, /Gu rank \$\{r\} · approved by you/); assert.ok(!/awaiting your approval/.test(src), 'no course Gu rank is shown as a proposal');
  const art = {}; vm.runInNewContext(html.match(/<script id="kg-course-gu-art">([\s\S]*?)<\/script>/)[1], { window: art }); const ids = Object.keys(art.KgCourseGuArt);
  assert.strictEqual(ids.length, 29); assert.deepStrictEqual([...ids].sort(), Object.keys(K.CGU_RANK).sort(), 'one artwork per course, keyed by the stable course id');
  for (const a of Object.values(art.KgCourseGuArt)) assert.ok(!/<script|\son[a-z]+=|href|foreignObject|<image/i.test(a.svg));
});
// the 29 ranks you approved on 27 Nov 2026, by stable course id, with the Gu each belongs to
const APPROVED = [['an-introduction-to-astronomy','Meridian Owl',1],['basics-of-rocket-science','Comet Squid',2],['understanding-modern-physics-2-quantum-mechanics-and-atoms','Balmer Firefly',3],['astro','Lookback Heron',1],['basis-flight-mechanics','Camber Swift',2],['foundations-quantum-mechanics','Spin Finch',4],['exoplanets','Transit Gecko',3],['spacecraft-dynamics-kinematics','Gimbal Pangolin',4],['quantum-mechanics','Boxwell Cat',4],['einstein-relativity','Lightclock Crane',2],['extra-galactic-astronomy','Spiral Crown Snail',3],['quantum-physics','Manypath Lacewing',5],['robotic-methodologies','Linkage Mantis',3],['cosmology-our-universe','Scaleweaver Spider',3],['phases-of-matter-solid-liquid-gas-and-beyond','Melting Crown Slug',4],['particle-physics','Chamber Beetle',3],['black-holes-astro-101','Eclipse Ray',2],['physique-deux-infinis-liens','Two Horizons Seahorse',2],['our-place-in-the-cosmos','Nested Shell Limpet',1],['astrobiology','Brine Lantern',2],['physics-101-forces-kinematics','Track Hare',2],['introduction-to-calculus','Tangent Ibex',2],['python','Loopback Skink',1],['mit-18-06sc-linear-algebra','Basis Weaver',4],['differential-equations-engineers','Slopefield Salmon',3],['vector-calculus-engineers','Curlwheel Shrimp',3],['mit-8-02-electricity-magnetism','Fieldline Eel',4],['mit-8-03sc-vibrations-waves','Nodewing Cicada',4],['numerical-methods-engineers','Interval Kingfisher',4]];
test('approved Course Gu ranks: 29 distinct ids, each rank on the right Gu; the four quantum courses checked one by one', () => {
  const K = assessK(), art = {}; vm.runInNewContext(html.match(/<script id="kg-course-gu-art">([\s\S]*?)<\/script>/)[1], { window: art });
  assert.strictEqual(new Set(APPROVED.map(r => r[0])).size, 29);
  for (const [id, gu, r] of APPROVED) { assert.strictEqual(art.KgCourseGuArt[id].gu, gu, id); assert.strictEqual(K.CGU_RANK[id], r, gu); }
  const q = id => [art.KgCourseGuArt[id].gu, K.CGU_RANK[id]];
  assert.deepStrictEqual(q('understanding-modern-physics-2-quantum-mechanics-and-atoms'), ['Balmer Firefly', 3]);
  assert.deepStrictEqual(q('foundations-quantum-mechanics'), ['Spin Finch', 4]);
  assert.deepStrictEqual(q('quantum-mechanics'), ['Boxwell Cat', 4]);
  assert.deepStrictEqual(q('quantum-physics'), ['Manypath Lacewing', 5]);
  assert.strictEqual(K.CGU_RANK_APPROVED, '27 Nov 2026');
  const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1], cg = src.slice(src.indexOf('function courseGu'), src.indexOf('const CGU_RANK_APPROVED'));
  assert.ok(!/CGU_RANK/.test(cg), 'the rank never feeds the earned stage');
});
