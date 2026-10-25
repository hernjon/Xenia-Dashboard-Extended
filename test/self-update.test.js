'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSelfUpdater } = require('../src/self-update');

// A stand-in for electron-updater's autoUpdater: the real one is never loaded by tests.
function fakeUpdater(over = {}) {
  const u = new EventEmitter();
  Object.assign(u, {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    currentVersion: { version: '1.0.0' },
    quitArgs: null,
    checkForUpdates: async () => ({ updateInfo: { version: '1.1.0' }, isUpdateAvailable: true }),
    downloadUpdate: async () => [],
    quitAndInstall(...args) { u.quitArgs = args; },
  }, over);
  return u;
}
const make = (updater, logs = []) => ({ logs, s: createSelfUpdater({ loadUpdater: () => updater, log: m => logs.push(m) }) });

test('the updater is configured safely (no auto download, no pre-release, no downgrade) and loaded only on first use', async () => {
  const u = fakeUpdater();
  let loads = 0;
  const s = createSelfUpdater({ loadUpdater: () => { loads++; return u; }, log() {} });
  assert.equal(loads, 0);
  await s.check();
  await s.check();
  assert.equal(loads, 1);
  assert.equal(u.autoDownload, false);
  assert.equal(u.autoInstallOnAppQuit, false);
  assert.equal(u.allowPrerelease, false);
  assert.equal(u.allowDowngrade, false);
});

test('check resolves null when the network fails and never throws', async () => {
  const { s, logs } = make(fakeUpdater({ checkForUpdates: async () => { throw new Error('ENOTFOUND'); } }));
  assert.equal(await s.check(), null);
  assert.ok(logs.some(m => m.includes('ENOTFOUND')));
});

test('check resolves null when loading the updater fails', async () => {
  const s = createSelfUpdater({ loadUpdater: () => { throw new Error('no module'); }, log() {} });
  assert.equal(await s.check(), null);
});

test('check resolves the version only when it is newer', async () => {
  assert.deepEqual(await make(fakeUpdater()).s.check(), { version: '1.1.0' });
  assert.equal(await make(fakeUpdater({ checkForUpdates: async () => ({ updateInfo: { version: '1.0.0' }, isUpdateAvailable: false }) })).s.check(), null);
  assert.equal(await make(fakeUpdater({ checkForUpdates: async () => null })).s.check(), null);
});

test('download reports percents and resolves true', async () => {
  const u = fakeUpdater({
    downloadUpdate: async () => { for (const percent of [3.2, 50.7, 100]) u.emit('download-progress', { percent }); return []; },
  });
  const seen = [];
  const { s } = make(u);
  assert.equal(await s.download(p => seen.push(p)), true);
  assert.deepEqual(seen, [3, 51, 100]);
});

test('a failed download resolves false and installOnQuit(true) then installs nothing', async () => {
  const u = fakeUpdater({ downloadUpdate: async () => { throw new Error('checksum'); } });
  const { s } = make(u);
  assert.equal(await s.download(() => {}), false);
  s.installOnQuit(true);
  assert.equal(u.autoInstallOnAppQuit, false);
});

test('installOnQuit follows the flag after a successful download', async () => {
  const u = fakeUpdater();
  const { s } = make(u);
  await s.download(() => {});
  s.installOnQuit(true);
  assert.equal(u.autoInstallOnAppQuit, true);
  s.installOnQuit(false);
  assert.equal(u.autoInstallOnAppQuit, false);
});

test('installNow installs silently and asks for a relaunch', async () => {
  const u = fakeUpdater();
  const { s } = make(u);
  s.installNow();
  assert.deepEqual(u.quitArgs, [true, true]);
});
