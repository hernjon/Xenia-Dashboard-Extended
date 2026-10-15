'use strict';
// Community-optimized settings for one game, from github.com/xenia-manager/optimized-settings (one small TOML per
// title ID, in the same format as a per-game override file). The file is never trusted: only keys that exist in the
// Xenia the user runs, with the right type and an allowed value, can become a change, and the user sees them first.
const xeniaConfig = require('./xenia-config');

const BASE = 'https://raw.githubusercontent.com/xenia-manager/optimized-settings/main/';
const MAX_FILE = 64 * 1024, MAX_INDEX = 1024 * 1024;
const TITLE_ID = /^[0-9A-F]{8}$/;

// Returns { status, bytes }. A 404 is a normal answer ("no settings for this game"), not an error.
async function get(url, fetcher, limit) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (response.status === 404) return { status: 404, bytes: null };
  if (!response.ok) throw Error(`The settings service answered ${response.status}. Try again later.`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw Error('The settings file is too large'); chunks.push(Buffer.from(chunk)); }
  return { status: 200, bytes: Buffer.concat(chunks) };
}
async function fetchSettings(titleId, fetcher) {
  if (typeof titleId !== 'string' || !TITLE_ID.test(titleId)) throw Error('Invalid title ID');
  const { bytes } = await get(`${BASE}settings/${titleId}.toml`, fetcher, MAX_FILE);
  if (!bytes) return null;
  const text = bytes.toString('utf8');
  if (text.includes('\0')) throw Error('The settings file is not text');
  return { title: /^#\s*Title Name:\s*(.+)$/m.exec(text)?.[1].trim().slice(0, 120) || '', text };
}
// { id → last_modified }, best effort: the date is only shown to the user.
async function fetchIndex(fetcher) {
  try {
    const { bytes } = await get(`${BASE}data/settings.json`, fetcher, MAX_INDEX);
    const list = JSON.parse(bytes.toString('utf8'));
    return new Map((Array.isArray(list) ? list : []).filter(entry => typeof entry?.id === 'string' && TITLE_ID.test(entry.id)).map(entry => [entry.id, String(entry.last_modified || '').slice(0, 10)]));
  } catch { return new Map(); }
}

const sameType = (existing, incoming) => existing === incoming || (existing === 'float' && incoming === 'int');
// Compares the community file with the user's Xenia: what would change, and what cannot be applied.
function plan(globalText, overrideText, text) {
  const global = xeniaConfig.parse(globalText), override = overrideText ? xeniaConfig.parse(overrideText) : null, incoming = xeniaConfig.parse(text);
  const changes = [], skipped = [];
  let unchanged = 0;
  for (const entry of incoming.entries.values()) {
    const name = `${entry.section} › ${entry.key}`, known = xeniaConfig.get(global, entry.section, entry.key);
    if (!known) { skipped.push({ section: entry.section, key: entry.key, reason: 'this Xenia build has no such setting' }); continue; }
    if (!sameType(known.type, entry.type)) { skipped.push({ section: entry.section, key: entry.key, reason: `expected ${known.type}, the file has ${entry.type}` }); continue; }
    try { xeniaConfig.validate(known, entry.value); if (typeof entry.value === 'string' && entry.value.length > 128) throw Error('the value is too long'); } catch (error) { skipped.push({ section: entry.section, key: entry.key, reason: error.message }); continue; }
    const mine = override && xeniaConfig.get(override, entry.section, entry.key), current = mine ? mine.value : known.value;
    if (current === entry.value) { unchanged++; continue; }
    changes.push({ section: entry.section, key: entry.key, name, type: known.type, from: current, to: entry.value, note: entry.description.split('\n')[0] || '' });
  }
  return { changes, skipped, unchanged };
}
// Writes the changes into the game's override text (creating sections as needed); other overrides are kept.
function apply(overrideText, changes) {
  return changes.reduce((text, change) => xeniaConfig.setOverride(text, change.section, change.key, change.type, change.to), overrideText || '');
}
module.exports = { BASE, fetchSettings, fetchIndex, plan, apply };
