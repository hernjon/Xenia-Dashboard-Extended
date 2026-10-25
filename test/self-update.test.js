'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSelfUpdater } = require('../src/self-update');

// A stand-in for electron-updater's autoUpdater: the real one is never loaded by tests.
// It models the library's install-on-quit rule (BaseUpdater.addQuitHandler in 6.8.x): when a download finishes, a quit
// handler is registered only if autoInstallOnAppQuit is true at that moment; at quit time the handler reads the flag again.
// `work` is the download itself (emit progress, throw to fail); quit() runs the handler like the app quitting would.
function fakeUpdater(over = {}) {
  const u = new EventEmitter();
  Object.assign(u, {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    currentVersion: { version: '1.0.0' },
    quitArgs: null, quitHandler: null, installedOnQuit: false, flagDuringDownload: null,
    checkForUpdates: async () => ({ updateInfo: { version: '1.1.0' }, isUpdateAvailable: true }),
    work: async () => {},
    async downloadUpdate() {
      u.flagDuringDownload = u.autoInstallOnAppQuit;
      await u.work();
      if (!u.quitHandler && u.autoInstallOnAppQuit) u.quitHandler = () => { if (u.autoInstallOnAppQuit) u.installedOnQuit = true; };
      return [];
    },
    quit() { u.quitHandler?.(); },
    quitAndInstall(...args) { u.quitArgs = args; },
  }, over);
  return u;
}
const make = (updater, logs = []) => ({ logs, s: createSelfUpdater({ loadUpdater: () => updater, log: m => logs.push(m) }) });

test('the updater is configured safely (no auto download, no install on quit, no pre-release, no downgrade) and loaded only on first use', async () => {
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
  const u = fakeUpdater({ work: async () => { for (const percent of [3.2, 50.7, 100]) u.emit('download-progress', { percent }); } });
  const seen = [];
  const { s } = make(u);
  assert.equal(await s.download(p => seen.push(p)), true);
  assert.deepEqual(seen, [3, 51, 100]);
});

test('a failed download resolves false and installOnQuit(true) then installs nothing', async () => {
  const u = fakeUpdater({ work: async () => { throw new Error('checksum'); } });
  const { s } = make(u);
  assert.equal(await s.download(() => {}), false);
  s.installOnQuit(true);
  assert.equal(u.autoInstallOnAppQuit, false);
  u.quit();
  assert.equal(u.installedOnQuit, false);
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

test('install on quit is off except while a download runs, so the library can register its quit handler', async () => {
  const u = fakeUpdater();
  const { s } = make(u);
  await s.check();
  assert.equal(u.autoInstallOnAppQuit, false);
  assert.equal(await s.download(() => {}), true);
  assert.equal(u.flagDuringDownload, true, 'on while downloading');
  assert.equal(u.autoInstallOnAppQuit, false, 'off again once the download is done');
  assert.ok(u.quitHandler, 'the library registered its quit handler');
});

test('after a successful download, quitting installs only when installOnQuit(true) was the last word', async () => {
  const off = fakeUpdater();
  const a = make(off).s;
  await a.download(() => {});
  a.installOnQuit(false);
  off.quit();
  assert.equal(off.installedOnQuit, false, 'installOnQuit(false): nothing installed');
  const on = fakeUpdater();
  const b = make(on).s;
  await b.download(() => {});
  b.installOnQuit(true);
  on.quit();
  assert.equal(on.installedOnQuit, true, 'installOnQuit(true): installed on quit');
  const notSaid = fakeUpdater();
  await make(notSaid).s.download(() => {});
  notSaid.quit();
  assert.equal(notSaid.installedOnQuit, false, 'without installOnQuit(true) nothing is installed');
});

test('a failed download registers no quit handler and leaves install on quit off', async () => {
  const u = fakeUpdater({ work: async () => { throw new Error('ECONNRESET'); } });
  const { s, logs } = make(u);
  assert.equal(await s.download(() => {}), false);
  assert.equal(u.flagDuringDownload, true);
  assert.equal(u.autoInstallOnAppQuit, false, 'off again after a failure');
  assert.equal(u.quitHandler, null);
  assert.ok(logs.some(m => m.includes('ECONNRESET')));
});

test('the progress listener is removed after the download, and a throwing progress callback cannot break it', async () => {
  const u = fakeUpdater({ work: async () => { u.emit('download-progress', { percent: 10 }); u.emit('download-progress', { percent: 90 }); } });
  const { s, logs } = make(u);
  let calls = 0;
  assert.equal(await s.download(() => { calls++; throw new Error('renderer gone'); }), true);
  assert.equal(calls, 2);
  assert.ok(logs.some(m => m.includes('renderer gone')));
  assert.equal(u.listenerCount('download-progress'), 0, 'removed after a successful download');
  const failing = fakeUpdater({ work: async () => { throw new Error('boom'); } });
  await make(failing).s.download(() => {});
  assert.equal(failing.listenerCount('download-progress'), 0, 'removed after a failed download');
});
