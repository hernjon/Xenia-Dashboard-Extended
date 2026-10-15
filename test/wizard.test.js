'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWizard } = require('../ui/wizard');

function build({ games = () => true } = {}) {
  const log = [];
  const steps = [
    { id: 'view', enter: () => log.push('view') },
    { id: 'xenia', enter: () => log.push('xenia') },
    { id: 'folders', enter: () => log.push('folders') },
    { id: 'covers', when: games, enter: () => log.push('covers') }
  ];
  let ended = 0;
  return { wizard: createWizard({ steps, onEnd: () => { ended++; log.push('end'); } }), log, ended: () => ended };
}

test('the steps run in order and the wizard ends after the last one', () => {
  const { wizard, log, ended } = build();
  assert.equal(wizard.active, false);
  wizard.start();
  assert.deepEqual(log, ['view']); assert.equal(wizard.active, true); assert.equal(wizard.step, 'view');
  wizard.next(); wizard.next(); wizard.next();
  assert.deepEqual(log, ['view', 'xenia', 'folders', 'covers']);
  wizard.next();
  assert.deepEqual(log.slice(-1), ['end']); assert.equal(wizard.active, false); assert.equal(ended(), 1);
});

test('the covers step is left out when no games were found, and the progress counts only the steps that apply', () => {
  let games = false;
  const { wizard, log } = build({ games: () => games });
  wizard.start();
  assert.deepEqual({ ...wizard.progress() }, { step: 1, of: 3 });
  wizard.next(); assert.deepEqual({ ...wizard.progress() }, { step: 2, of: 3 });
  wizard.next(); assert.deepEqual({ ...wizard.progress() }, { step: 3, of: 3 });
  wizard.next();
  assert.deepEqual(log, ['view', 'xenia', 'folders', 'end'], 'no covers step');
  games = true;
  const again = build({ games: () => games });
  again.wizard.start();
  assert.deepEqual({ ...again.wizard.progress() }, { step: 1, of: 4 }, 'with games there are four');
});

test('back returns to the previous step, skipping steps that do not apply, and refuses at the first', () => {
  const { wizard, log } = build({ games: () => false });
  wizard.start(); wizard.next(); wizard.next();
  assert.equal(wizard.back(), true); assert.equal(wizard.step, 'xenia');
  assert.equal(wizard.back(), true); assert.equal(wizard.step, 'view');
  assert.equal(wizard.back(), false, 'nothing before the first step');
  assert.deepEqual(log, ['view', 'xenia', 'folders', 'xenia', 'view']);
});

test('a screen that closes moves on only if the wizard opened it', () => {
  const { wizard, log } = build();
  wizard.start();
  wizard.screenClosed();
  assert.deepEqual(log, ['view'], 'a screen the wizard did not open changes nothing');
  assert.equal(wizard.screenClosed(), false, 'and it says it did not move');
  wizard.next(); wizard.open(); assert.equal(wizard.screenClosed(), true);
  assert.deepEqual(log, ['view', 'xenia', 'folders']);
  wizard.screenClosed();
  assert.deepEqual(log, ['view', 'xenia', 'folders'], 'one close, one step');
});

test('skipping ends it at once, once; and an ended wizard ignores everything', () => {
  const { wizard, log, ended } = build();
  wizard.start(); wizard.next();
  wizard.skipAll(); wizard.skipAll();
  assert.equal(ended(), 1); assert.equal(wizard.active, false);
  assert.equal(wizard.next(), null); assert.equal(wizard.back(), false);
  wizard.open(); wizard.screenClosed();
  assert.deepEqual(log, ['view', 'xenia', 'end']);
});

test('a wizard without steps is refused', () => {
  assert.throws(() => createWizard({ steps: [], onEnd() {} }), /needs steps/);
});

test('reenter shows the current step again without moving', () => {
  const { wizard, log } = build();
  wizard.start(); wizard.next();
  wizard.reenter();
  assert.deepEqual(log, ['view', 'xenia', 'xenia']); assert.equal(wizard.step, 'xenia');
  wizard.skipAll(); wizard.reenter();
  assert.deepEqual(log, ['view', 'xenia', 'xenia', 'end'], 'an ended wizard shows nothing');
});
