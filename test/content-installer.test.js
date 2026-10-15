'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const installer = require('../src/content-installer');
const scanner = require('../src/scanner');

const TYPES = { save: 1, dlc: 2, theme: 0x30000, update: 0xB0000, arcade: 0xD0000 };
// A STFS header as Xbox 360 packages have it: magic, content type at 0x344, title ID at 0x360, names in UTF-16BE.
function stfs({ type, titleId = 0x4D5307D5, name = 'Pack', title = 'Gears of War', magic = 'LIVE', size = 0x4000, fill = 7 }) {
  const buffer = Buffer.alloc(size, fill);
  buffer.fill(0, 0, 0x1800); buffer.write(magic, 0, 'latin1'); buffer.writeUInt32BE(type, 0x344); buffer.writeUInt32BE(titleId, 0x360);
  Buffer.from(name, 'utf16le').swap16().copy(buffer, 0x411); Buffer.from(title, 'utf16le').swap16().copy(buffer, 0x1691);
  return buffer;
}
const temp = async t => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xd-content-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; };

test('only DLC and title updates are accepted, judged by the package\'s own header', async t => {
  const root = await temp(t);
  const write = async (name, buffer) => { const file = path.join(root, name); await fs.writeFile(file, buffer); return file; };
  const dlc = await installer.inspect(await write('dlc', stfs({ type: TYPES.dlc, name: 'Pack 1' })));
  assert.deepEqual([dlc.kind.id, dlc.info.title_id, dlc.info.display_name, dlc.info.title_name], ['dlc', '4D5307D5', 'Pack 1', 'Gears of War']);
  assert.equal((await installer.inspect(await write('tu', stfs({ type: TYPES.update, magic: 'PIRS' })))).kind.label, 'Title update');
  for (const [name, buffer, pattern] of [
    ['save', stfs({ type: TYPES.save }), /not DLC or a title update/], ['arcade', stfs({ type: TYPES.arcade }), /not DLC or a title update/], ['theme', stfs({ type: TYPES.theme }), /not DLC or a title update/],
    ['junk', Buffer.alloc(0x4000, 1), /./], ['tiny', Buffer.alloc(100), /unexpected size/], ['exe', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(0x4000)]), /./]
  ]) await assert.rejects(installer.inspect(await write(name, buffer)), pattern, name);
  await fs.mkdir(path.join(root, 'folder')); await assert.rejects(installer.inspect(path.join(root, 'folder')), /not a regular file/);
  // Windows only lets administrators (or Developer Mode) create symlinks; without that there is nothing to refuse.
  if (await fs.symlink(path.join(root, 'tu'), path.join(root, 'link')).then(() => true, error => error.code === 'EPERM' ? false : Promise.reject(error))) await assert.rejects(installer.inspect(path.join(root, 'link')), /not a regular file/);
});
test('the destination is worked out from the header and file names cannot escape', () => {
  const root = path.join(path.sep, 'x', 'content');
  assert.equal(installer.destination(root, '4D5307D5', 0xB0000, 'tu00000001'), path.join(root, '0000000000000000', '4D5307D5', '000B0000', 'tu00000001'));
  assert.equal(installer.destination(root, '4D5307D5', 2, 'abc'), path.join(root, '0000000000000000', '4D5307D5', '00000002', 'abc'));
  for (const bad of ['../x', 'a/b', 'a\\b', '', '.hidden', 'a\0b', 'x'.repeat(121), 'con:', 'a|b', 'ends ', null, 5]) assert.throws(() => installer.safeFileName(bad), /unusable file name/, String(bad));
  for (const [id, type] of [['4d5307d5', 2], ['4D5307D', 2], ['../..', 2], ['4D5307D5', 1], ['4D5307D5', 0xD0000]]) assert.throws(() => installer.destination(root, id, type, 'a'), /not DLC or a title update/);
});
test('installing copies the package unchanged, reports progress and leaves no scratch file', async t => {
  const root = await temp(t), content = path.join(root, 'content'), big = stfs({ type: TYPES.dlc, size: 3 * 1024 * 1024 + 123, fill: 9 });
  const source = path.join(root, 'dl', 'ABCDEF0123456789'); await fs.mkdir(path.dirname(source)); await fs.writeFile(source, big);
  const progress = [];
  const result = await installer.install(source, content, { onProgress: p => progress.push(p) });
  const expected = path.join(content, '0000000000000000', '4D5307D5', '00000002', 'ABCDEF0123456789');
  assert.deepEqual([result.path, result.size, result.kind, result.label, result.title_id], [expected, big.length, 'dlc', 'DLC', '4D5307D5']);
  assert.deepEqual(await fs.readFile(expected), big);
  assert.ok(progress.length >= 3 && progress.at(-1).received === big.length && progress.at(-1).total === big.length);
  assert.deepEqual(await fs.readdir(path.dirname(expected)), ['ABCDEF0123456789']);
  assert.equal(await installer.installed(content, '4D5307D5', TYPES.dlc, 'ABCDEF0123456789'), true); assert.equal(await installer.installed(content, '4D5307D5', TYPES.dlc, 'other'), false);
  await installer.install(source, content);   // reinstalling replaces it without error
  assert.deepEqual(await fs.readFile(expected), big);
  await assert.rejects(installer.install(path.join(root, 'missing'), content), /ENOENT/);
  await fs.writeFile(path.join(root, 'save'), stfs({ type: TYPES.save })); await assert.rejects(installer.install(path.join(root, 'save'), content), /not DLC or a title update/);
  await assert.rejects(fs.stat(path.join(content, '0000000000000000', '4D5307D5', '00000001')), 'nothing is created for a refused package');
});
test('a failed copy removes its scratch file', async t => {
  const root = await temp(t), content = path.join(root, 'content');
  const source = path.join(root, 'pkg'); await fs.writeFile(source, stfs({ type: TYPES.update }));
  await fs.mkdir(path.join(content, '0000000000000000', '4D5307D5', '000B0000', 'pkg'), { recursive: true });   // a folder is in the way
  await assert.rejects(installer.install(source, content));
  assert.deepEqual((await fs.readdir(path.join(content, '0000000000000000', '4D5307D5', '000B0000'))).filter(name => name.endsWith('.tmp')), []);
});
test('what Xenia already has for a title is listed across profile folders', async t => {
  const root = await temp(t), content = path.join(root, 'content');
  const put = async (owner, type, name, buffer) => { const dir = path.join(content, owner, '4D5307D5', type); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, name), buffer); };
  await put('0000000000000000', '00000002', 'dlc-one', stfs({ type: TYPES.dlc, name: 'Map Pack' }));
  await put('0000000000000000', '000B0000', 'tu-two', stfs({ type: TYPES.update, name: 'Title Update 2' }));
  await put('E000000000000001', '00000002', 'profile-dlc', stfs({ type: TYPES.dlc, name: 'Mine' }));
  await put('0000000000000000', '00000001', 'a-save', stfs({ type: TYPES.save }));
  await put('0000000000000000', '00000002', 'half.tmp', Buffer.alloc(10)); await put('0000000000000000', '00000002', 'plain-file', Buffer.from('not a package'));
  const list = await installer.listInstalled(content, '4D5307D5');
  assert.deepEqual(list.map(item => [item.kind, item.name, item.display_name, item.shared]), [['dlc', 'dlc-one', 'Map Pack', true], ['dlc', 'plain-file', '', true], ['dlc', 'profile-dlc', 'Mine', false], ['update', 'tu-two', 'Title Update 2', true]]);
  assert.deepEqual(await installer.listInstalled(content, '58410954'), []); assert.deepEqual(await installer.listInstalled(path.join(root, 'none'), '4D5307D5'), []);
  await assert.rejects(installer.listInstalled(content, '../x'), /Invalid title ID/);
});
test('the scanner keeps DLC and updates out of the game list and finds them as installable packages', async t => {
  const root = await temp(t);
  await fs.mkdir(path.join(root, 'sub'));
  await fs.writeFile(path.join(root, 'Arcade Game (XBLA)'), stfs({ type: TYPES.arcade, titleId: 0x58410954, name: 'Arcade Game', title: 'Arcade Game' }));
  await fs.writeFile(path.join(root, 'sub', '4A1B2C3D4E5F6071'), stfs({ type: TYPES.dlc, name: 'Map Pack 1' }));
  await fs.writeFile(path.join(root, 'sub', 'tu00000005_00000000'), stfs({ type: TYPES.update, name: 'Title Update 5' }));
  await fs.writeFile(path.join(root, 'sub', 'save-file'), stfs({ type: TYPES.save }));
  await fs.writeFile(path.join(root, 'sub', 'Game.iso'), 'not a real iso'); await fs.writeFile(path.join(root, 'sub', 'notes.txt'), 'hello');
  const games = await scanner.scanDirectory(root);
  assert.deepEqual(games.map(game => game.title).sort(), ['Arcade Game', 'Game'], 'DLC, updates and saves are not games');
  const packages = await scanner.scanPackages(root);
  assert.deepEqual(packages.map(item => [item.name, item.title_id, item.content_type, item.display_name]), [['4A1B2C3D4E5F6071', '4D5307D5', 2, 'Map Pack 1'], ['tu00000005_00000000', '4D5307D5', 0xB0000, 'Title Update 5']]);
  assert.equal(packages[0].size, 0x4000); assert.equal(packages[0].path, path.join(root, 'sub', '4A1B2C3D4E5F6071'));
  assert.deepEqual(await scanner.scanPackages(''), []);
  assert.equal((await scanner.scanPackages(root, undefined, 1)).length, 1, 'the scan stops at its limit');
});
