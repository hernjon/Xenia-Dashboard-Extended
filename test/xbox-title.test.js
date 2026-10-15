'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readTitleInfo, findEntry } = require('../src/xbox-title');

function xex(titleId, mediaId, disc = 1, discs = 1) {
  const header = Buffer.alloc(0x100);
  header.write('XEX2', 0, 'latin1'); header.writeUInt32BE(0x100, 8); header.writeUInt32BE(2, 0x14);
  header.writeUInt32BE(0x00010001, 0x18); header.writeUInt32BE(0, 0x1C);
  header.writeUInt32BE(0x00040006, 0x20); header.writeUInt32BE(0x40, 0x24);
  header.writeUInt32BE(mediaId, 0x40); header.writeUInt32BE(titleId, 0x4C); header[0x52] = disc; header[0x53] = discs;
  return header;
}
function entry(name, sector, size, left = 0, right = 0) {
  const buffer = Buffer.alloc(Math.ceil((14 + name.length) / 4) * 4);
  buffer.writeUInt16LE(left, 0); buffer.writeUInt16LE(right, 2); buffer.writeUInt32LE(sector, 4); buffer.writeUInt32LE(size, 8);
  buffer[12] = 0x20; buffer[13] = name.length; buffer.write(name, 14, 'latin1');
  return buffer;
}

test('reads title, media and disc numbers from an XGD2 disc image', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nxe-title-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const partition = 0x0FD90000, file = path.join(root, 'Game (Disc 2).iso');
  const handle = await fs.open(file, 'w');
  try {
    const volume = Buffer.alloc(28); volume.write('MICROSOFT*XBOX*MEDIA', 0, 'latin1'); volume.writeUInt32LE(40, 20); volume.writeUInt32LE(2048, 24);
    // Root tree: "media" (left child "default.xex") so the search must follow subtree links.
    const media = entry('media', 50, 2048, 0, 0), wanted = entry('default.xex', 60, 0x100);
    const directory = Buffer.concat([entry('media', 50, 2048, media.length / 4, 0), wanted]);
    await handle.write(volume, 0, volume.length, partition + 32 * 2048);
    await handle.write(directory, 0, directory.length, partition + 40 * 2048);
    const executable = xex(0x4D5307FA, 0x1888BE4E, 2, 4);
    await handle.write(executable, 0, executable.length, partition + 60 * 2048);
  } finally { await handle.close(); }
  assert.deepEqual(await readTitleInfo(file), { kind: 'iso', media_id: '1888BE4E', version: 0, title_id: '4D5307FA', disc_number: 2, disc_count: 4 });
});

test('reads loose XEX files and rejects unknown data', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nxe-title-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'default.xex'), xex(0x58410954, 0x01020304));
  assert.equal((await readTitleInfo(path.join(root, 'default.xex'))).title_id, '58410954');
  await fs.writeFile(path.join(root, 'junk.iso'), Buffer.alloc(4096));
  await assert.rejects(readTitleInfo(path.join(root, 'junk.iso')), /Not an Xbox 360 disc image/);
});

test('directory search survives cycles and malformed entries', () => {
  const looping = entry('a', 1, 1, 0, 0); looping.writeUInt16LE(0, 0); looping.writeUInt16LE(0, 2);
  assert.equal(findEntry(looping, 'default.xex'), null);
  const cycle = Buffer.concat([entry('a', 1, 1, 4, 0), entry('b', 1, 1, 0, 0)]);
  cycle.writeUInt16LE(0, 16);
  assert.equal(findEntry(cycle, 'default.xex'), null);
  assert.equal(findEntry(Buffer.alloc(8, 0xFF), 'default.xex'), null);
});
