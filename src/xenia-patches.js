'use strict';
// Game patches in Xenia's format (`<TITLEID> - <name>.patch.toml`, one file per executable
// variant). Xenia applies the file whose module hash matches, so NXE keeps every variant of a
// title and toggles a patch by name across all of them.
const fs = require('node:fs/promises');
const path = require('node:path');
const xeniaConfig = require('./xenia-config');
const LISTING = 'https://api.github.com/repos/xenia-canary/game-patches/contents/patches';
const RAW = 'https://raw.githubusercontent.com/xenia-canary/game-patches/main/patches/';
const ENABLED = /^(\s*is_enabled\s*=\s*)(true|false)(.*)$/;
const STRING = /^\s*(name|desc|author)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')/;
const validTitle = id => typeof id === 'string' && /^[0-9A-F]{8}$/.test(id);
const validFile = (titleId, name) => typeof name === 'string' && name.length < 200 && name.startsWith(`${titleId} - `) && name.endsWith('.patch.toml') && !/[\\/\0]|\.\./.test(name);
function decode(raw) { if (raw.startsWith("'")) return raw.slice(1, -1); try { return JSON.parse(raw); } catch { return raw.slice(1, -1); } }
// Top-level patch fields only: sub-tables like [[patch.be32]] never carry is_enabled.
function parse(text) {
  const patches = [];
  let current = null;
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '[[patch]]') { current = { name: '', desc: '', author: '', enabled: false, line: -1 }; patches.push(current); return; }
    if (/^\[/.test(trimmed)) { if (!trimmed.startsWith('[[patch.')) current = null; return; }
    if (!current) return;
    const field = STRING.exec(line);
    if (field && !current[field[1]]) current[field[1]] = decode(field[2]);
    const enabled = ENABLED.exec(line);
    if (enabled && current.line < 0) { current.enabled = enabled[2] === 'true'; current.line = index; }
  });
  return patches.filter(patch => patch.name && patch.line >= 0);
}
function setEnabled(text, name, enabled) {
  const lines = text.split(/\r?\n/), newline = text.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;
  for (const patch of parse(text)) if (patch.name === name) { lines[patch.line] = lines[patch.line].replace(ENABLED, `$1${enabled ? 'true' : 'false'}$3`); changed = true; }
  return { text: lines.join(newline), changed };
}
function directory(storage) { return path.join(storage, 'patches'); }
async function files(storage, titleId) {
  if (!validTitle(titleId)) throw Error('Invalid title ID');
  try { return (await fs.readdir(directory(storage))).filter(name => validFile(titleId, name)).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
// One entry per patch name, listing which variant files carry it.
async function list(storage, titleId) {
  const names = await files(storage, titleId), byName = new Map();
  for (const file of names) {
    for (const patch of parse(await xeniaConfig.read(path.join(directory(storage), file)))) {
      const entry = byName.get(patch.name) || { name: patch.name, desc: patch.desc, author: patch.author, enabled: false, files: [] };
      entry.enabled = entry.enabled || patch.enabled; entry.files.push(file.replace(/^[0-9A-F]{8} - /, '').replace(/\.patch\.toml$/, ''));
      byName.set(patch.name, entry);
    }
  }
  return { files: names.length, patches: [...byName.values()] };
}
async function toggle(storage, titleId, name, enabled) {
  if (typeof name !== 'string' || typeof enabled !== 'boolean') throw Error('Invalid patch change');
  let found = false;
  for (const file of await files(storage, titleId)) {
    const target = path.join(directory(storage), file), result = setEnabled(await xeniaConfig.read(target), name, enabled);
    if (result.changed) { found = true; await xeniaConfig.write(target, result.text, { backup: false }); }
  }
  if (!found) throw Error('Unknown patch');
}
// Downloads every variant for the title from xenia-canary/game-patches, keeping the user's
// enabled patches when a file is refreshed.
async function download(storage, titleId, request) {
  if (!validTitle(titleId)) throw Error('Invalid title ID');
  const listing = JSON.parse((await request(LISTING, 4 * 1024 * 1024)).toString('utf8'));
  if (!Array.isArray(listing)) throw Error('Invalid patch listing');
  const wanted = listing.map(entry => entry?.name).filter(name => validFile(titleId, name));
  const enabled = new Set((await list(storage, titleId)).patches.filter(patch => patch.enabled).map(patch => patch.name));
  await fs.mkdir(directory(storage), { recursive: true });
  for (const name of wanted) {
    let text = (await request(RAW + encodeURIComponent(name), 1024 * 1024)).toString('utf8');
    if (!new RegExp(`^\\s*title_id\\s*=\\s*["']${titleId}["']`, 'm').test(text)) throw Error(`Unexpected patch file: ${name}`);
    for (const patch of enabled) text = setEnabled(text, patch, true).text;
    await xeniaConfig.write(path.join(directory(storage), name), text, { backup: false });
  }
  return wanted.length;
}
module.exports = { parse, setEnabled, list, toggle, download, validFile };
