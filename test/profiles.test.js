'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const profiles = require('../src/profiles');
const KEY = Buffer.from('E1BC159C73B1EAE9AB3170F3AD47EBF3', 'hex');
const hmac = data => crypto.createHmac('sha1', KEY).update(data).digest().subarray(0, 16);
function account(gamertag) {
  const info = Buffer.alloc(380); Buffer.from(gamertag, 'utf16le').swap16().copy(info, 8);
  const plain = Buffer.concat([Buffer.alloc(8, 7), info]), hash = hmac(plain);
  return Buffer.concat([hash, profiles.rc4(hmac(hash), plain)]);
}
function gpd(entries) {
  const datas = entries.map(({ id, gamerscore, achieved, texts }) => { const head = Buffer.alloc(0x1C); head.writeUInt32BE(0x1C, 0); head.writeUInt32BE(id, 4); head.writeUInt32BE(gamerscore, 12); head.writeUInt32BE(achieved ? 0x20000 : 0, 16); if (achieved) head.writeBigUInt64BE(133000000000000000n, 20); return Buffer.concat([head, Buffer.from(texts.join('\0') + '\0', 'utf16le').swap16()]); });
  const header = Buffer.alloc(0x18); header.write('XDBF', 0, 'latin1'); header.writeUInt32BE(0x10000, 4); header.writeUInt32BE(4, 8); header.writeUInt32BE(entries.length + 1, 12);
  const table = Buffer.alloc(4 * 18); let offset = 0;
  datas.forEach((data, index) => { table.writeUInt16BE(1, index * 18); table.writeBigUInt64BE(BigInt(index + 1), index * 18 + 2); table.writeUInt32BE(offset, index * 18 + 10); table.writeUInt32BE(data.length, index * 18 + 14); offset += data.length; });
  table.writeUInt16BE(2, entries.length * 18);
  return Buffer.concat([header, table, ...datas]);
}

test('decrypts gamertags and rejects tampered accounts', () => {
  assert.deepEqual(profiles.readAccount(account('Player1')), { gamertag: 'Player1' });
  const tampered = account('Player1'); tampered[40] ^= 1;
  assert.throws(() => profiles.readAccount(tampered), /signature/);
  assert.throws(() => profiles.readAccount(Buffer.alloc(10)), /size/);
});

test('reads achievements with unlock state, gamerscore and text', () => {
  const list = profiles.readAchievements(gpd([{ id: 2, gamerscore: 10, achieved: false, texts: ['Locked one', 'Did it', 'Do it'] }, { id: 1, gamerscore: 25, achieved: true, texts: ['Done', 'You did it', 'Do the thing'] }]));
  assert.deepEqual(list.map(a => [a.id, a.name, a.gamerscore, a.achieved, a.description]), [[1, 'Done', 25, true, 'You did it'], [2, 'Locked one', 10, false, 'Do it']]);
  assert.match(list[0].unlocked_at, /^20\d\d-/);
  assert.throws(() => profiles.readAchievements(Buffer.from('nope')), /GPD/);
});

test('lists profiles from the content folder and finds per-title achievements', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nxe-profiles-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'E000000000000001', 'FFFE07D1', '00010000', 'E000000000000001');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'Account'), account('Player1'));
  await fs.writeFile(path.join(folder, '544307D5.gpd'), gpd([{ id: 1, gamerscore: 5, achieved: true, texts: ['A', 'B', 'C'] }]));
  await fs.mkdir(path.join(root, '0000000000000000', '544307D5'), { recursive: true });
  assert.deepEqual(await profiles.list(root), [{ xuid: 'E000000000000001', gamertag: 'Player1' }]);
  assert.equal((await profiles.achievements(root, 'E000000000000001', '544307D5')).length, 1);
  assert.equal(await profiles.achievements(root, 'E000000000000001', '4D5307D5'), null);
  await assert.rejects(profiles.achievements(root, '../x', '544307D5'), /Invalid/);
  assert.deepEqual(await profiles.list(path.join(root, 'missing')), []);
});
