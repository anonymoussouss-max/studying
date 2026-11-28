#!/usr/bin/env node
// Builds kaguya-library.json inside your offline course folder: courses, modules, ordered lectures, the local files that
// exist for each (video, subtitles, transcript, PDFs) and whether each file looks valid. It never copies media, and it never
// writes download URLs, cookies or the session file: the *-syllabus-parsed.json files hold signed URLs, so only lecture
// COUNTS are taken from them. Usage: node tools/library-index.cjs "C:\Users\you\Downloads\Coursera"
'use strict';
const fs = require('fs'), path = require('path');

// Planned additions. They keep the WIP badge until their expected lectures are known and every one has a valid video.
const WIP = [
  { id: 'introduction-to-calculus', title: 'Introduction to Calculus', by: 'University of Sydney', dir: 'introduction-to-calculus', syllabus: 'introduction-to-calculus-syllabus-parsed.json' },
  { id: 'mit-18-06sc-linear-algebra', title: 'Linear Algebra', by: 'MIT · Gilbert Strang', dir: 'MIT/18-06sc-linear-algebra-fall-2011' },
  { id: 'python', title: 'Programming for Everybody', by: 'University of Michigan', dir: 'python', syllabus: 'python-syllabus-parsed.json' },
  { id: 'vector-calculus-engineers', title: 'Vector Calculus for Engineers', by: 'HKUST', dir: 'vector-calculus-engineers', syllabus: 'vector-calculus-engineers-syllabus-parsed.json' },
  { id: 'differential-equations-engineers', title: 'Differential Equations for Engineers', by: 'HKUST', dir: 'differential-equations-engineers', syllabus: 'differential-equations-engineers-syllabus-parsed.json' },
  { id: 'numerical-methods-engineers', title: 'Numerical Methods for Engineers', by: 'HKUST', dir: 'numerical-methods-engineers', syllabus: 'numerical-methods-engineers-syllabus-parsed.json' },
  { id: 'mit-8-02-electricity-magnetism', title: 'Electricity and Magnetism', by: 'MIT', dir: 'MIT/8-02-physics-ii-electricity-and-magnetism-spring-2019' },
  { id: 'mit-8-03sc-vibrations-waves', title: 'Vibrations and Waves', by: 'MIT', dir: 'MIT/8-03sc-physics-iii-vibrations-and-waves-fall-2016' },
  {"id": "analyze", "title": "Analyzing the Universe", "by": "Rutgers", "dir": "analyze", "syllabus": "analyze-syllabus-parsed.json"},
  {"id": "introduction-python-scientific-computing", "title": "Introduction to Python for Scientific Computing", "by": "University of Colorado Boulder", "dir": "introduction-python-scientific-computing", "syllabus": "introduction-python-scientific-computing-syllabus-parsed.json"},
  {"id": "space-mission-design-and-operations", "title": "Space Mission Design and Operations", "by": "EPFL", "dir": "space-mission-design-and-operations", "syllabus": "space-mission-design-and-operations-syllabus-parsed.json"},
  {"id": "theory-of-angular-momentum", "title": "Theory of Angular Momentum", "by": "University of Colorado Boulder", "dir": "theory-of-angular-momentum", "syllabus": "theory-of-angular-momentum-syllabus-parsed.json"},
  {"id": "bayesian-statistics", "title": "Bayesian Statistics: From Concept to Data Analysis", "by": "UC Santa Cruz", "dir": "bayesian-statistics", "syllabus": "bayesian-statistics-syllabus-parsed.json"},
  {"id": "spacecraft-dynamics-kinetics", "title": "Kinetics: Studying Spacecraft Motion", "by": "University of Colorado Boulder", "dir": "spacecraft-dynamics-kinetics", "syllabus": "spacecraft-dynamics-kinetics-syllabus-parsed.json"},
  {"id": "approximation-methods", "title": "Approximation Methods", "by": "University of Colorado Boulder", "dir": "approximation-methods", "syllabus": "approximation-methods-syllabus-parsed.json"},
  {"id": "statistical-thermodynamics", "title": "Statistical Molecular Thermodynamics", "by": "University of Minnesota", "dir": "statistical-thermodynamics", "syllabus": "statistical-thermodynamics-syllabus-parsed.json"}
];
// Hands-on workshops: notebooks, data and a browser-readable lesson site instead of lectures. They carry no videos,
// so video completion, assessments and Course Gu never apply. Paths are relative to the workshop folder.
const WORKSHOPS = [
  { id: 'astronomical-data-in-python', title: 'Astronomical Data in Python', by: 'Allen Downey', dir: 'Astronomical Data in Python', blurb: 'Hands-on workshop · 7 notebook lessons',
    start: 'Start here.html', reading: 'Offline reading/index.html',
    notebooks: [['01_query.ipynb', 'Queries'], ['02_coords.ipynb', 'Coordinates and Units'], ['03_motion.ipynb', 'Proper Motion'], ['04_select.ipynb', 'Transformation and Selection'],
      ['05_join.ipynb', 'Joining Tables'], ['soln/06_photo.ipynb', 'Photometry'], ['07_plot.ipynb', 'Visualization']],
    data: [['data/gd1_results.fits', 'Gaia results (FITS)'], ['data/gd1_photo.fits', 'Pan-STARRS photometry (FITS)'], ['data/gd1-joined-sample.csv', 'Starter dataset (CSV)']],
    starter: 'Starter exercise.py', extra: ['README.md'] }
];
const posix = p => p.split(path.sep).join('/').replace(/\\/g, '/');
const pretty = s => s.replace(/^\d+[_-]/, '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
const titleOf = slug => slug.split('-').map(w => w.length > 2 || /^[a-z]/.test(w) && w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w).join(' ').replace(/^./, c => c.toUpperCase());
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

// a video counts as usable only if it exists, is not empty and starts like an MP4 (an 'ftyp' box near the start)
function videoCheck(abs) {
  try { const st = fs.statSync(abs); if (!st.isFile() || st.size < 1024) return { ok: false, size: st.size, why: 'empty or truncated' };
    const fd = fs.openSync(abs, 'r'), b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd);
    return b.toString('latin1', 4, 8) === 'ftyp' ? { ok: true, size: st.size } : { ok: false, size: st.size, why: 'not a playable MP4' };
  } catch (e) { return { ok: false, size: 0, why: 'missing' }; }
}
const dirCache = new Map(), listDir = (() => { const cache = dirCache; return abs => { if (!cache.has(abs)) { let v = []; try { v = fs.readdirSync(abs); } catch (e) {} cache.set(abs, v); } return cache.get(abs); }; })();
// files next to a video that share its numbered prefix: subtitles (.srt/.vtt with a language), transcripts (.txt) and PDFs
function sidecars(root, relVideo) {
  const dir = path.dirname(relVideo), base = path.basename(relVideo).replace(/\.mp4$/i, ''), out = { subs: [], transcripts: [], pdfs: [] };
  for (const f of listDir(path.join(root, dir))) {
    if (f === path.basename(relVideo) || !(f.startsWith(base + '.') || f.startsWith(base + '_'))) continue;
    const rel = posix(path.join(dir, f)), m = f.slice(base.length).match(/^\.([a-z]{2,3}(?:-[A-Za-z]+)?)\.(srt|vtt|txt)$/);
    if (m && m[2] !== 'txt') out.subs.push({ lang: m[1], path: rel });
    else if (m) out.transcripts.push({ lang: m[1], path: rel });
    else if (/\.pdf$/i.test(f)) out.pdfs.push({ name: pretty(f.slice(base.length)) || 'PDF', path: rel });
  }
  out.subs.sort((a, b) => (b.lang === 'en') - (a.lang === 'en') || a.lang.localeCompare(b.lang));
  out.transcripts.sort((a, b) => (b.lang === 'en') - (a.lang === 'en') || a.lang.localeCompare(b.lang));
  return out;
}
// PDFs in a lesson folder that belong to no lecture are kept as module resources
function looseFiles(root, dirs, claimed) {
  const out = [];
  for (const d of dirs) for (const f of listDir(path.join(root, d))) { const rel = posix(path.join(d, f)); if (/\.pdf$/i.test(f) && !claimed.has(rel)) out.push({ name: pretty(f), path: rel }); }
  return out;
}
// counts lectures with a video in a parsed syllabus WITHOUT reading or keeping any URL in it
function expectedFromSyllabus(file) {
  const s = readJSON(file); if (!s) return null; let n = 0;
  const walk = x => { if (Array.isArray(x)) { if (x.length === 2 && typeof x[0] === 'string' && x[1] && typeof x[1] === 'object' && !Array.isArray(x[1]) && x[1].mp4) { n++; return; } x.forEach(walk); } };
  walk(s); return n || null;
}
function walkMp4(abs, rel = '', out = []) {
  for (const f of listDir(abs)) { const a = path.join(abs, f), r = rel ? rel + '/' + f : f; let st; try { st = fs.statSync(a); } catch (e) { continue; }
    if (st.isDirectory()) walkMp4(a, r, out); else if (/\.mp4$/i.test(f)) out.push(r); }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// every file of a static site folder, skipping dot-files and dot-folders (.git, .buildinfo, .nojekyll)
function siteFiles(abs, rel, out = []) {
  for (const f of listDir(abs)) { if (f.startsWith('.')) continue; const a = path.join(abs, f), r = rel + '/' + f; let st; try { st = fs.statSync(a); } catch (e) { continue; }
    if (st.isDirectory()) siteFiles(a, r, out); else out.push(r); }
  return out.sort();
}
function workshopOf(root, w) {
  const file = (p, name, kind) => { let size = 0, ok = false; try { const st = fs.statSync(path.join(root, w.dir, p)); ok = st.isFile() && st.size > 0; size = st.size; } catch (e) {}
    return { kind, name, path: posix(path.join(w.dir, p)), ok, size }; };
  const res = [file(w.start, 'Start here', 'start'), file(w.reading, 'Lessons and worked solutions', 'reading')]
    .concat(w.notebooks.map(([p, n], i) => file(p, `${i + 1}. ${n}`, 'notebook')), w.data.map(([p, n]) => file(p, n, 'data')), [file(w.starter, 'Starter Python exercise', 'starter')]);
  const extra = w.extra.map(p => file(p, pretty(p), 'extra')).filter(x => x.ok);
  const readDir = path.dirname(w.reading), site = fs.existsSync(path.join(root, w.dir, readDir)) ? siteFiles(path.join(root, w.dir, readDir), posix(path.join(w.dir, readDir))) : [];
  const missing = res.filter(x => !x.ok).length;
  return { id: w.id, title: w.title, by: w.by, kind: 'workshop', blurb: w.blurb, status: missing ? 'partial' : 'available', expected: res.length, valid: res.length - missing,
    resources: res, extra, site, modules: [], note: missing ? `${missing} of ${res.length} workshop files are missing.` : `All ${res.length} workshop files are present.` };
}
function build(root) {
  dirCache.clear();
  const cat = readJSON(path.join(root, 'course-catalogue.json')) || [], ver = readJSON(path.join(root, 'verification.json')) || [], cov = readJSON(path.join(root, 'lecture-coverage.json')) || [];
  const status = [].concat(readJSON(path.join(root, 'expanded-status.json')) || [], readJSON(path.join(root, 'recommended-status.json')) || [], readJSON(path.join(root, 'additional-status.json')) || [], readJSON(path.join(root, 'download-status.json')) || []);
  const courses = [];
  const lectureOf = (root, rel, name, module, id) => { const v = videoCheck(path.join(root, rel)), sc = sidecars(root, rel);
    return { id, name, module, video: rel, ok: v.ok, size: v.size, why: v.ok ? undefined : v.why, subs: sc.subs, transcripts: sc.transcripts, pdfs: sc.pdfs }; };
  const modulesOf = (lecs, root) => { const mods = []; for (const l of lecs) { let m = mods[mods.length - 1]; if (!m || m.name !== l.module) mods.push(m = { name: l.module, lectures: [], dirs: new Set() }); m.lectures.push(l); m.dirs.add(posix(path.dirname(l.video))); }
    return mods.map(m => { const claimed = new Set(m.lectures.flatMap(l => l.pdfs.map(p => p.path))); return { name: m.name, lectures: m.lectures, resources: looseFiles(root, [...m.dirs], claimed) }; }); };
  for (const c of cat) {
    const v = ver.find(x => x.course === c.course) || {}, k = cov.find(x => x.course === c.course) || {};
    const lecs = c.lectures.map(l => lectureOf(root, posix(String((l.video_files || [])[0] || '')), l.name, l.module || 'Lectures', l.id || l.slug));
    const valid = lecs.filter(l => l.ok).length, expected = v.expected || k.expected_lectures || c.lectures.length;
    courses.push({ id: c.course, title: titleOf(c.course), by: '', kind: 'verified', status: valid === expected && !(v.invalid_video_files || []).length ? 'available' : 'partial',
      expected, valid, modules: modulesOf(lecs, root) });
  }
  for (const w of WIP) {
    const abs = path.join(root, w.dir), present = fs.existsSync(abs), st = status.find(x => x.course === w.id || x.course === w.dir) || null;
    const expected = w.syllabus ? expectedFromSyllabus(path.join(root, w.syllabus)) : null;
    const vids = present ? walkMp4(abs) : [];
    const lecs = vids.map((r, i) => { const parts = r.split('/'), mod = parts.length > 1 ? pretty(parts[0]) : 'Lectures'; return lectureOf(root, posix(path.join(w.dir, r)), pretty(parts[parts.length - 1]), mod, 'v' + i); });
    const valid = lecs.filter(l => l.ok).length, verified = !!(expected && valid >= expected && st && st.status === 'finished');
    courses.push({ id: w.id, title: w.title, by: w.by, kind: 'planned', status: verified ? 'available' : 'wip', present, download: st ? st.status : present ? 'files present, no status' : 'not started',
      expected, valid, modules: modulesOf(lecs, root),
      note: verified ? 'Every expected lecture has a valid video.' : !present ? 'Folder not present yet.' : expected ? `${valid} of ${expected} expected lectures have a valid video.` : `${valid} valid videos found; the expected lecture list is not known yet.` });
  }
  for (const w of WORKSHOPS) courses.push(workshopOf(root, w));
  return { v: 1, built: new Date().toISOString(), courses };
}
if (require.main === module) {
  const root = process.argv[2]; if (!root || !fs.existsSync(root)) { console.error('Give the course folder, e.g. node tools/library-index.cjs "C:\\Users\\you\\Downloads\\Coursera"'); process.exit(1); }
  const idx = build(root), out = path.join(root, 'kaguya-library.json');
  fs.writeFileSync(out, JSON.stringify(idx));
  const lec = idx.courses.reduce((n, c) => n + c.modules.reduce((m, x) => m + x.lectures.length, 0), 0);
  console.log(`wrote ${out}: ${idx.courses.length} courses, ${lec} lectures`);
  for (const c of idx.courses) console.log(`  ${c.status.padEnd(9)} ${c.id}: ${c.valid}/${c.expected ?? '?'} valid${c.note ? ' · ' + c.note : ''}`);
}
module.exports = { build, expectedFromSyllabus, videoCheck, sidecars, WIP, WORKSHOPS };
