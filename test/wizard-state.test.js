'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isFirstRun, markDone, configured } = require('../src/wizard-state');

const fresh = { rom_directory: '', rom_directories: [], xenia_executable: '', games: [] };

test('a brand-new library is a first run; any one thing configured is not', () => {
  assert.equal(isFirstRun(fresh), true);
  assert.equal(isFirstRun({ ...fresh, skin: 'nxe' }), false, 'a saved view');
  assert.equal(isFirstRun({ ...fresh, xenia_executable: '/x/xenia' }), false, 'a Xenia');
  assert.equal(isFirstRun({ ...fresh, rom_directories: ['/roms'] }), false, 'a ROM folder');
  assert.equal(isFirstRun({ ...fresh, rom_directory: '/roms' }), false, 'an old single ROM folder');
  assert.equal(isFirstRun({ ...fresh, wizard_done: true }), false, 'the wizard already ran');
});

test('an unreadable or odd library is never a reason to open the wizard', () => {
  assert.equal(isFirstRun(null), false);
  assert.equal(isFirstRun(undefined), false);
  assert.equal(isFirstRun({}), true, 'an empty object has nothing configured');
  assert.equal(configured({ rom_directories: 'nope' }), false);
});

test('markDone adds the flag and keeps everything else', () => {
  const done = markDone({ ...fresh, skin: 'blades' });
  assert.equal(done.wizard_done, true);
  assert.equal(done.skin, 'blades');
  assert.equal(fresh.wizard_done, undefined, 'the input is not changed');
});
