'use strict';
// Installing DLC and title updates the way Xenia expects them: the package file is copied, unchanged, to
//   <content folder>/0000000000000000/<TITLEID>/<CONTENT TYPE>/<original file name>
// (0000000000000000 is the folder shared by every profile). Where it goes is worked out here from the package's own
// header, never from anything the screen sends, and only DLC and title updates are accepted.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const xboxTitle = require('./xbox-title');

const SHARED = '0000000000000000';
const KINDS = new Map([
  [xboxTitle.CONTENT_TYPES.DLC, { id: 'dlc', label: 'DLC' }],
  [xboxTitle.CONTENT_TYPES.TITLE_UPDATE, { id: 'update', label: 'Title update' }]
]);
const MAX_PACKAGE = 4 * 1024 * 1024 * 1024;
const hex8 = value => value.toString(16).toUpperCase().padStart(8, '0');
const kind = type => KINDS.get(type) || null;
const typeFolder = type => hex8(type);

function safeFileName(name) {
  if (typeof name !== 'string' || !name || name.length > 120 || name !== path.basename(name) || /[\\/\0-\x1f:*?"<>|]/.test(name) || name.startsWith('.') || /\s$/.test(name)) throw Error('The package has an unusable file name');
  return name;
}
function destination(contentRoot, titleId, type, name) {
  if (!/^[0-9A-F]{8}$/.test(titleId) || !KINDS.has(type)) throw Error('This is not DLC or a title update');
  return path.join(contentRoot, SHARED, titleId, typeFolder(type), safeFileName(name));
}
async function inspect(source) {
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('The package is not a regular file');
  if (stat.size < 0x2000 || stat.size > MAX_PACKAGE) throw Error('The package has an unexpected size');
  const info = await xboxTitle.readTitleInfo(source);
  if (info.kind !== 'stfs') throw Error('This is not an Xbox 360 content package');
  if (!kind(info.content_type)) throw Error('This is not DLC or a title update');
  return { info, size: stat.size, kind: kind(info.content_type) };
}
async function installed(contentRoot, titleId, type, name) {
  try { return (await fs.stat(destination(contentRoot, titleId, type, name))).isFile(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function install(source, contentRoot, { onProgress = () => {} } = {}) {
  const { info, size, kind: what } = await inspect(source);
  const target = destination(contentRoot, info.title_id, info.content_type, path.basename(source));
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  const input = await fs.open(source, 'r'), output = await fs.open(temp, 'wx', 0o644);
  let copied = 0;
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, copied);
      if (!bytesRead) break;
      await output.write(buffer, 0, bytesRead); copied += bytesRead;
      onProgress({ received: copied, total: size });
    }
    if (copied !== size) throw Error('The copy is incomplete');
    await output.sync(); await output.close(); await input.close();
    await fs.rename(temp, target);
  } catch (error) { await output.close().catch(() => {}); await input.close().catch(() => {}); await fs.unlink(temp).catch(() => {}); throw error; }
  return { path: target, size, kind: what.id, label: what.label, title_id: info.title_id };
}
// Everything Xenia has for a title, across profile folders: DLC and title updates (what this screen manages).
async function listInstalled(contentRoot, titleId) {
  if (!/^[0-9A-F]{8}$/.test(titleId)) throw Error('Invalid title ID');
  const result = [];
  let owners = [];
  try { owners = await fs.readdir(contentRoot, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return result; throw error; }
  for (const owner of owners) {
    if (!owner.isDirectory() || !/^[0-9A-F]{16}$/i.test(owner.name)) continue;
    for (const [type, what] of KINDS) {
      const folder = path.join(contentRoot, owner.name, titleId, typeFolder(type));
      let files = []; try { files = await fs.readdir(folder, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      for (const file of files) {
        if (!file.isFile() || file.name.endsWith('.tmp')) continue;
        const full = path.join(folder, file.name), stat = await fs.stat(full);
        let display = ''; try { display = (await xboxTitle.readTitleInfo(full)).display_name || ''; } catch { /* a header file or folder-style content */ }
        result.push({ name: file.name, kind: what.id, label: what.label, size: stat.size, display_name: display, shared: owner.name === SHARED });
      }
    }
  }
  return result.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}
module.exports = { SHARED, KINDS, kind, destination, safeFileName, inspect, installed, install, listInstalled };
