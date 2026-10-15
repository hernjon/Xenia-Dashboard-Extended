'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const gameInfo = require('../src/game-info');

test('counts saves, add-ons and title updates across profiles', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nxe-content-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const item of ['E000000000000001/544307D5/00000001/ng2sysd.dat', 'E000000000000001/544307D5/00000002/DLC1', 'E000000000000001/544307D5/Headers/00000001', '0000000000000000/544307D5/000B0000/tu.bin', '0000000000000000/544307D5/00000002/DLC2', 'notes/544307D5/00000001/x']) {
    await fs.mkdir(path.dirname(path.join(root, item)), { recursive: true }); await fs.writeFile(path.join(root, item), '');
  }
  const counts = await gameInfo.installed(root, '544307D5');
  assert.deepEqual([counts.saves, counts.downloadable_content, counts.title_updates], [1, 2, 1]);
  assert.equal((await gameInfo.installed(path.join(root, 'missing'), '544307D5')).saves, 0);
  await assert.rejects(gameInfo.installed(root, '../etc'), /Invalid title ID/);
});

test('metadata is sanitized, fetched once and then served from the cache', async t => {
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'nxe-info-'));
  t.after(() => fs.rm(cache, { recursive: true, force: true }));
  let calls = 0;
  const request = async url => { calls++; assert.equal(url, 'https://raw.githubusercontent.com/xenia-manager/x360db/main/titles/4D5307D5/info.json'); return Buffer.from(JSON.stringify({ title: { full: 'Gears of War' }, genre: ['Shooter', 7], developer: 'Epic Games, Inc.', description: { full: 'A  nightmare\n from below.' }, extra: '<script>' })); };
  const info = await gameInfo.metadata('4D5307D5', request, cache);
  assert.deepEqual(info, { title: 'Gears of War', genre: ['Shooter'], developer: 'Epic Games, Inc.', publisher: '', release_date: '', user_rating: '', description: 'A nightmare from below.', title_id: '4D5307D5' });
  assert.deepEqual(await gameInfo.metadata('4D5307D5', request, cache), info);
  assert.equal(calls, 1);
  await assert.rejects(gameInfo.metadata('nope', request, cache), /Invalid title ID/);
});
