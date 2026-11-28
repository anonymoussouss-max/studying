// Active session screen: subject · topic · task, each said once.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = html.slice(html.indexOf('function sessionLabel(a)'), html.indexOf('function activeView(a)'));
const sessionLabel = new Function(src + '; return sessionLabel;')();
test('a topic passed as the task too is shown once', () => {
  assert.strictEqual(sessionLabel({ subject: 'Physics', topic: 'Motion in a Straight Line · lecture 8 practice', task: 'Motion in a Straight Line · lecture 8 practice' }), 'Physics · Motion in a Straight Line · lecture 8 practice');
});
test('a part contained in another is dropped; distinct parts all stay', () => {
  assert.strictEqual(sessionLabel({ subject: 'Maths', topic: 'Homework', task: 'Maths homework: hardest first' }), 'Maths homework: hardest first');
  assert.strictEqual(sessionLabel({ subject: 'Chemistry', topic: 'Mole concept', task: 'Recall 5 questions' }), 'Chemistry · Mole concept · Recall 5 questions');
  assert.strictEqual(sessionLabel({ subject: 'Mixed', topic: '', task: 'Review three mistakes' }), 'Mixed · Review three mistakes');
});
test('the active view uses the label', () => assert.ok(html.includes('<p class="hb-session-label">${esc(sessionLabel(a))}</p>')));
test('reduced motion also stills the speech bubbles and the page colour fade', () => {
  assert.ok(html.includes('@media (prefers-reduced-motion:reduce) { #ame-gif, #ame-bubble, #iroha-bubble { animation:none!important; transition:none!important; } html body.kg-simple { transition:none!important; } }'));
});
