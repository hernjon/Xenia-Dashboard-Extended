'use strict';
// Xenia profiles as stored on disk: content/<XUID>/FFFE07D1/00010000/<XUID>/ holds the
// encrypted Account record (gamertag) and one XDBF .gpd per played title (achievements).
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
// Public retail XAM key every Xbox 360 uses to protect Account files.
const RETAIL_KEY = Buffer.from('E1BC159C73B1EAE9AB3170F3AD47EBF3', 'hex');
const ACCOUNT_SIZE = 404;
const ACHIEVEMENT = 1;
const ACHIEVED = 0x00020000, ACHIEVED_ONLINE = 0x00010000;
const XUID = /^[0-9A-F]{16}$/i;
function rc4(key, data) {
  const state = [...Array(256).keys()];
  for (let i = 0, j = 0; i < 256; i++) { j = (j + state[i] + key[i % key.length]) & 255; [state[i], state[j]] = [state[j], state[i]]; }
  const output = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) { i = (i + 1) & 255; j = (j + state[i]) & 255; [state[i], state[j]] = [state[j], state[i]]; output[n] = data[n] ^ state[(state[i] + state[j]) & 255]; }
  return output;
}
const hmac = data => crypto.createHmac('sha1', RETAIL_KEY).update(data).digest().subarray(0, 16);
// Layout: 16-byte HMAC, then RC4(8-byte confounder + X_XAMACCOUNTINFO); gamertag is UTF-16BE at 0x08.
function readAccount(buffer) {
  if (buffer.length !== ACCOUNT_SIZE) throw Error('Unexpected account size');
  const hash = buffer.subarray(0, 16), plain = rc4(hmac(hash), buffer.subarray(16));
  if (!hmac(plain).equals(hash)) throw Error('Account signature mismatch');
  const info = plain.subarray(8);
  return { gamertag: Buffer.from(info.subarray(8, 40)).swap16().toString('utf16le').replace(/\0[\s\S]*$/, '') };
}
function strings(buffer) { const even = buffer.subarray(0, buffer.length & ~1); return Buffer.from(even).swap16().toString('utf16le').split('\0'); }
// XDBF: 0x18-byte header, entry table (18 bytes each), free table (8 bytes each), then data.
function readAchievements(buffer) {
  if (buffer.length < 0x18 || buffer.toString('latin1', 0, 4) !== 'XDBF') throw Error('Not a GPD file');
  const tableLength = buffer.readUInt32BE(8), count = buffer.readUInt32BE(12), freeLength = buffer.readUInt32BE(16);
  const base = 0x18 + tableLength * 18 + freeLength * 8;
  if (count > tableLength || base > buffer.length) throw Error('Invalid GPD tables');
  const achievements = [];
  for (let index = 0; index < count; index++) {
    const offset = 0x18 + index * 18;
    if (buffer.readUInt16BE(offset) !== ACHIEVEMENT) continue;
    const start = base + buffer.readUInt32BE(offset + 10), length = buffer.readUInt32BE(offset + 14);
    if (length < 0x1C || start + length > buffer.length) continue;
    const data = buffer.subarray(start, start + length), size = data.readUInt32BE(0);
    if (size < 0x1C || size > length) continue;
    const flags = data.readUInt32BE(16), [name = '', unlocked = '', locked = ''] = strings(data.subarray(size));
    const achieved = !!(flags & (ACHIEVED | ACHIEVED_ONLINE)), time = data.readBigUInt64BE(20);
    achievements.push({ id: data.readUInt32BE(4), gamerscore: data.readUInt32BE(12), achieved, name, description: achieved ? unlocked : locked || unlocked, ...(achieved && time ? { unlocked_at: new Date(Number(time / 10000n) - 11644473600000).toISOString() } : {}) });
  }
  return achievements.sort((a, b) => Number(b.achieved) - Number(a.achieved) || a.id - b.id);
}
function profileFolder(contentRoot, xuid) { return path.join(contentRoot, xuid, 'FFFE07D1', '00010000', xuid); }
async function list(contentRoot) {
  let entries;
  try { entries = await fs.readdir(contentRoot, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const profiles = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !XUID.test(entry.name) || /^0+$/.test(entry.name)) continue;
    try { profiles.push({ xuid: entry.name.toUpperCase(), ...readAccount(await fs.readFile(path.join(profileFolder(contentRoot, entry.name), 'Account'))) }); }
    catch { /* Not a profile, or an Account file Xenia could not read either. */ }
  }
  return profiles.sort((a, b) => a.gamertag.localeCompare(b.gamertag));
}
async function achievements(contentRoot, xuid, titleId) {
  if (!XUID.test(xuid) || !/^[0-9A-F]{8}$/.test(titleId)) throw Error('Invalid profile or title');
  try { return readAchievements(await fs.readFile(path.join(profileFolder(contentRoot, xuid), `${titleId}.gpd`))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
module.exports = { list, achievements, readAccount, readAchievements, rc4 };
