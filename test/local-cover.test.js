'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const localCover = require('../src/local-cover');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
const temp = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xd-cover-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; };

test('images are recognised by their bytes, never by their name', async t => {
  const dir = await temp(t), write = async (name, bytes) => { const file = path.join(dir, name); await fs.writeFile(file, bytes); return file; };
  assert.deepEqual([localCover.format(PNG), localCover.format(JPEG), localCover.format(WEBP)], ['png', 'jpeg', 'webp']);
  assert.deepEqual(await localCover.load(await write('a.txt', PNG)), PNG, 'a PNG called .txt is still a PNG');
  for (const [name, bytes] of [['cover.png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')], ['tiny.jpg', Buffer.from([0xff, 0xd8])], ['exe.png', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)])], ['gif.gif', Buffer.from('GIF89a' + 'x'.repeat(30))]]) await assert.rejects(localCover.load(await write(name, bytes)), /JPEG, PNG or WebP/, name);
  await assert.rejects(localCover.load(dir), /not an image file/);
  await assert.rejects(localCover.load(path.join(dir, 'missing.png')), /ENOENT/);
  for (const bad of ['', null, 5, 'a\0b']) await assert.rejects(localCover.load(bad), /Invalid image/);
  const big = path.join(dir, 'big.jpg'); await fs.writeFile(big, JPEG); await fs.truncate(big, localCover.MAX_FILE + 1);
  await assert.rejects(localCover.load(big), /larger than 16 MB/);
});
test('a JPEG stays a JPEG and PNG or WebP keep their transparency as PNG, scaled down when huge', () => {
  const log = [];
  const decoder = size => ({ createFromBuffer: () => ({ isEmpty: () => size === 0, getSize: () => ({ width: 100, height: size }), resize(options) { log.push(options.height); return { ...this, getSize: () => ({ width: 1, height: options.height }) }; }, toJPEG: quality => { log.push(`jpeg${quality}`); return JPEG; }, toPNG: () => { log.push('png'); return PNG; } }) });
  assert.deepEqual({ ...localCover.convert(JPEG, decoder(800)) }, { bytes: JPEG, extension: 'jpg' }); assert.deepEqual(log, ['jpeg90'], 'a normal image is not resized');
  log.length = 0; assert.deepEqual({ ...localCover.convert(PNG, decoder(800)) }, { bytes: PNG, extension: 'png' }); assert.deepEqual(log, ['png'], 'a PNG is never flattened to a JPEG');
  log.length = 0; assert.equal(localCover.convert(WEBP, decoder(4000)).extension, 'png'); assert.deepEqual(log, [1200, 'png']);
  assert.throws(() => localCover.convert(PNG, decoder(0)), /could not be read/);
  assert.throws(() => localCover.convert(Buffer.from('nope'), decoder(10)), /JPEG, PNG or WebP/);
  assert.throws(() => localCover.convert(PNG, { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ height: 5 }), toPNG: () => Buffer.from('not a png at all.....') }) }), /could not be converted/);
});
