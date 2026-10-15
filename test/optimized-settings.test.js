'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const optimized = require('../src/optimized-settings');
const xeniaConfig = require('../src/xenia-config');
const global = fs.readFileSync(path.join(__dirname, 'fixtures', 'xenia-edge.config.toml'), 'utf8');
const value = (text, section, key) => xeniaConfig.get(xeniaConfig.parse(text), section, key)?.value;

const JUDGMENT = `# Title Name: Gears of War - Judgement
# Title ID: 4D530A26

[GPU]
draw_resolution_scale_threshold = 360 # Fixes post-process effects when using resolution scaling.
occlusion_query = "strict" # Fixes unoccluded lens flares
readback_resolve = "fast" # Fixes excessive brightness
vsync = false # Unlocks framerate
`;
test('the plan lists what would change, what is already set, and what this Xenia cannot take', () => {
  const result = optimized.plan(global, '', JUDGMENT);
  assert.deepEqual(result.changes.map(c => [c.name, c.from, c.to]), [['GPU › draw_resolution_scale_threshold', 100, 360], ['GPU › occlusion_query', 'fast', 'strict']].map(([n, , to]) => [n, result.changes.find(c => c.name === n).from, to]));
  assert.equal(result.changes.find(c => c.key === 'occlusion_query').from, 'fast'); assert.equal(result.changes.find(c => c.key === 'occlusion_query').note, 'Fixes unoccluded lens flares');
  assert.equal(result.unchanged, 1, 'readback_resolve is already "fast"');
  assert.deepEqual(result.skipped.map(s => [s.key, s.reason]), [['vsync', 'this Xenia build has no such setting']]);
});
test('the user\'s own override for the game counts as the current value', () => {
  const mine = '[GPU]\nocclusion_query = "strict"\n';
  const result = optimized.plan(global, mine, JUDGMENT);
  assert.equal(result.changes.some(c => c.key === 'occlusion_query'), false, 'already set to the same value in this game');
  assert.equal(result.unchanged, 2);
});
test('wrong types and values outside a key\'s allowed list are refused, never applied', () => {
  const hostile = `[GPU]
framerate_limit = "fast"
use_fuzzy_alpha_epsilon = 3
gpu = "metal"
clear_memory_page_state = true
[General]
discord = false
[Nope.Section]
anything = 1
`;
  const result = optimized.plan(global, '', hostile);
  assert.deepEqual(result.changes.map(c => c.key).sort(), ['clear_memory_page_state', 'discord']);
  const reasons = Object.fromEntries(result.skipped.map(s => [s.key, s.reason]));
  assert.match(reasons.framerate_limit, /expected int, the file has string/); assert.match(reasons.use_fuzzy_alpha_epsilon, /expected bool/);
  assert.match(reasons.gpu, /one of: vulkan, null/); assert.match(reasons.anything, /no such setting/);
});
test('free text values that are absurdly long are refused', () => {
  const result = optimized.plan(global, '', `[Storage]\ncontent_root = "${'x'.repeat(200)}"\n`);
  assert.deepEqual([result.changes.length, result.skipped[0].reason], [0, 'the value is too long']);
});
test('apply writes only the changed keys into the game\'s override and keeps its other overrides', () => {
  const mine = '[Display]\nfullscreen = false\n\n[GPU]\nframerate_limit = 30\n';
  const { changes } = optimized.plan(global, mine, JUDGMENT);
  const written = optimized.apply(mine, changes);
  assert.equal(value(written, 'Display', 'fullscreen'), false); assert.equal(value(written, 'GPU', 'framerate_limit'), 30);
  assert.equal(value(written, 'GPU', 'occlusion_query'), 'strict'); assert.equal(value(written, 'GPU', 'draw_resolution_scale_threshold'), 360);
  assert.equal(xeniaConfig.get(xeniaConfig.parse(written), 'GPU', 'readback_resolve'), undefined, 'values equal to the system value are not copied');
  assert.equal(optimized.apply('', []), '');
  assert.equal(value(optimized.apply('', optimized.plan(global, '', '[GPU]\nframerate_limit = 120\n').changes), 'GPU', 'framerate_limit'), 120);
  const floats = optimized.plan(global, '', '[HID]\nleft_stick_deadzone_percentage = 1\n');
  assert.equal(floats.changes[0].to, 1); assert.match(optimized.apply('', floats.changes), /left_stick_deadzone_percentage = 1\.0/, 'a whole number for a float setting stays a float');
});
function fakeFetcher(files) {
  return async (url) => {
    const hit = files[url]; if (hit === undefined) return new Response('nope', { status: 404 });
    if (hit instanceof Error) throw hit; if (typeof hit === 'number') return new Response('x', { status: hit });
    return new Response(new ReadableStream({ start(c) { c.enqueue(Buffer.from(hit)); c.close(); } }), { status: 200 });
  };
}
test('fetching: a missing file means "none for this game", bad ids never reach the network, and sizes are limited', async () => {
  const calls = [], base = optimized.BASE, files = { [`${base}settings/4D530A26.toml`]: JUDGMENT, [`${base}settings/4D5307D5.toml`]: 'x'.repeat(70000), [`${base}settings/58410954.toml`]: 503, [`${base}settings/AAAAAAAA.toml`]: 'a\0b' };
  const fetcher = async (url, init) => { calls.push(url); assert.equal(init.redirect, 'error'); return fakeFetcher(files)(url, init); };
  assert.deepEqual(await optimized.fetchSettings('4D530A26', fetcher), { title: 'Gears of War - Judgement', text: JUDGMENT });
  assert.equal(await optimized.fetchSettings('4D530A27', fetcher), null);
  await assert.rejects(optimized.fetchSettings('4D5307D5', fetcher), /too large/);
  await assert.rejects(optimized.fetchSettings('58410954', fetcher), /answered 503/);
  await assert.rejects(optimized.fetchSettings('AAAAAAAA', fetcher), /not text/);
  for (const bad of ['../x', '4d5307d5', '4D5307D', '', null, 5, '4D5307D5/../x']) await assert.rejects(optimized.fetchSettings(bad, fetcher), /Invalid title ID/);
  assert.ok(calls.every(url => url.startsWith(base)), 'only the settings repository is contacted');
});
test('the index only provides dates and survives any failure', async () => {
  const url = `${optimized.BASE}data/settings.json`;
  const index = await optimized.fetchIndex(fakeFetcher({ [url]: JSON.stringify([{ id: '4D530A26', title: 'G', last_modified: '2026-10-02T00:00:00Z' }, { id: '../x', last_modified: 'bad' }, null]) }));
  assert.deepEqual([...index], [['4D530A26', '2026-10-02']]);
  assert.equal((await optimized.fetchIndex(fakeFetcher({}))).size, 0); assert.equal((await optimized.fetchIndex(fakeFetcher({ [url]: 'not json' }))).size, 0);
});
