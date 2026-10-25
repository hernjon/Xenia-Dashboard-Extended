'use strict';
// What the updater should do, decided from plain facts (no Electron, no I/O) so every rule can be tested on its own.

const parts = v => {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(-.+)?$/.exec(String(v ?? '').trim().replace(/^v/i, ''));
  return m ? { n: [+m[1], +(m[2] || 0), +(m[3] || 0)], pre: !!m[4] } : { n: [0, 0, 0], pre: false };
};
// -1 | 0 | 1. Numeric per part ('1.10.0' > '1.9.0'); a '-suffix' is older than the bare version; unparsable = 0.0.0.
function compareVersions(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] > y.n[i] ? 1 : -1;
  return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
}

// Anything but an explicit 'auto' stays on the safe side: tell the user, do not install.
const normalizeMode = value => value === 'auto' ? 'auto' : 'notify';

// How this copy of the dashboard was installed decides whether it can replace itself.
function installKind({ packaged, platform, env = {}, appImageWritable }) {
  if (!packaged) return 'source';
  if (env.PORTABLE_EXECUTABLE_DIR) return 'portable';
  if (platform === 'win32') return 'setup';
  if (platform === 'linux') return env.APPIMAGE && appImageWritable ? 'appimage' : 'appimage-locked';
  return 'source';
}
const canSelfUpdate = kind => kind === 'setup' || kind === 'appimage';

// gameRunning is not a factor here: it only delays the install, which is the caller's business.
function dashboardAction({ kind, mode, current, latest }) {
  if (!latest || kind === 'source' || compareVersions(latest, current) <= 0) return 'none';
  if (kind === 'portable' || kind === 'appimage-locked') return 'open-page';
  return canSelfUpdate(kind) && mode === 'auto' ? 'auto-download' : 'notify';
}

// "Updated to X" only after a real upgrade from a version we remember (a first run has nothing to compare).
function updatedNotice({ lastRun, current }) {
  return typeof lastRun === 'string' && lastRun && compareVersions(lastRun, current) < 0 ? { from: lastRun, to: current } : null;
}

// found: what update-notice.findUpdate returns, or null. Only a copy the dashboard installed (managed) is replaced, and never mid-game.
function xeniaAction({ found, managed, mode, gameRunning }) {
  if (!found) return 'none';
  return managed && mode === 'auto' && !gameRunning ? 'auto-install' : 'notify';
}

// last/now: { channel, tag }. A channel switch is not an update.
function xeniaUpdatedNotice({ last, now }) {
  return last && now && last.channel === now.channel && last.tag && now.tag && last.tag !== now.tag
    ? { channel: now.channel, from: last.tag, to: now.tag } : null;
}

module.exports = { compareVersions, normalizeMode, installKind, canSelfUpdate, dashboardAction, updatedNotice, xeniaAction, xeniaUpdatedNotice };
