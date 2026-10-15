'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { createNotices, DEFAULT_SECONDS } = require('../ui/notice');

function harness() {
  const log = [], jobs = [];
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.classes = new Set(); this.textContent = ''; this.className = ''; this.offsetWidth = 1; this.innerHTML = ''; this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c), contains: c => this.classes.has(c) }; }
    append(...kids) { this.children.push(...kids); } replaceChildren(...kids) { this.children = kids; }
  }
  const toast = new Node('div'); toast.classes.add('hidden');
  const document = { getElementById: id => id === 'toast' ? toast : null, createElement: tag => new Node(tag) };
  const timers = { setTimeout: (work, ms) => { jobs.push({ work, ms }); return jobs.length; } };
  const notices = createNotices({ document, sounds: { play: role => log.push(role) }, timers });
  const text = () => toast.children[1].children.map(kid => kid.textContent);
  const fire = () => jobs.shift().work();
  return { notices, toast, log, jobs, text, fire };
}

test('a notice waits for the boot animation, then rises with the notification sound', () => {
  const h = harness();
  assert.equal(h.notices.post({ title: 'Xenia update available', text: 'Xenia Edge v2' }), true);
  assert.equal(h.notices.showing, false); assert.deepEqual(h.log, [], 'nothing shows or sounds during the boot animation');
  h.notices.start();
  assert.equal(h.notices.showing, true); assert.deepEqual(h.log, ['notify']);
  assert.deepEqual(h.text(), ['Xenia update available', 'Xenia Edge v2']);
  assert.ok(h.toast.classes.has('show') && !h.toast.classes.has('hidden'));
  assert.equal(h.jobs[0].ms, DEFAULT_SECONDS * 1000, 'stays up five seconds unless told otherwise');
});

test('it goes away by itself and the next one follows; the same id is shown once', () => {
  const h = harness(); h.notices.start();
  h.notices.post({ id: 'a', title: 'One', text: 'first' });
  h.notices.post({ id: 'a', title: 'One', text: 'again' }) === false || assert.fail('the same id twice');
  h.notices.post({ title: 'Two', text: 'second' });
  assert.deepEqual(h.text(), ['One', 'first']); assert.equal(h.notices.pending, 2);
  h.fire(); assert.ok(!h.toast.classes.has('show'), 'it leaves');
  h.fire(); assert.deepEqual(h.text(), ['Two', 'second']); assert.deepEqual(h.log, ['notify', 'notify']);
  h.fire(); h.fire(); assert.equal(h.notices.showing, false); assert.ok(h.toast.classes.has('hidden')); assert.equal(h.notices.pending, 0);
});

test('only text is shown (never markup) and bad notices are ignored', () => {
  const h = harness(); h.notices.start();
  assert.equal(h.notices.post(null), false); assert.equal(h.notices.post({ title: 1, text: 'x' }), false); assert.equal(h.notices.post({ title: 'x' }), false);
  h.notices.post({ title: '<img src=x onerror=alert(1)>', text: '<b>bold</b>' });
  assert.deepEqual(h.text(), ['<img src=x onerror=alert(1)>', '<b>bold</b>']);
});

test('the time on screen is the one chosen, from 0 to 5 seconds; at 0 nothing shows or sounds', () => {
  const h = harness(); h.notices.start();
  h.notices.setSeconds(2.5); h.notices.post({ title: 'a', text: 'b' });
  assert.equal(h.jobs[0].ms, 2500);
  h.fire(); h.fire();
  h.notices.setSeconds(0);
  assert.equal(h.notices.post({ title: 'off', text: 'no' }), false); assert.equal(h.notices.showing, false); assert.deepEqual(h.log, ['notify'], 'no sound either');
  for (const bad of [-1, 5.5, NaN, '3', null, undefined]) { h.notices.setSeconds(bad); assert.equal(h.notices.seconds, 0, `${bad} is ignored`); }
  h.notices.setSeconds(5); assert.equal(h.notices.seconds, 5);
});
