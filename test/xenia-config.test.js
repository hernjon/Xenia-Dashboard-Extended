'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const config = require('../src/xenia-config');
const fixture = path.join(__dirname, 'fixtures', 'xenia-edge.config.toml');

test('parses every Xenia Edge section and key with types, options and ranges', async () => {
  const parsed = config.parse(await fs.readFile(fixture, 'utf8'));
  assert.equal(parsed.sections.length, 24);
  assert.equal(parsed.entries.size, 312);
  assert.deepEqual({ ...config.get(parsed, 'Display', 'fullscreen'), line: 0, description: '' }, { section: 'Display', key: 'fullscreen', type: 'bool', value: true, raw: 'true', line: 0, description: '', options: [] });
  assert.deepEqual(config.get(parsed, 'APU', 'apu').options.map(o => o.value), ['sdl', 'nop']);
  assert.deepEqual(config.get(parsed, 'APU', 'xma_decoder').options.map(o => o.value), ['fake', 'master', 'old', 'new']);
  const apuFrames = config.get(parsed, 'APU', 'apu_max_queued_frames');
  assert.equal(apuFrames.min, 4); assert.equal(apuFrames.max, 64);
  const language = config.get(parsed, 'Console', 'user_language');
  assert.equal(language.type, 'int');
  assert.deepEqual(language.options.slice(0, 3), [{ value: 1, label: 'en' }, { value: 2, label: 'ja' }, { value: 3, label: 'de' }]);
  assert.ok(config.get(parsed, 'Console', 'user_country').options.some(o => o.value === 13 && o.label === 'BR'));
  assert.equal(config.get(parsed, 'Video', 'avpack').options.find(o => o.value === 8).label, 'HDMI (default)');
  assert.equal(config.get(parsed, 'HID', 'left_stick_deadzone_percentage').type, 'float');
  assert.match(config.get(parsed, 'APU', 'use_dedicated_xma_thread').description, /Off decodes/);
});

