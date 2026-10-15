'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { watchTitleExit, terminateXenia } = require('../src/title-exit');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('the Xenia log is watched for the game going back to the dashboard, once, even when a line is cut in two reads', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xd-exit-')), file = path.join(dir, 'xenia.log');
  try {
    let exits = 0;
    const watcher = watchTitleExit(file, () => exits++, { interval: 10 });
    await wait(40); assert.equal(exits, 0, 'no log yet is not an exit');
    await fs.promises.writeFile(file, 'i> f:0000001 XamLoaderLaunchTitle: in-process relaunch\ni> f:0000002 something else\n');
    await wait(60); assert.equal(exits, 0, 'a relaunch into another title is not an exit');
    await fs.promises.appendFile(file, 'i> f:0000655 KernelState::Exit');
    await wait(60); assert.equal(exits, 0);
    await fs.promises.appendFile(file, 'ToDashboard\n');
    await wait(80); assert.equal(exits, 1, 'found although the line was written in two pieces');
    await fs.promises.appendFile(file, 'i> KernelState::ExitToDashboard\n');
    await wait(60); assert.equal(exits, 1, 'reports once');
    watcher.stop();
  } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
});

test('a log that is started again is read from its beginning, and a stopped watcher stays silent', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xd-exit-')), file = path.join(dir, 'xenia.log');
  try {
    await fs.promises.writeFile(file, 'x'.repeat(500));
    let exits = 0;
    const watcher = watchTitleExit(file, () => exits++, { interval: 10 });
    await wait(40);
    await fs.promises.writeFile(file, 'KernelState::ExitToDashboard\n'); // shorter than before: a new session
    await wait(80); assert.equal(exits, 1);
    const silent = watchTitleExit(file, () => exits++, { interval: 10 }); silent.stop();
    await wait(50); assert.equal(exits, 1);
    watcher.stop();
  } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
});

test('Xenia is closed politely first, then for good, and the whole group on Linux', async () => {
  const sent = [];
  const child = { pid: 4321, exitCode: null, signalCode: null, kill: signal => sent.push(['child', signal]), once() {} };
  terminateXenia(child, { platform: 'linux', kill: (pid, signal) => sent.push([pid, signal]), graceMs: 20 });
  assert.deepEqual(sent, [[-4321, 'SIGTERM']], 'the group (AppImage runtime, Wine and Xenia), not only the first process');
  await wait(60); assert.deepEqual(sent.at(-1), [-4321, 'SIGKILL'], 'still running after the grace period');
  const gone = [];
  const quick = { pid: 99, exitCode: null, signalCode: null, kill: s => gone.push(s), once(event, fn) { this.close = fn; } };
  terminateXenia(quick, { platform: 'win32', graceMs: 20 });
  quick.exitCode = 0; quick.close();
  await wait(60); assert.deepEqual(gone, ['SIGTERM'], 'nothing more once it has closed');
  assert.doesNotThrow(() => terminateXenia(null)); assert.doesNotThrow(() => terminateXenia({ pid: 0 }));
});

test('the blade slide sounds are a swoosh only: they end in silence, with no click after it', () => {
  const wav = require('node:fs').readFileSync;
  for (const n of [1, 2, 3, 4]) {
    const bytes = wav(path.join(__dirname, '..','skins', 'blades', 'assets', `bladeslide-${n}.wav`));
    const channels = bytes.readUInt16LE(22), rate = bytes.readUInt32LE(24), bits = bytes.readUInt16LE(34);
    const start = bytes.indexOf('data') + 8, step = bits / 8 * channels;
    const level = i => bits === 16 ? Math.abs(bytes.readInt16LE(start + i * step)) : Math.abs(bytes[start + i * step] - 128);
    const total = Math.floor((bytes.length - start) / step), window = Math.floor(rate * 0.02);
    let peak = 0, tail = 0;
    for (let i = 0; i < total; i++) { const v = level(i); peak = Math.max(peak, v); if (i >= total - window) tail = Math.max(tail, v); }
    assert.ok(total / rate < 0.45, `bladeslide-${n} is ${(total / rate).toFixed(2)}s: the click was left on`);
    assert.ok(tail < peak * 0.12, `bladeslide-${n} does not end quietly`);
  }
});
