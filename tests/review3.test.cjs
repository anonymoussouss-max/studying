// Fixes from the live review on 24 Nov: Done for today really stops study, C code keeps its symbols, Iroha marks the
// answer before asking more, "couldn't read it" isn't feedback, astrophysics links only promise what they can do,
// gentle return drops the old hours advice, and the scene names the study day after midnight. Synthetic inputs only.
// Run: node --test tests/review3.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.KG_INDEX || path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const cx = html.slice(html.indexOf('id="kg-cexam-script"'));
const grab = re => { const m = re.exec(html); assert.ok(m, 'found ' + re); return m[0]; };

test('after Done for today, no session starts or resumes until Ayan reopens the day', () => {
  assert.match(html, /if\(h\.active\)throw new Error\('Finish your current session first\.'\);\n[^\n]*\n\s*if\(window\.__kgDayDone\?\.\(\)\)throw new Error\(DONE_MSG\);/, 'begin refuses before Iroha announces anything');
  assert.match(html, /else\{if\(window\.__kgDayDone\?\.\(\)\)\{toast\(DONE_MSG\);return;\}/, 'a paused timer cannot be resumed either');
  assert.ok(html.indexOf('if(window.__kgDayDone?.())throw') < html.indexOf("say('one task. phone away."), 'the check runs before the announcement');
  assert.match(html, /window\.__kgDayDone = \(\) => \{ const g = st\(\); return !!\(g && g\.stopped\); \};/);
  assert.match(html, /data-a="kggundo">Reopen today<\/button>/, 'reopening is an explicit button');
  assert.match(html, /kggundo: \(\) => \{ delete dayRec\(\)\.stopped; audit\('gentle return: today reopened', 'chosen by you'\);/);
});

test('chat cleanup keeps C code exactly: *pt = *pt * 2; keeps its stars', () => {
  const src = grab(/const plainLine = [^\n]*\n\s*const plain = [^\n]*/);
  const plain = new Function(src + '; return plain;')();
  assert.strictEqual(plain('Fix it:\n*pt = *pt * 2;'), 'Fix it:\n*pt = *pt * 2;');
  assert.strictEqual(plain('Here `*pt = *pt * 2` doubles a.'), 'Here `*pt = *pt * 2` doubles a.');
  assert.strictEqual(plain('```c\nint *p = &a; *p *= 2\n```'), '```c\nint *p = &a; *p *= 2\n```');
  assert.strictEqual(plain('**Right.** That is *mostly* it.'), 'Right. That is mostly it.', 'prose is still cleaned');
  assert.match(cx, /Put any C code inside backticks, exactly as it would compile/);
});

test('during a question, what Ayan types is assessed first; only the website cue asks a question', () => {
  assert.match(cx, /let cueAt = 0; const ask = text => \{ cueAt = Date\.now\(\);/);
  assert.match(cx, /const cue = Date\.now\(\) - cueAt < 8000; cueAt = 0;/);
  assert.match(cx, /Before anything else, assess that answer[^']*Do not ask a new question\./);
  assert.strictEqual((cx.match(/\$\{CODE\}\$\{turn\}\]`/g) || []).length, 2, 'both the PYQ and the doubt question');
});

test('an unreadable screenshot is not counted as feedback', () => {
  const re = new Function('return ' + /unread = (\/\^[^\n]*?\/i)\.test\(said\)/.exec(cx)[1])();
  for (const s of ['UNREADABLE: only a blank editor', "I can't read the code, it's too small", "The screenshot isn't readable."]) assert.ok(re.test(s), s);
  for (const s of ['Line 3 is right; check the loop bound.', "It's readable now: the printf is missing a semicolon."]) assert.ok(!re.test(s), s);
  assert.match(cx, /reply with exactly one line starting "UNREADABLE:"/);
  assert.match(cx, /Iroha couldn\\'t read your attempt, so nothing was checked/);
  assert.ok(!cx.includes('Feedback received on this one.'));
});

test('astrophysics: a time link only for a single recording, and the notes page opens the notes', () => {
  const recKind = new Function('URL', grab(/const recKind = [\s\S]*?catch \(e\) \{ return ''; \} \};/) + ' return recKind;')(URL);
  assert.strictEqual(recKind('https://drive.google.com/drive/folders/abc'), 'folder');
  assert.strictEqual(recKind('https://www.youtube.com/watch?v=abc'), 'timed');
  assert.strictEqual(recKind('https://youtu.be/abc'), 'timed');
  assert.strictEqual(recKind('https://example.org/lec1.mp4'), 'timed');
  assert.strictEqual(recKind('https://drive.google.com/file/d/abc/view'), 'page', 'opens the file, says the time, promises no jump');
  assert.match(html, /data-a="astropage" data-v="\$\{esc\(l\.id\)\}:/);
  assert.match(html, /return showFile\(lid, fid, pg\)/);
  assert.match(html, /pg \? u \+ '#page=' \+ pg : u/);
});

test('gentle return hides the hours-ladder advice, and the scene names the study day after midnight', () => {
  assert.match(html, /try \{ if \(window\.StudyPlan\?\.gentleOf\?\.\(L\.sched, today\(\)\)\) return null; \} catch \(e\) \{\}\n\s*const s = look\(\)/);
  assert.match(html, /sd !== cal \? ' study day \(past midnight\)' : ''/);
});

test('minutes shown are whole: one-decimal sessions never leak 9:52.0999… PM into the plan', () => {
  assert.match(html, /return Math\.floor\(Math\.max\(ses,blk\)\+1e-6\);\}/);
  assert.ok(!html.includes("shortHours():'12'}-hour"), 'no 2.83-hour label');
});

test('four questions Ayan flagged are marked Important in the desk and the public page, and asked first', () => {
  const pub = fs.readFileSync(path.join(__dirname, '..', 'it23102.html'), 'utf8');
  for (const id of ['q2-11', 'q3-8', 'q3-10', 'q3-7']) for (const [n, src] of [['desk', html], ['public', pub]]) {
    const a = src.indexOf('<details class="q" id="' + id + '">'); assert.ok(a > 0, n + ' ' + id);
    assert.ok(src.slice(a, src.indexOf('</summary>', a)).includes('<span class="imp">★ Important</span>'), n + ' ' + id + ' badge');
    assert.ok(src.includes('<a href="#' + id + '">'), n + ' ' + id + ' listed');
  }
  assert.match(cx, /!learned && IMP\.includes\(q\.id\) \? 1 :/);
});