test('editing one value changes only that value and keeps the comment column', async () => {
  const text = await fs.readFile(fixture, 'utf8');
  const edited = config.setValue(text, 'Display', 'postprocess_antialiasing', 'fxaa_extreme');
  const before = text.split('\n'), after = edited.split('\n');
  const changed = before.map((line, index) => line !== after[index] ? index : -1).filter(index => index >= 0);
  assert.equal(changed.length, 1);
  assert.equal(after[changed[0]].indexOf('#'), before[changed[0]].indexOf('#'));
  assert.equal(config.get(config.parse(edited), 'Display', 'postprocess_antialiasing').value, 'fxaa_extreme');
  const volume = config.setValue(text, 'APU', 'volume', 35);
  assert.equal(config.get(config.parse(volume), 'APU', 'volume').value, 35);
  const deadzone = config.setValue(text, 'HID', 'left_stick_deadzone_percentage', 0.15);
  assert.match(deadzone, /^left_stick_deadzone_percentage = 0\.15 +\t# /m);
  const long = config.setValue(text, 'Storage', 'content_root', '/mnt/a/very/long/path/that/pushes/past/the/comment/column');
  assert.match(long, /column" \t# /);
});

test('validation enforces known keys, types, text option lists and single-line text', async () => {
  const text = await fs.readFile(fixture, 'utf8');
  assert.throws(() => config.setValue(text, 'Display', 'not_a_key', true), /Unknown/);
  assert.throws(() => config.setValue(text, 'Display', 'fullscreen', 'yes'), /on or off/);
  assert.throws(() => config.setValue(text, 'APU', 'volume', 1.5), /whole number/);
  assert.throws(() => config.setValue(text, 'APU', 'apu', 'alsa'), /one of/);
  assert.doesNotThrow(() => config.setValue(text, 'Memory', 'scribble_heap_value', 0));
  assert.throws(() => config.setValue(text, 'Storage', 'content_root', 'a\n[Display]\nfullscreen = false'), /single line/);
  assert.throws(() => config.setValue(text, 'HID', 'left_stick_deadzone_percentage', Infinity), /number/);
});

test('strings round-trip quotes, backslashes and Windows paths', () => {
  const text = '[Storage]\ncontent_root = ""                                 \t# Root path for content.\n';
  const value = 'C:\\Games\\"Quoted" \u00e9';
  const edited = config.setValue(text, 'Storage', 'content_root', value);
  assert.equal(config.get(config.parse(edited), 'Storage', 'content_root').value, value);
  assert.equal(config.parse("[A]\nx = 'lit\\eral'\n").entries.get('A.x').value, 'lit\\eral');
});

test('per-game overrides add, replace and remove keys and sections', () => {
  let text = config.setOverride('', 'GPU', 'draw_resolution_scale_x', 'int', 2);
  text = config.setOverride(text, 'GPU', 'draw_resolution_scale_y', 'int', 2);
  text = config.setOverride(text, 'Display', 'fullscreen', 'bool', false);
  text = config.setOverride(text, 'GPU', 'draw_resolution_scale_x', 'int', 3);
  assert.equal(text, '[GPU]\ndraw_resolution_scale_x = 3\ndraw_resolution_scale_y = 2\n\n[Display]\nfullscreen = false\n');
  text = config.removeOverride(text, 'Display', 'fullscreen');
  assert.equal(text, '[GPU]\ndraw_resolution_scale_x = 3\ndraw_resolution_scale_y = 2\n');
  text = config.removeOverride(config.removeOverride(text, 'GPU', 'draw_resolution_scale_x'), 'GPU', 'draw_resolution_scale_y');
  assert.equal(text, '');
  assert.equal(config.removeOverride('', 'GPU', 'missing'), '');
});

test('locates portable and per-user Xenia configs on Linux and Windows', () => {
  const linux = config.locate({ executable: '/home/u/.local/bin/xenia_edge_linux.AppImage', platform: 'linux', home: '/home/u' });
  assert.deepEqual(linux, { storage: '/home/u/.local/share/Xenia', file: '/home/u/.local/share/Xenia/xenia-edge.config.toml', flavor: 'xenia-edge' });
  const portable = config.locate({ executable: 'C:\\Xenia\\xenia_canary.exe', platform: 'win32', documents: 'C:\\Users\\u\\Documents', existing: file => file === 'C:\\Xenia\\portable.txt' });
  assert.equal(portable.file, 'C:\\Xenia\\xenia-canary.config.toml');
  const user = config.locate({ executable: 'C:\\Xenia\\xenia.exe', platform: 'win32', documents: 'C:\\Users\\u\\Documents', existing: file => file.endsWith('xenia-canary.config.toml') });
  assert.equal(user.file, 'C:\\Users\\u\\Documents\\Xenia\\xenia-canary.config.toml');
  assert.equal(config.locate({ executable: 'relative.exe', platform: 'win32' }), null);
});

test('writes atomically, keeps a one-time backup and refuses symlinks', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nxe-xenia-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'xenia-edge.config.toml');
  await fs.writeFile(file, 'original');
  await config.write(file, 'first');
  await config.write(file, 'second');
  assert.equal(await fs.readFile(file, 'utf8'), 'second');
  assert.equal(await fs.readFile(`${file}.nxe-backup`, 'utf8'), 'original');
  assert.deepEqual((await fs.readdir(root)).sort(), ['xenia-edge.config.toml', 'xenia-edge.config.toml.nxe-backup']);
  const link = path.join(root, 'link.config.toml');
  // Windows only lets administrators (or Developer Mode) create symlinks; without that there is nothing to refuse.
  if (await fs.symlink(file, link).then(() => true, error => error.code === 'EPERM' ? false : Promise.reject(error))) {
    await assert.rejects(config.write(link, 'x'), /regular file/);
    await assert.rejects(config.read(link), /regular file/);
  }
  assert.equal(await config.readOptional(path.join(root, 'missing.toml')), '');
});

test('the official build (xenia.exe) uses xenia.config.toml, Canary and Edge keep their own names', () => {
  const win = { platform: 'win32', documents: 'C:\\Users\\u\\Documents', existing: () => false };
  assert.equal(config.locate({ ...win, executable: 'C:\\X\\xenia.exe' }).file, 'C:\\Users\\u\\Documents\\Xenia\\xenia.config.toml');
  assert.equal(config.locate({ ...win, executable: 'C:\\X\\xenia_canary.exe' }).file, 'C:\\Users\\u\\Documents\\Xenia\\xenia-canary.config.toml');
  assert.equal(config.locate({ ...win, executable: 'C:\\X\\xenia_edge.exe' }).file, 'C:\\Users\\u\\Documents\\Xenia\\xenia-edge.config.toml');
  assert.equal(config.locate({ platform: 'linux', home: '/home/u', executable: '/x/xenia_canary_linux.AppImage', existing: () => false }).file, '/home/u/.local/share/Xenia/xenia-canary.config.toml');
});
