'use strict';
// Is there a newer build of the Xenia the dashboard launches? Used once when the app opens, to put up a notification.
// Same rule as Xenia Settings › Updates: up to date when the installed build is the latest published one.

// Which channel an own copy (not installed by the dashboard) belongs to, from its file name; null when it cannot be told.
function channelOfFile(file) {
  const name = String(file || '').replace(/^.*[\\/]/, '').toLowerCase();
  if (name.includes('edge')) return 'edge';
  if (name.includes('canary')) return 'canary';
  if (/^xenia(_master)?(\.exe)?$/.test(name)) return 'xenia';
  return null;
}

// status: what Xenia Settings › Updates shows (channels with `in_use` and `installed`);
// latest(channelId) → the newest release; identify(channelId, release) → the tag of an own copy, or null.
async function findUpdate({ status, configured, platform, supports = () => true, latest, identify }) {
  if (!configured || !platform) return null;
  const used = status?.channels?.find(channel => channel.in_use && channel.installed?.tag);
  if (used) {
    const release = await latest(used.id);
    return release.tag !== used.installed.tag
      ? { channel: used.id, label: used.label, installed: used.installed.tag, latest: release.tag, published_at: release.published_at || '' } : null;
  }
  // A Xenia of the user's own: only when it can be recognised as an official build, so nothing is guessed.
  const id = channelOfFile(configured);
  if (!id || !supports(id, platform)) return null;
  const release = await latest(id);
  const tag = await identify(id, release);
  const label = status?.channels?.find(channel => channel.id === id)?.label || id;
  return tag && tag !== release.tag ? { channel: id, label, installed: tag, latest: release.tag, published_at: release.published_at || '' } : null;
}
function noticeFor(found) {
  return { id: `xenia-update:${found.channel}:${found.latest}`, title: 'Xenia update available', text: `${found.label} ${found.latest} is ready · Xenia Settings › Updates` };
}
module.exports = { findUpdate, channelOfFile, noticeFor };
