'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { compareVersions, normalizeMode, installKind, canSelfUpdate, dashboardAction, updatedNotice, xeniaAction, xeniaUpdatedNotice } = require('../src/update-policy');

test('compareVersions orders numerically and puts a pre-release before its release', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('1.4.0', '1.4.0'), 0);
  assert.equal(compareVersions('1.4.0-rc.1', '1.4.0'), -1);
  assert.equal(compareVersions('1.4.0', '1.4.0-rc.1'), 1);
  assert.equal(compareVersions('1.4', '1.4.0'), 0);
  assert.equal(compareVersions('garbage', '0.0.0'), 0);
  assert.equal(compareVersions(undefined, '0.0.1'), -1);
});

test('normalizeMode accepts only auto, everything else is notify', () => {
  assert.equal(normalizeMode('auto'), 'auto');
  for (const v of ['notify', 'AUTO', '', null, undefined, 1, {}]) assert.equal(normalizeMode(v), 'notify');
});

test('installKind tells the five kinds apart', () => {
  const k = o => installKind({ packaged: true, platform: 'linux', env: {}, appImageWritable: false, ...o });
  assert.equal(k({ platform: 'win32' }), 'setup');
  assert.equal(k({ platform: 'win32', env: { PORTABLE_EXECUTABLE_DIR: 'x' } }), 'portable');
  assert.equal(k({ env: { APPIMAGE: '/a.AppImage' }, appImageWritable: true }), 'appimage');
  assert.equal(k({ env: { APPIMAGE: '/a.AppImage' }, appImageWritable: false }), 'appimage-locked');
  assert.equal(k({ appImageWritable: true }), 'appimage-locked');
  assert.equal(k({ packaged: false, platform: 'win32' }), 'source');
  assert.equal(k({ packaged: false, env: { APPIMAGE: '/a', PORTABLE_EXECUTABLE_DIR: 'x' }, appImageWritable: true }), 'source');
});

test('canSelfUpdate is true only for setup and appimage', () => {
  for (const kind of ['setup', 'appimage']) assert.equal(canSelfUpdate(kind), true);
  for (const kind of ['portable', 'appimage-locked', 'source']) assert.equal(canSelfUpdate(kind), false);
});

test('dashboardAction follows the kind and the mode and ignores older or equal versions', () => {
  const a = o => dashboardAction({ kind: 'setup', mode: 'notify', current: '1.0.0', latest: '1.1.0', gameRunning: false, ...o });
  assert.equal(a({}), 'notify');
  assert.equal(a({ mode: 'auto' }), 'auto-download');
  assert.equal(a({ kind: 'appimage', mode: 'auto' }), 'auto-download');
  assert.equal(a({ kind: 'portable', mode: 'auto' }), 'open-page');
  assert.equal(a({ kind: 'appimage-locked' }), 'open-page');
  assert.equal(a({ kind: 'source', mode: 'auto' }), 'none');
  assert.equal(a({ latest: '' }), 'none');
  assert.equal(a({ latest: undefined }), 'none');
  assert.equal(a({ latest: '1.0.0' }), 'none');
  assert.equal(a({ latest: '0.9.0' }), 'none');
  assert.equal(a({ mode: 'auto', gameRunning: true }), 'auto-download');
});

test('updatedNotice only fires for a real upgrade from a known version', () => {
  assert.deepEqual(updatedNotice({ lastRun: '1.0.0', current: '1.1.0' }), { from: '1.0.0', to: '1.1.0' });
  assert.equal(updatedNotice({ lastRun: '', current: '1.1.0' }), null);
  assert.equal(updatedNotice({ lastRun: undefined, current: '1.1.0' }), null);
  assert.equal(updatedNotice({ lastRun: '1.1.0', current: '1.1.0' }), null);
  assert.equal(updatedNotice({ lastRun: '1.2.0', current: '1.1.0' }), null);
  for (const garbage of ['garbage', 'AUTO', '1.x', ' ', 42, {}, ['1.0.0'], true])
    assert.equal(updatedNotice({ lastRun: garbage, current: '1.1.0' }), null, `nothing for ${JSON.stringify(garbage)}`);
  assert.deepEqual(updatedNotice({ lastRun: 'v1.0.0', current: '1.1.0' }), { from: 'v1.0.0', to: '1.1.0' }, 'a v-prefixed version still counts');
});

test('xeniaAction never auto-installs an unmanaged copy or while a game runs', () => {
  const found = { channel: 'edge', latest: 'v2' };
  const a = o => xeniaAction({ found, managed: true, mode: 'auto', gameRunning: false, ...o });
  assert.equal(a({}), 'auto-install');
  assert.equal(a({ managed: false }), 'notify');
  assert.equal(a({ gameRunning: true }), 'notify');
  assert.equal(a({ mode: 'notify' }), 'notify');
  assert.equal(a({ found: null }), 'none');
});

test('xeniaUpdatedNotice needs the same channel', () => {
  const v = (channel, tag) => ({ channel, tag });
  assert.deepEqual(xeniaUpdatedNotice({ last: v('edge', 'v1'), now: v('edge', 'v2') }), { channel: 'edge', from: 'v1', to: 'v2' });
  assert.equal(xeniaUpdatedNotice({ last: v('edge', 'v1'), now: v('canary', 'v2') }), null);
  assert.equal(xeniaUpdatedNotice({ last: v('edge', 'v1'), now: v('edge', 'v1') }), null);
  assert.equal(xeniaUpdatedNotice({ last: null, now: v('edge', 'v2') }), null);
  assert.equal(xeniaUpdatedNotice({ last: v('edge', 'v1'), now: null }), null);
  for (const bad of [42, {}, ['v1'], true, ''])
    assert.equal(xeniaUpdatedNotice({ last: v('edge', bad), now: v('edge', 'v2') }), null, `no notice from tag ${JSON.stringify(bad)}`);
  assert.equal(xeniaUpdatedNotice({ last: v('edge', 'v1'), now: v('edge', 42) }), null);
  assert.equal(xeniaUpdatedNotice({ last: v('', 'v1'), now: v('', 'v2') }), null, 'a channel must be named');
  assert.equal(xeniaUpdatedNotice({ last: v(7, 'v1'), now: v(7, 'v2') }), null);
  assert.equal(xeniaUpdatedNotice({ last: 'edge', now: v('edge', 'v2') }), null);
});
