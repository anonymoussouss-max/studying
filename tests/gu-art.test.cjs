// Chapter Gu artwork (27 Nov 2026): a mapping by stable chapter id. It changes looks only, never ownership, levels or ranks.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const grab = id => { const t = `<script id="${id}">`, a = html.indexOf(t); return html.slice(a + t.length, html.indexOf('</script>', a)); };
const w = {}; vm.runInNewContext(grab('kg-gu-art-script'), { window: w }); const { ART, IMM } = w.KgGuArt;
const sp = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('root.StudyPlan=api'));
const ctx = { Date, Math, JSON, Number, String, Object, Array, Set, Map, console, localStorage: { getItem: () => null, setItem() {} } }; ctx.globalThis = ctx; vm.runInNewContext(sp, ctx);
const syl = ctx.StudyPlan.seedSyllabus(); ctx.StudyPlan.applyConfirmed11(syl);
const keys = Object.entries(syl.courses).filter(([, c]) => c.cls === 11).flatMap(([cid, c]) => c.chapters.map(x => cid + ':' + x[0]));

test('54 designs map to 54 distinct existing Class 11 chapters; with the serpent the collection is 55', () => {
  const k = Object.keys(ART); assert.strictEqual(k.length, 54); assert.strictEqual(new Set(k).size, 54);
  for (const x of k) assert.ok(keys.includes(x), x + ' is an existing chapter id');
  assert.strictEqual(keys.length, 55); assert.deepStrictEqual(keys.filter(x => !ART[x]), ['m11:Basic Mathematics'], 'only the serpent keeps its own art');
  const by = p => k.filter(x => x.startsWith(p + ':')).length;
  assert.deepStrictEqual([by('m11'), by('p11'), by('pc11'), by('oc11'), by('ic11')], [19, 17, 7, 6, 5]);
  assert.strictEqual(ART['p11:Thermodynamics and KTG'].name !== ART['pc11:Thermodynamics'].name, true, 'the two Thermodynamics chapters get their own designs');
});
test('the 13 suggested ranks were approved on 27 Nov 2026 and are active on the same chapters; nothing else changes', () => {
  const ok = Object.entries(ART).filter(([, a]) => a.rs === 'approved'); assert.strictEqual(ok.length, 13); assert.ok(!Object.values(ART).some(a => a.rs === 'proposed'));
  const cw = {}; vm.runInNewContext(grab('kg-cult-script'), { window: cw, Object, Math, String, JSON, Set, Array, Number, Date }); const { RANK, RANK_APPROVED } = cw.KgCult;
  const want = { 'p11:Units and Dimensions': 1, 'p11:Vectors': 2, 'oc11:IUPAC Naming / Basic Principles and Techniques': 1, 'oc11:General Organic Chemistry': 3, 'oc11:Isomerism': 3, 'oc11:Hydrocarbons': 2, 'oc11:Purification and Analysis of Organic Compounds': 2, 'oc11:Environmental Chemistry': 1, 'ic11:Classification of Elements and Periodicity in Properties': 2, 'ic11:Chemical Bonding and Molecular Structure': 3, 'ic11:p-Block Elements (Groups 13 and 14)': 3, 'ic11:s-Block Elements': 2, 'ic11:Hydrogen and its Compounds': 1 };
  assert.deepStrictEqual(ok.map(([k]) => k).sort(), Object.keys(want).sort());
  for (const [k, r] of Object.entries(want)) { const n = k.split(':').slice(1).join(':'); assert.ok(keys.includes(k)); assert.strictEqual(ART[k].rank, r, k); assert.strictEqual(RANK[n], r, k); assert.ok(RANK_APPROVED.has(n)); }
  assert.strictEqual(RANK_APPROVED.size, 13); assert.strictEqual(Object.keys(RANK).length, 55, 'every Class 11 chapter now has a rank');
});
test('artwork is inert and looks-only: no scripts or links; unearned Gu keep the cocoon; the serpent keeps its own art', () => {
  for (const a of Object.values(ART).concat(IMM)) assert.ok(!/<script|\son[a-z]+=|href|foreignObject|<image/i.test(a.svg));
  const q = grab('kg-cult-quarters-script'), f = q.slice(q.indexOf('function guSVG'));
  assert.ok(f.indexOf("if (st === 'unstarted')") < f.indexOf('KgGuArt') && f.indexOf("if (st === 'studying')") < f.indexOf('KgGuArt'), 'unearned states return before any design is used');
  assert.match(q, /g\.name === 'Basic Mathematics' \? `<g transform="translate\(\$\{x\} \$\{y\}\) scale\(\.74\)">\$\{serpentSVG/, 'cabinet nook');
  assert.match(q, /const art = bm \? `<svg viewBox="-130 -70 260 130" class="kq-gu-art"[^\n]*serpentSVG/, 'detail view');
  assert.ok(!/setItem|KgCult\.(earn|readStore)|earned\s*=/.test(grab('kg-gu-art-script')));
});
test('the Immortal Gu preview is labelled proposed and awards or unlocks nothing', () => {
  const r = grab('kg-rank-script'), i = r.indexOf('IMMORTAL GU</p>'), seg = r.slice(i, i + 900);
  assert.match(seg, /proposed design, preview only\. Not owned/); assert.ok(!/setItem|immortals\.push|earn\(/.test(seg));
  const rw = {}; vm.runInNewContext(r, { window: rw, Object, Math, String, JSON, Set, Array, Number, Date });
  assert.strictEqual(rw.KgRank.land([], []).unlocked, false, 'no Immortal Gu recorded: the land stays closed');
});
