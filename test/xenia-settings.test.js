'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xeniaConfig = require('../src/xenia-config');
const settings = require('../src/xenia-settings');
const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'xenia-edge.config.toml'), 'utf8');
const value = (source, id) => { const [section, key] = id.split('.'); return xeniaConfig.get(xeniaConfig.parse(source), section, key).value; };

test('every curated setting exists in Xenia Edge and categories hide other platforms', () => {
  const linux = settings.payload(text, '', { platform: 'linux' }), windows = settings.payload(text, '', { platform: 'win32' });
  const curated = settings.CATEGORIES.reduce((count, category) => count + category.items.length, 0);
  assert.equal(linux.categories.reduce((count, category) => count + category.items.length, 0), curated);
  assert.equal(windows.categories.find(c => c.id === 'system').items.some(item => item.key === 'use_mangohud'), false);
  assert.equal(linux.advanced.reduce((count, section) => count + section.items.length, 0), 312);
  const language = linux.categories[0].items[0];
  assert.equal(language.label, 'Language'); assert.equal(language.value, 1);
  assert.equal(language.options.find(o => o.value === 9).label, 'Portuguese');
  const fullscreen = linux.categories.find(c => c.id === 'display').items[0];
  assert.deepEqual(fullscreen.options.map(o => o.label), ['On', 'Off']);
});

test('numeric tables become choices only when they describe the current value', () => {
  const advanced = settings.payload(text, '', { platform: 'linux' }).advanced.flatMap(section => section.items);
  assert.equal(advanced.find(item => item.key === 'x64_extension_mask').options.length, 0);
  assert.ok(advanced.find(item => item.key === 'avpack').options.length > 5);
});

test('system changes rewrite the global file, including linked keys and widened floats', () => {
  const scaled = settings.apply(text, '', 'GPU.draw_resolution_scale_x', 3).global;
  assert.equal(value(scaled, 'GPU.draw_resolution_scale_x'), 3); assert.equal(value(scaled, 'GPU.draw_resolution_scale_y'), 3);
  const sharp = settings.apply(text, '', 'Display.postprocess_ffx_cas_additional_sharpness', 0.5).global;
  assert.equal(value(sharp, 'Display.postprocess_ffx_cas_additional_sharpness'), 0.5);
  assert.throws(() => settings.apply(text, '', 'GPU.draw_resolution_scale_x', 9), /listed choices/);
  assert.throws(() => settings.apply(text, '', 'Display.postprocess_antialiasing', 'msaa'), /one of/);
  assert.throws(() => settings.apply(text, '', 'Nope.missing', 1), /Unknown/);
  assert.throws(() => settings.apply(text, '', 'constructor', 1), /Unknown/);
});

test('game changes only touch the override file and can be reset to the system value', () => {
  let override = settings.apply(text, '', 'GPU.draw_resolution_scale_x', 2, '4D5307D5').override;
  override = settings.apply(text, override, 'Display.fullscreen', false, '4D5307D5').override;
  assert.equal(override, '[GPU]\ndraw_resolution_scale_x = 2\ndraw_resolution_scale_y = 2\n\n[Display]\nfullscreen = false\n');
  const view = settings.payload(text, override, { platform: 'linux', game: { title_id: '4D5307D5', title: 'Gears of War' } });
  const fullscreen = view.categories.find(c => c.id === 'display').items.find(i => i.key === 'fullscreen');
  assert.deepEqual([fullscreen.value, fullscreen.overridden, fullscreen.system_value], [false, true, true]);
  assert.equal(view.categories.find(c => c.id === 'audio').items[0].overridden, false);
  override = settings.reset(text, override, 'GPU.draw_resolution_scale_x');
  assert.equal(override, '[Display]\nfullscreen = false\n');
  assert.equal(settings.reset(text, override, 'Display.fullscreen'), '');
});

test('profile slots offer found profiles by gamertag and stay system-wide', () => {
  const profiles = [{ xuid: 'E000000000000001', gamertag: 'Player1' }];
  const view = settings.payload(text, '', { platform: 'linux', profiles });
  const slot = view.categories.find(c => c.id === 'profiles').items[0];
  assert.deepEqual(slot.options.map(o => o.label), ['Nobody', 'Player1 (E000000000000001)']);
  const signedIn = settings.apply(text, '', 'Profiles.logged_profile_slot_0_xuid', 'E000000000000001', null, profiles).global;
  assert.equal(value(signedIn, 'Profiles.logged_profile_slot_0_xuid'), 'E000000000000001');
  assert.throws(() => settings.apply(text, '', 'Profiles.logged_profile_slot_0_xuid', 'FFFFFFFFFFFFFFFF', null, profiles), /one of/);
  assert.throws(() => settings.apply(text, '', 'Profiles.logged_profile_slot_0_xuid', '', { title_id: '4D5307D5' }, profiles), /whole system/);
  assert.equal(settings.payload(text, '', { platform: 'linux', game: { title_id: '4D5307D5', title: 'Gears' } }).categories.some(c => c.id === 'profiles'), false);
});

test('categories that have their own tile are flagged so the System settings list does not repeat them', () => {
  const system = settings.payload(text, '', { platform: 'linux' }).categories;
  assert.deepEqual(system.filter(category => category.separate).map(category => category.id), ['profiles']);
  assert.ok(system.length > 6, 'the rest of the categories stay');
  const game = settings.payload(text, '', { platform: 'linux', game: { title_id: '4D5307D5', title: 'G' } }).categories;
  assert.equal(game.some(category => category.id === 'profiles'), false, 'a game has no Profiles category at all');
});

test('no menu name repeats along a path: a category never reuses the name of a tile above it', () => {
  const registry = require('../dashboard/sections').createSectionRegistry();
  require('../sections/settings').registerSettingsSections(registry, { enter() {} });
  const names = [...registry.list().map(section => section.label), ...registry.list().flatMap(section => section.items().map(item => item.title))].map(name => name.toLowerCase());
  // A category flagged `separate` is opened by its own tile on purpose (Profiles), so it is meant to share that name.
  const categories = settings.payload(text, '', { platform: 'linux' }).categories.filter(category => !category.separate).map(category => category.label.toLowerCase());
  assert.equal(new Set(categories).size, categories.length, 'category names are unique');
  for (const label of categories) assert.equal(names.includes(label), false, `"${label}" is also the name of a section or tile`);
  assert.ok(categories.includes('emulation'));
});
