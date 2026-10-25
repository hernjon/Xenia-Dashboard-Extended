'use strict';
// The dashboard's own updates, behind a small adapter around electron-updater. The library is loaded lazily (loadUpdater,
// on first use) so nothing touches it, or the network, until a check is really asked for, and tests can pass a fake.
// Nothing here throws at the caller: a failed check or download is logged and reported as "nothing" / false.

function createSelfUpdater({ loadUpdater, log = () => {} }) {
  let updater = null;
  let downloaded = false;
  const get = () => {
    if (updater) return updater;
    const loaded = loadUpdater();
    // Safe by construction: the user decides when to download and install; never pre-releases or older builds.
    loaded.autoDownload = false;
    loaded.autoInstallOnAppQuit = false;
    loaded.allowPrerelease = false;
    loaded.allowDowngrade = false;
    return (updater = loaded);
  };

  return {
    // → { version } only when a newer build exists; null when up to date or on any error.
    async check() {
      try {
        const result = await get().checkForUpdates();
        return result?.isUpdateAvailable && result.updateInfo?.version ? { version: result.updateInfo.version } : null;
      } catch (error) { log(`update check failed: ${error?.message || error}`); return null; }
    },
    // → true once the file is downloaded and verified (electron-updater checks the checksum), false on any error.
    async download(onProgress) {
      let u, listener;
      try {
        u = get();
        listener = info => { try { onProgress?.(Math.round(info.percent)); } catch (error) { log(`progress callback failed: ${error?.message || error}`); } };
        u.on('download-progress', listener);
        await u.downloadUpdate();
        return (downloaded = true);
      } catch (error) { log(`update download failed: ${error?.message || error}`); return false; }
      finally { if (u && listener) u.removeListener('download-progress', listener); }
    },
    // Silent installer, then the app relaunches.
    installNow() { get().quitAndInstall(true, true); },
    // Install when the app quits; ignored until something has been downloaded, since there is nothing to install.
    installOnQuit(enabled) { if (downloaded) get().autoInstallOnAppQuit = !!enabled; },
  };
}

module.exports = { createSelfUpdater };
