'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { findUpdate, channelOfFile, noticeFor } = require('../src/update-notice');

const used = (tag, id = 'edge') => ({ channels: [{ id: 'canary', label: 'Xenia Canary', in_use: false, installed: { tag: 'c-1' } }, { id, label: 'Xenia Edge', in_use: true, installed: { tag } }] });
const latest = tag => async () => ({ tag, published_at: '2026-10-14' });

test('the Xenia in use has a newer build: a notice names the channel and the new version', async () => {
  const found = await findUpdate({ status: used('v1'), configured: '/x/edge.AppImage', platform: 'linux', latest: latest('v2'), identify: async () => assert.fail('an installed build needs no hashing') });
  assert.deepEqual(found, { channel: 'edge', label: 'Xenia Edge', installed: 'v1', latest: 'v2', published_at: '2026-10-14' });
  const notice = noticeFor(found);
  assert.equal(notice.title, 'Xenia update available'); assert.match(notice.text, /Xenia Edge v2 is ready/); assert.equal(notice.id, 'xenia-update:edge:v2');
});

test('up to date, nothing set up, or another channel with a newer build: no notice', async () => {
  assert.equal(await findUpdate({ status: used('v2'), configured: '/x/edge.AppImage', platform: 'linux', latest: latest('v2') }), null);
  assert.equal(await findUpdate({ status: used('v1'), configured: '', platform: 'linux', latest: latest('v2') }), null, 'no Xenia in use');
  assert.equal(await findUpdate({ status: used('v1'), configured: '/x', platform: null, latest: latest('v2') }), null);
  // Only the channel in use counts: Canary having something newer is not news.
  const asked = []; await findUpdate({ status: used('v2'), configured: '/x', platform: 'linux', latest: async id => (asked.push(id), { tag: 'v2' }) });
  assert.deepEqual(asked, ['edge']);
});

test('an own copy of Xenia is checked only when it is recognised as an official build', async () => {
  const none = { channels: [{ id: 'edge', label: 'Xenia Edge', in_use: false, installed: null }] };
  const base = { status: none, platform: 'linux', supports: () => true, latest: latest('v9') };
  assert.equal((await findUpdate({ ...base, configured: '/home/me/xenia_edge_linux.AppImage', identify: async () => 'v7' })).installed, 'v7');
  assert.equal(await findUpdate({ ...base, configured: '/home/me/xenia_edge_linux.AppImage', identify: async () => 'v9' }), null, 'the latest already');
  assert.equal(await findUpdate({ ...base, configured: '/home/me/xenia_edge_linux.AppImage', identify: async () => null }), null, 'not recognised: nothing is guessed');
  assert.equal(await findUpdate({ ...base, configured: '/home/me/mystery', identify: async () => assert.fail('no channel to ask') }), null);
  assert.equal(await findUpdate({ ...base, supports: () => false, configured: 'C:\\x\\xenia.exe', identify: async () => assert.fail('unsupported') }), null);
});

test('the channel of an own file comes from its name', () => {
  for (const [file, id] of [['/a/xenia_edge_linux.AppImage', 'edge'], ['C:\\Xenia\\xenia_canary.exe', 'canary'], ['D:\\xenia.exe', 'xenia'], ['/opt/xenia', 'xenia'], ['/a/other.exe', null], ['', null]]) assert.equal(channelOfFile(file), id, file);
});
