// One complete backup: every user-data key plus attached files with checksums; damaged archives are refused unless
// partial recovery is chosen; both older formats still restore. Synthetic data only. Run: node --test tests/backup.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf('  const sha = async s =>'), b = html.indexOf('  M.bkCheck = bkCheck;');
const { sha, bkCheck } = new Function(html.slice(a, b) + '; return { sha, bkCheck };')();
const lab = JSON.stringify({ log: [] }), url = 'data:text/plain;base64,' + Buffer.from('synthetic note').toString('base64');
const v2 = async (files, manifest) => ({ format: 'kaguya-desk-full-v2', at: 1, data: { 'kg-lab-v1': lab, 'ame-habit-v1': '{}' }, files, manifest });

test('a sound v2 backup passes; a damaged or missing file is named', async () => {
  const good = await v2([['n1', { name: 'n.txt', blob: { dataUrl: url, name: 'n.txt' } }]], [{ id: 'n1', name: 'n.txt', sha: await sha(url) }]);
  assert.deepStrictEqual((await bkCheck(good)).bad, []);
  const bad = JSON.parse(JSON.stringify(good)); bad.files[0][1].blob.dataUrl = 'data:text/plain;base64,VEFNUEVSRUQ=';
  assert.deepStrictEqual((await bkCheck(bad)).bad.map(x => x.why), ['damaged']);
  const gone = JSON.parse(JSON.stringify(good)); gone.files = [];
  assert.deepStrictEqual((await bkCheck(gone)).bad.map(x => x.why), ['missing']);
});
test('older formats are read; junk and a broken study record are refused', async () => {
  assert.strictEqual((await bkCheck({ app: 'ame-desk', version: 1, storage: { 'kg-lab-v1': lab } })).format, 'habit-v1');
  assert.strictEqual((await bkCheck({ format: 'kaguya-desk-full-v1', data: { 'kg-lab-v1': lab }, files: [] })).format, 'full-v1');
  assert.strictEqual((await bkCheck({ hello: 1 })).ok, false);
  assert.strictEqual((await bkCheck({ format: 'kaguya-desk-full-v2', data: { 'kg-lab-v1': '{oops' }, files: [] })).ok, false);
});
test('the backup covers the habit record and the smaller keys; restore paths are wired and atomic', () => {
  for (const k of ['ame-mute-v1', 'kg-bond-v1', 'kg-need-log']) assert.ok(html.includes(`'${k}'`) && /const BK_KEYS = \[\.\.\.new Set\(\[\.\.\.KEYS, 'ame-mute-v1', 'kg-bond-v1', 'kg-need-log'/.test(html), k);
  assert.match(html, /if\(window\.MoonLab\?\.fullBackup\)\{window\.MoonLab\.fullBackup\(\)/, 'the Today "complete backup" button makes the complete file');
  assert.match(html, /if\(window\.MoonLab\?\.fullRestore\)\{e\.target\.value='';return window\.MoonLab\.fullRestore\(file\);\}/, 'both restore inputs use one restore');
  assert.match(html, /a complete restore was refused and nothing has changed/);
  assert.match(html, /else if \(r\.format === 'full-v2'\) localStorage\.removeItem\(k\);/, 'older files never delete keys they did not contain');
  assert.match(html, /Evidence missing:<\/b> the last restore was a partial recovery/);
});

test('review fixes: a null or wrong-shaped record, a manifested file without bytes and damaged lecture notes are all caught', async () => {
  const base = { format: 'kaguya-desk-full-v2', at: 1, files: [], manifest: [] };
  assert.strictEqual((await bkCheck({ ...base, data: { 'kg-lab-v1': 'null' } })).ok, false, 'a null study record is refused');
  assert.strictEqual((await bkCheck({ ...base, data: { 'kg-lab-v1': '[]' } })).ok, false);
  assert.strictEqual((await bkCheck({ ...base, data: { 'kg-lab-v1': lab, 'kg-cult-v1': 'null' } })).ok, false, 'a null cultivation record is refused');
  assert.strictEqual((await bkCheck({ ...base, data: { 'kg-lab-v1': lab, 'ame-habit-v1': 5 } })).ok, false, 'non-string values are refused');
  assert.strictEqual((await bkCheck({ app: 'ame-desk', version: 1, storage: { 'kg-lab-v1': 'null' } })).ok, false, 'the records-only format is checked too');
  const photo = { ...base, data: { 'kg-lab-v1': lab }, files: [['p1', { name: 'proof.jpg', blob: { name: 'proof.jpg' } }]], manifest: [{ id: 'p1', name: 'proof.jpg', size: 900, sha: 'abc' }] };
  assert.deepStrictEqual((await bkCheck(photo)).bad.map(x => x.why), ['missing bytes'], 'a proof photo listed with bytes but carrying none is named');
  assert.strictEqual((await bkCheck({ ...base, data: { 'kg-lab-v1': lab }, lectureNotes: [['c/l', { md: 5 }]] })).ok, false);
  const ok = await bkCheck({ ...base, data: { 'kg-lab-v1': lab }, lectureNotes: [['c/l', { md: 'Key ideas:\n- x', edited: true }]] });
  assert.ok(ok.ok && ok.lnotes.length === 1);
  assert.strictEqual((await bkCheck({ format: 'kaguya-desk-full-v1', data: { 'kg-lab-v1': lab }, files: [] })).lnotes, null, 'an older backup without notes keeps the notes on this device');
});
test('review fixes: the recovery copy covers every key, file and lecture note a restore can replace, and a failed restore puts it back', () => {
  assert.match(html, /const full = kind !== 'daily', keys = full \? BK_KEYS : KEYS/);
  assert.match(html, /rec\.files = \(await M\.notesDB\?\.dump\?\.\(\)\) \|\| \[\]; rec\.lnotes = \(await window\.KgLectureNotes\?\.dump\?\.\(\)\) \|\| \[\];/);
  assert.match(html, /const back = await recoveryCopy\(\); if \(!back\) \{ alert\("The recovery copy couldn't be made/, 'no recovery copy, no restore');
  assert.match(html, /catch \(e\) \{ try \{ await applySnap\(back\); \}/, 'a failed restore puts the recovery copy back');
  assert.match(html, /lectureNotes = \(await window\.KgLectureNotes\?\.dump\?\.\(\)\) \|\| \[\];/, 'full backups carry lecture study notes');
});
