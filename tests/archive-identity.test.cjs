// Archive identity: lecture ids survive insertion, reordering and renumbering; old position ids migrate once;
// anything ambiguous is kept in s.orphans; availability checks the expected lesson files; earned Course Gu stays.
// Synthetic fixtures in a temp folder only. Run: node --test tests/archive-identity.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { build, stableId } = require('../tools/library-index.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2048)]);
const K = (() => { const src = html.match(/<script id="kg-courses-script">([\s\S]*?)<\/script>/)[1];
  const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(src, ctx); return ctx.window.KgCourses; })();

// the 'python' WIP course: syllabus expects 'intro' and 'more'
function lib(files, status = 'finished') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kgid-'));
  const w = (rel, data) => { const a = path.join(root, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, data); };
  w('python-syllabus-parsed.json', JSON.stringify([['m1', [['l1', [['intro', { mp4: [['x', '']] }], ['more', { mp4: [['y', '']] }]]]]]]));
  w('recommended-status.json', JSON.stringify([{ course: 'python', status }]));
  for (const f of files) w('python/' + f, MP4);
  return root;
}
const py = root => build(root).courses.find(x => x.id === 'python');
const lecs = c => c.modules.flatMap(m => m.lectures);
const byName = c => Object.fromEntries(lecs(c).map(l => [l.video.split('/').pop().replace(/^\d+_/, ''), l]));

test('builder: ids come from the file names without order numbers, so insertion and reordering keep them', () => {
  const a = byName(py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_more.mp4'])));
  assert.strictEqual(a['intro.mp4'].legacy, 'v0'); assert.strictEqual(a['more.mp4'].legacy, 'v1');
  // insertion: a new earlier module and a new first lecture renumber everything
  const b = byName(py(lib(['01_preface/01_hello.mp4', '02_chapter-one/01_warmup.mp4', '02_chapter-one/02_intro.mp4', '02_chapter-one/03_more.mp4'])));
  assert.strictEqual(b['intro.mp4'].id, a['intro.mp4'].id); assert.strictEqual(b['more.mp4'].id, a['more.mp4'].id);
  assert.strictEqual(b['hello.mp4'].legacy, 'v0', 'the old position id now names a different file, which is why migration runs only once');
  // reordering: 'more' before 'intro'
  const c = byName(py(lib(['01_chapter-one/01_more.mp4', '01_chapter-one/02_intro.mp4'])));
  assert.strictEqual(c['intro.mp4'].id, a['intro.mp4'].id); assert.strictEqual(c['more.mp4'].id, a['more.mp4'].id);
  assert.notStrictEqual(stableId('m/intro.mp4'), stableId('m/intro.mp4', 2), 'a second file with the same name gets its own id');
});

test('builder: an unrelated file standing in for a missing expected lecture does not make the course available', () => {
  const ok = py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_more.mp4']));
  assert.strictEqual(ok.status, 'available');
  const sub = py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_bonus-clip.mp4']));
  assert.strictEqual(sub.status, 'wip', 'counts match (2 of 2) but "more" has no video');
  assert.match(sub.note, /no matching video \(more\)/);
});

// saved progress under the old position ids, before the first migration
const oldSave = () => ({ lec: { 'python/v0': { t: 95, done: false }, 'python/v1': { done: true }, 'python/v7': { t: 3 } },
  rev: { 'python/v1': { due: '2026-12-03', n: 2 } }, notes: [{ c: 'python', l: 'v1', text: 'my note' }], last: { c: 'python', l: 'v0' },
  asm: {} });

test('migration: resume position, watched status, notes, review dates and the last lecture move to the stable ids', () => {
  const c = py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_more.mp4'])), L = byName(c), s = oldSave();
  const r = K.migrateIds(s, [c]);
  assert.ok(r.changed);
  assert.deepStrictEqual(s.lec['python/' + L['intro.mp4'].id], { t: 95, done: false }, 'resume position');
  assert.deepStrictEqual(s.lec['python/' + L['more.mp4'].id], { done: true }, 'watched status');
  assert.deepStrictEqual(s.rev['python/' + L['more.mp4'].id], { due: '2026-12-03', n: 2 }, 'review date');
  assert.strictEqual(s.notes[0].l, L['more.mp4'].id); assert.strictEqual(s.last.l, L['intro.mp4'].id);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.moves.map(m => m[0]).sort())), ['python/v0', 'python/v1', 'python/v1'], 'lecture study notes in IndexedDB follow these moves');
  assert.ok(!('python/v0' in s.lec) && !('python/v1' in s.rev));
  assert.deepStrictEqual(s.orphans['lec:python/v7'], { t: 3 }, 'a position with no lecture now is kept for manual matching, not dropped');
  const s2 = { asm: { ['python#0:' + c.modules[0].name]: { passed: 'hard' } } }; K.migrateIds(s2, [c]);
  assert.ok(s2.asm['python#0:' + c.modules[0].name], 'a module pass whose position and name still match is untouched');
});

