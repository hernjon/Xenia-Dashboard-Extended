'use strict';
// "Game details": x360db metadata (cached locally) plus what Xenia has installed for the title.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const INFO = 'https://raw.githubusercontent.com/xenia-manager/x360db/main/titles/';
// Xbox 360 content types, as folder names under content/<XUID>/<TITLEID>/.
const TYPES = { '00000001': 'saves', '00000002': 'downloadable_content', '000B0000': 'title_updates', '00090000': 'avatar_items', '00020000': 'gamer_pictures', '00030000': 'themes' };
const text = (value, limit) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
function clean(raw, titleId) {
  return { title: text(raw?.title?.full, 200), genre: Array.isArray(raw?.genre) ? raw.genre.map(g => text(g, 60)).filter(Boolean).slice(0, 6) : [], developer: text(raw?.developer, 120), publisher: text(raw?.publisher, 120), release_date: text(raw?.release_date, 20), user_rating: text(raw?.user_rating, 10), description: text(raw?.description?.full, 4000), title_id: titleId };
}
async function metadata(titleId, request, cacheDirectory) {
  if (!/^[0-9A-F]{8}$/.test(titleId)) throw Error('Invalid title ID');
  const cache = path.join(cacheDirectory, `${titleId}.json`);
  try { return JSON.parse(await fs.readFile(cache, 'utf8')); } catch { /* Not cached yet. */ }
  const info = clean(JSON.parse((await request(`${INFO}${titleId}/info.json`, 1024 * 1024)).toString('utf8')), titleId);
  await fs.mkdir(cacheDirectory, { recursive: true });
  const temp = `${cache}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  await fs.writeFile(temp, JSON.stringify(info), { mode: 0o600, flag: 'wx' }); await fs.rename(temp, cache);
  return info;
}
async function entries(directory) { try { return await fs.readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []; throw error; } }
// Counts installed items per content type across every profile folder (and the shared 0000… one).
async function installed(contentRoot, titleId) {
  if (!/^[0-9A-F]{8}$/.test(titleId)) throw Error('Invalid title ID');
  const counts = Object.fromEntries(Object.values(TYPES).map(type => [type, 0]));
  for (const profile of await entries(contentRoot)) {
    if (!profile.isDirectory() || !/^[0-9A-F]{16}$/i.test(profile.name)) continue;
    for (const type of await entries(path.join(contentRoot, profile.name, titleId))) {
      const key = TYPES[type.name.toUpperCase()];
      if (key && type.isDirectory()) counts[key] += (await entries(path.join(contentRoot, profile.name, titleId, type.name))).length;
    }
  }
  return counts;
}
module.exports = { metadata, installed, clean };
