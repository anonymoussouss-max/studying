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

test('arrangement: 29 courses exactly once in stage order, by id, whatever their download status', () => {
  const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1];
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx);
  const K = ctx.window.KgCourses, ids = K.ARRANGE.flatMap(g => g.c.map(x => x[0]));
  assert.strictEqual(ids.length, 29); assert.strictEqual(new Set(ids).size, 29);
  assert.deepStrictEqual([...K.ARRANGE.map(g => g.c.length)], [3, 3, 3, 4, 5, 2, 9], '18 main, 2 optional, 9 supporting');
  const { WIP } = require('../tools/library-index.cjs');
  assert.deepStrictEqual([...K.ARRANGE[6].c.slice(1).map(x => x[0])].sort(), WIP.map(w => w.id).sort(), 'all eight WIP courses sit on the supporting shelf');
  // download order and status never move a course; an unknown course falls into "Other courses"; lecture order is untouched
  const mk = (id, status) => ({ id, title: id, status, kind: status === 'wip' ? 'planned' : 'verified', modules: [{ lectures: [{ id: 'b' }, { id: 'a' }] }] });
  const courses = [...ids].reverse().map((id, i) => mk(id, i % 2 ? 'wip' : 'available')).concat(mk('new-course', 'available'));
  const g = K.arrange(courses);
  assert.deepStrictEqual([...g.flatMap(x => x.items.map(i => i.c.id))], [...ids, 'new-course']);
  assert.strictEqual(g[7].h, 'Other courses'); assert.strictEqual(g[0].items[0].c.modules[0].lectures[0].id, 'b');
});