test('migration runs once: a later insertion or reorder never re-maps progress onto another file', () => {
  const c1 = py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_more.mp4'])), s = oldSave(); K.migrateIds(s, [c1]);
  const before = JSON.stringify(s);
  const c2 = py(lib(['01_preface/01_hello.mp4', '02_chapter-one/01_more.mp4', '02_chapter-one/02_intro.mp4']));
  const r = K.migrateIds(s, [c2]), L = byName(c2);
  assert.strictEqual(r.moves.length, 0);
  assert.strictEqual(s.lec['python/' + L['intro.mp4'].id].t, 95, 'resume stays with intro after the insertion and reorder');
  assert.strictEqual(s.lec['python/' + L['hello.mp4'].id], undefined, 'the new file starts fresh');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)).lec, JSON.parse(before).lec);
});

test('migration: a record already at the new id is never overwritten; the old one is kept in orphans', () => {
  const c = py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_more.mp4'])), L = byName(c), s = oldSave();
  s.lec['python/' + L['intro.mp4'].id] = { t: 10 };
  K.migrateIds(s, [c]);
  assert.deepStrictEqual(s.lec['python/' + L['intro.mp4'].id], { t: 10 });
  assert.deepStrictEqual(s.orphans['lec:python/v0'], { t: 95, done: false });
});

test('module passes: a renamed-position module is found again by its name; an unknown one is kept in orphans', () => {
  const c = { id: 'stars', modules: [{ name: 'Intro', lectures: [] }, { name: 'The Sun', lectures: [] }] };
  const s = { asm: { 'stars#0:The Sun': { passed: 'medium' }, 'stars#1:Retired Module': { passed: 'easy' }, 'stars#S:': { passed: 'hard' } } };
  K.migrateIds(s, [c]);
  assert.deepStrictEqual(s.asm['stars#1:The Sun'], { passed: 'medium' }, 'the pass follows the module after a new module was inserted before it');
  assert.ok(!('stars#0:The Sun' in s.asm));
  assert.deepStrictEqual(s.orphans['asm:stars#1:Retired Module'], { passed: 'easy' });
  assert.deepStrictEqual(s.asm['stars#S:'], { passed: 'hard' }, 'synthesis and retention keys are untouched');
});

test('a lecture renamed on disk: its old progress stays saved under the old id and returns if the file comes back', () => {
  const c1 = py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_more.mp4'])), s = oldSave(); K.migrateIds(s, [c1]);
  const idIntro = byName(c1)['intro.mp4'].id;
  const c2 = py(lib(['01_chapter-one/01_introduction.mp4', '01_chapter-one/02_more.mp4'])); K.migrateIds(s, [c2]);
  assert.strictEqual(s.lec['python/' + idIntro].t, 95, 'not deleted, not moved to another lecture');
  const c3 = py(lib(['01_chapter-one/01_intro.mp4', '01_chapter-one/02_more.mp4'])); K.migrateIds(s, [c3]);
  assert.strictEqual(byName(c3)['intro.mp4'].id, idIntro);
});

test('Course Gu: a Retained course keeps Retained while one file is temporarily missing; only playback is affected', () => {
  const c = { id: 'stars', status: 'available', modules: [{ name: 'The Sun', lectures: [{ id: 'a', ok: true }] }, { name: 'Later', lectures: [{ id: 'c', ok: true }] }] };
  const s = { lec: {}, notes: [], asm: {} }, DAY = 864e5;
  const pass = (mi, at) => { const a = K.asmBlank(); a.tier = 'medium'; a.cur = { id: 'q' + mi }; K.applyGrade(a, 'q' + mi, 'pass'); a.hist[0].at = at; s.asm[K.mkey(c, mi)] = a; };
  pass(0, 1000); pass(1, 2000); pass('S', 3000); pass('R', 3000 + 15 * DAY);
  assert.strictEqual(K.courseGu(c, s).stage, 'retained');
  const gone = JSON.parse(JSON.stringify(c)); gone.status = 'partial'; gone.modules[1].lectures[0].ok = false;
  const g = K.courseGu(gone, s); assert.strictEqual(g.stage, 'retained');
  assert.match(g.pending.join(' '), /earned stages are kept/);
  assert.strictEqual(K.courseGu(c, s).stage, 'retained', 'file restored: unchanged');
  // a course that is not complete still cannot take its synthesis
  const fresh = { lec: {}, notes: [], asm: {} }; s.asm = fresh.asm; pass(0, 1000); pass(1, 2000);
  assert.strictEqual(K.courseGu(gone, s).canS, false);
});
