'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const patches = require('../src/xenia-patches');
const sample = (hash, enabled = false) => `title_name = "Gears Of War"\ntitle_id = "4D5307D5" # MS-2005\nhash = "${hash}" # default.xex\n\n[[patch]]\n    name = "60 FPS"\n    desc = "Increases the \\"vsync\\" target."\n    author = "boma"\n    is_enabled = ${enabled}\n\n    [[patch.be8]]\n        address = 0x8223e7bb\n        value = 0x01\n\n[[patch]]\n    name = 'Black Shading Fix'\n    author = "boma"\n    is_enabled = false # keep\n\n    [[patch.be8]]\n        address = 0x82bb6bbb\n        value = 0x00\n`;

test('parses top-level patch fields and flips is_enabled in place', () => {
  const parsed = patches.parse(sample('1B591620508434A2'));
  assert.deepEqual(parsed.map(p => [p.name, p.desc, p.author, p.enabled]), [['60 FPS', 'Increases the "vsync" target.', 'boma', false], ['Black Shading Fix', '', 'boma', false]]);
  const result = patches.setEnabled(sample('1B591620508434A2'), 'Black Shading Fix', true);
  assert.equal(result.changed, true);
  assert.match(result.text, /^ {4}is_enabled = true # keep$/m);
  assert.equal(result.text.split('\n').filter(line => /is_enabled = true/.test(line)).length, 1);
  assert.equal(patches.setEnabled(sample('1'), 'Missing', true).changed, false);
});

test('lists, toggles across variants and downloads while keeping enabled patches', async t => {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'nxe-patches-'));
  t.after(() => fs.rm(storage, { recursive: true, force: true }));
  assert.deepEqual(await patches.list(storage, '4D5307D5'), { files: 0, patches: [] });
  const served = { 'Gears of War.patch.toml': sample('A'), 'Gears of War (TU5).patch.toml': sample('B') };
  const requests = [];
  const request = async (url, limit) => {
    requests.push([url, limit]);
    if (url.endsWith('/contents/patches')) return Buffer.from(JSON.stringify([...Object.keys(served).map(name => ({ name: `4D5307D5 - ${name}` })), { name: '4D5307D5 - ../escape.patch.toml' }, { name: '58410954 - Banjo.patch.toml' }]));
    return Buffer.from(served[decodeURIComponent(url.split('/').pop()).replace('4D5307D5 - ', '')]);
  };
  assert.equal(await patches.download(storage, '4D5307D5', request), 2);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(([url]) => url.startsWith('https://')));
  let listed = await patches.list(storage, '4D5307D5');
  assert.equal(listed.files, 2);
  assert.deepEqual(listed.patches.map(p => [p.name, p.enabled, p.files.length]), [['60 FPS', false, 2], ['Black Shading Fix', false, 2]]);
  await patches.toggle(storage, '4D5307D5', '60 FPS', true);
  listed = await patches.list(storage, '4D5307D5');
  assert.equal(listed.patches[0].enabled, true);
  await patches.download(storage, '4D5307D5', request);
  assert.equal((await patches.list(storage, '4D5307D5')).patches[0].enabled, true);
  await assert.rejects(patches.toggle(storage, '4D5307D5', 'Nope', true), /Unknown patch/);
  await assert.rejects(patches.list(storage, '../x'), /Invalid title ID/);
  await assert.rejects(patches.download(storage, '4D5307D5', async () => Buffer.from('{"message":"rate limited"}')), /Invalid patch listing/);
});
