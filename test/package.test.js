'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../package.json');

test('every local module the app loads exists in src/ and src/ is packaged', () => {
  assert.equal(require('../package.json').main, 'src/main.js');
  assert.ok(build.files.includes('src/**/*.js'), 'src/ is packaged');
  const seen = new Set(), queue = ['main.js', 'preload.js'];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    for (const match of text.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)) queue.push(match[1].endsWith('.js') ? match[1] : `${match[1]}.js`);
  }
  assert.ok(seen.has('profiles.js'));
});

test('the app icon is a square PNG large enough for every platform and is packaged', () => {
  const icon = fs.readFileSync(path.join(__dirname, '..','assets', 'icon.png'));
  assert.deepEqual([...icon.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const [width, height] = [icon.readUInt32BE(16), icon.readUInt32BE(20)];
  assert.equal(width, height, 'square'); assert.ok(width >= 512, 'at least 512 px');
  assert.ok(require('../package.json').build.files.includes('assets/**/*'));
  assert.equal(require('../package.json').build.linux.icon, 'assets/icon.png'); assert.equal(require('../package.json').build.win.icon, 'assets/icon.png');
});

test('package-lock.json agrees with package.json, so npm ci works', () => {
  const pkg = require('../package.json'), lock = require('../package-lock.json');
  assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
  for (const [name, wanted] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const installed = lock.packages[`node_modules/${name}`]?.version;
    assert.ok(installed, `${name} is in the lock`);
    if (/^\d/.test(wanted)) assert.equal(installed, wanted, `${name}: exact version in package.json matches the lock`);
  }
});
