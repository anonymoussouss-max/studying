#!/usr/bin/env node
// A read-only local server for the desk's course library. It listens on 127.0.0.1 only and serves nothing but
// kaguya-library.json and the files that index lists (videos, subtitles, transcripts, PDFs, and a workshop's notebooks,
// data, scripts and lesson-site files). The session file, cookies,
// download scripts and the URL-bearing syllabus files are never served. Video requests support byte ranges, so seeking works.
// Usage: node tools/library-server.cjs "C:\Users\you\Downloads\Coursera" [port]   (default port 8770)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const TYPES = { '.mp4': 'video/mp4', '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8',
  '.ipynb': 'text/plain; charset=utf-8', '.fits': 'application/fits', '.inv': 'application/octet-stream', '.xml': 'text/xml; charset=utf-8' };

function allowList(index) {
  const ok = new Set(['kaguya-library.json']);
  for (const c of index.courses || []) for (const x of [].concat(c.resources || [], c.extra || [], (c.site || []).map(p => ({ path: p })))) ok.add(x.path);
  for (const c of index.courses || []) for (const m of c.modules || []) {
    for (const r of m.resources || []) ok.add(r.path);
    for (const l of m.lectures || []) { if (l.video) ok.add(l.video); for (const x of [].concat(l.subs || [], l.transcripts || [], l.pdfs || [])) ok.add(x.path); }
  }
  return ok;
}
function create(root) {
  const idxFile = path.join(root, 'kaguya-library.json'); let ok = new Set(), stamp = 0;
  const refresh = () => { try { const t = fs.statSync(idxFile).mtimeMs; if (t !== stamp) { ok = allowList(JSON.parse(fs.readFileSync(idxFile, 'utf8'))); stamp = t; } } catch (e) { ok = new Set(); } };
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Range'); res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    refresh();
    let rel, u; try { u = new URL(req.url, 'http://x'); rel = decodeURIComponent(u.pathname).replace(/^\/+/, ''); } catch (e) { res.writeHead(400); return res.end(); }
    if (rel.endsWith('/') && ok.has(rel + 'index.html')) rel += 'index.html'; // a lesson site's folder link opens its index page
    const abs = path.resolve(root, rel);
    if (!ok.has(rel) || !abs.startsWith(path.resolve(root) + path.sep)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not in the library index'); }
    let st; try { st = fs.statSync(abs); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('file missing'); }
    // ?download=1 asks the browser to save the file (the download attribute is ignored for links to another address)
    if (u.searchParams.get('download') === '1') res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`);
    const type = TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream', m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let a = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), b = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (a > b || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1, 'Cache-Control': 'no-store' });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(abs, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(abs).pipe(res);
  });
}
if (require.main === module) {
  const root = process.argv[2], port = +process.argv[3] || 8770;
  if (!root || !fs.existsSync(path.join(root, 'kaguya-library.json'))) { console.error('Run tools/library-index.cjs on the course folder first, then: node tools/library-server.cjs "<folder>" [port]'); process.exit(1); }
  create(root).listen(port, '127.0.0.1', () => console.log(`course library on http://127.0.0.1:${port}/ (read-only, indexed files only)`));
}
module.exports = { create, allowList };
