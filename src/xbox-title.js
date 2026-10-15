'use strict';
// Reads title metadata straight from Xbox 360 game files without executing anything:
// disc images (XDVDFS → default.xex), loose XEX files and STFS packages (LIVE/PIRS/CON, used by XBLA/GOD).
const fs = require('node:fs/promises');
const SECTOR = 2048;
const XDVDFS_MAGIC = Buffer.from('MICROSOFT*XBOX*MEDIA');
// Same probe list Xenia uses: plain XISO, XGD1 variants, XGD3 and XGD2 game partitions.
const PARTITIONS = [0x00000000, 0x0000FB20, 0x00020600, 0x02080000, 0x0FD90000];
const EXECUTION_INFO = 0x00040006;
const STFS_MAGICS = new Set(['LIVE', 'PIRS', 'CON ']);
const MAX_XEX_HEADER = 1024 * 1024;
const hex = value => value.toString(16).toUpperCase().padStart(8, '0');
async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}
function parseXex(header) {
  if (header.length < 0x18 || !['XEX2', 'XEX1'].includes(header.toString('latin1', 0, 4))) throw Error('Not an Xbox 360 executable');
  const count = header.readUInt32BE(0x14);
  if (count > 64 || 0x18 + count * 8 > header.length) throw Error('Invalid XEX header');
  for (let index = 0; index < count; index++) {
    const key = header.readUInt32BE(0x18 + index * 8), value = header.readUInt32BE(0x1C + index * 8);
    if (key !== EXECUTION_INFO) continue;
    if (value + 24 > header.length) throw Error('Invalid XEX execution info');
    return { media_id: hex(header.readUInt32BE(value)), version: header.readUInt32BE(value + 4), title_id: hex(header.readUInt32BE(value + 12)), disc_number: header[value + 18], disc_count: header[value + 19] };
  }
  throw Error('XEX has no execution info');
}
async function readXexHeader(handle, offset, length) {
  const start = await readAt(handle, offset, 0x18);
  if (start.length < 0x18) throw Error('Truncated XEX');
  const size = Math.min(start.readUInt32BE(8), length, MAX_XEX_HEADER);
  return readAt(handle, offset, Math.max(0x18, size));
}
// XDVDFS directories are binary trees of entries addressed in 4-byte units.
function findEntry(directory, name) {
  const wanted = name.toLowerCase(), seen = new Set(), stack = [0];
  while (stack.length) {
    const offset = stack.pop() * 4;
    if (seen.has(offset) || offset + 14 > directory.length || seen.size > 4096) continue;
    seen.add(offset);
    const left = directory.readUInt16LE(offset), right = directory.readUInt16LE(offset + 2);
    if (left === 0xFFFF) continue;
    const length = directory[offset + 13];
    if (offset + 14 + length > directory.length) continue;
    if (directory.toString('latin1', offset + 14, offset + 14 + length).toLowerCase() === wanted) return { sector: directory.readUInt32LE(offset + 4), size: directory.readUInt32LE(offset + 8), attributes: directory[offset + 12] };
    if (left) stack.push(left);
    if (right) stack.push(right);
  }
  return null;
}
async function readIso(handle) {
  for (const partition of PARTITIONS) {
    const volume = await readAt(handle, partition + 32 * SECTOR, 28);
    if (volume.length < 28 || !volume.subarray(0, 20).equals(XDVDFS_MAGIC)) continue;
    const rootSector = volume.readUInt32LE(20), rootSize = Math.min(volume.readUInt32LE(24), 16 * 1024 * 1024);
    const directory = await readAt(handle, partition + rootSector * SECTOR, rootSize);
    const executable = findEntry(directory, 'default.xex');
    if (!executable) throw Error('Disc has no default.xex');
    return { kind: 'iso', ...parseXex(await readXexHeader(handle, partition + executable.sector * SECTOR, executable.size)) };
  }
  throw Error('Not an Xbox 360 disc image');
}
const utf16 = (buffer, at) => Buffer.from(buffer.subarray(at, at + 0x80)).swap16().toString('utf16le').replace(/\0[\s\S]*$/, '').trim();
// What a STFS package is (offset 0x344): the types Xenia installs from a plain package file.
const CONTENT_TYPES = { SAVED_GAME: 0x1, DLC: 0x2, AVATAR_ITEM: 0x9000, GAMER_PICTURE: 0x20000, THEME: 0x30000, TITLE_UPDATE: 0xB0000 };
function readStfs(header) {
  if (header.length < 0x411 + 0x80) throw Error('Truncated package');
  const name = utf16(header, 0x411), title = header.length >= 0x1691 + 0x80 ? utf16(header, 0x1691) : '';
  return { kind: 'stfs', content_type: header.readUInt32BE(0x344), ...(title ? { title_name: title } : {}), title_id: hex(header.readUInt32BE(0x360)), media_id: hex(header.readUInt32BE(0x354)), version: header.readUInt32BE(0x358), disc_number: header[0x366] || 1, disc_count: header[0x367] || 1, ...(name ? { display_name: name } : {}) };
}
async function readTitleInfo(file) {
  const handle = await fs.open(file, 'r');
  try {
    const magic = (await readAt(handle, 0, 4)).toString('latin1');
    if (STFS_MAGICS.has(magic)) return readStfs(Buffer.from(await readAt(handle, 0, 0x1691 + 0x80)));
    if (magic === 'XEX2' || magic === 'XEX1') return { kind: 'xex', ...parseXex(await readXexHeader(handle, 0, MAX_XEX_HEADER)) };
    return await readIso(handle);
  } finally { await handle.close(); }
}
async function isPackage(file) {
  const handle = await fs.open(file, 'r');
  try { return STFS_MAGICS.has((await readAt(handle, 0, 4)).toString('latin1')); } finally { await handle.close(); }
}
module.exports = { readTitleInfo, isPackage, parseXex, findEntry, CONTENT_TYPES };
