'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const releases = require('../src/xenia-releases');

const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const ELF = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('fake appimage body')]);
// A tiny zip writer so the reader is tested against files built here, including hostile ones.
function makeZip(entries, { flags = 0, badCrc = false } = {}) {
  const parts = [], central = []; let offset = 0;
  for (const { name, data, stored } of entries) {
    const body = Buffer.from(data), packed = stored ? body : zlib.deflateRawSync(body), crc = releases.crc32(body) ^ (badCrc ? 1 : 0), method = stored ? 0 : 8, nameBuffer = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8); local.writeUInt32LE(crc >>> 0, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(nameBuffer.length, 26);
    const header = Buffer.alloc(46); header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(flags, 8); header.writeUInt16LE(method, 10); header.writeUInt32LE(crc >>> 0, 16); header.writeUInt32LE(packed.length, 20); header.writeUInt32LE(body.length, 24); header.writeUInt16LE(nameBuffer.length, 28); header.writeUInt32LE(offset, 42);
    parts.push(local, nameBuffer, packed); central.push(header, nameBuffer); offset += 30 + nameBuffer.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
const temp = async t => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xd-rel-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; };
function release(tag, asset, bytes, extra = {}) {
  return { channel: 'edge', tag, published_at: '2026-10-13', notes: '', asset: { name: asset, size: bytes.length, url: `https://github.com/has207/xenia-edge/releases/download/${tag}/${asset}`, sha256: sha(bytes) }, ...extra };
}
const githubJson = (tag, platformAsset, bytes, over = {}) => ({ tag_name: tag, published_at: '2026-10-13T07:01:44Z', body: '### Changes\n\n- [Net] Fix a thing (`06c98e2`)\n- [Kernel] Fix another', assets: [{ name: platformAsset, size: bytes.length, digest: `sha256:${sha(bytes)}`, browser_download_url: `https://github.com/has207/xenia-edge/releases/download/${tag}/${platformAsset}`, ...over }] });

test('a release is accepted only with the official address, a sane size and a checksum', () => {
  const ok = releases.parseRelease(githubJson('06c98e2', 'xenia_edge_linux.AppImage', ELF), 'edge', 'linux');
  assert.deepEqual([ok.tag, ok.published_at, ok.asset.name, ok.asset.sha256 === sha(ELF)], ['06c98e2', '2026-10-13', 'xenia_edge_linux.AppImage', true]);
  assert.equal(ok.notes, 'Changes\n[Net] Fix a thing (`06c98e2`)\n[Kernel] Fix another');
  assert.equal(releases.parseRelease(githubJson('x1', 'xenia_edge_windows.zip', ELF), 'edge', 'win32').asset.name, 'xenia_edge_windows.zip');
  const bad = (over, pattern, platform = 'linux') => assert.throws(() => releases.parseRelease(githubJson('06c98e2', 'xenia_edge_linux.AppImage', ELF, over), 'edge', platform), pattern);
  bad({ browser_download_url: 'https://evil.example/xenia_edge_linux.AppImage' }, /official/);
  bad({ browser_download_url: 'https://github.com/other/repo/releases/download/06c98e2/xenia_edge_linux.AppImage' }, /official/);
  bad({ digest: null }, /no checksum/); bad({ digest: 'md5:abc' }, /no checksum/);
  bad({ size: 10 * 1024 * 1024 * 1024 }, /size/); bad({ size: 0 }, /size/); bad({ size: 1.5 }, /size/);
  assert.throws(() => releases.parseRelease({ ...githubJson('../etc', 'xenia_edge_linux.AppImage', ELF) }, 'edge', 'linux'), /Unexpected/);
  assert.throws(() => releases.parseRelease(githubJson('06c98e2', 'xenia_edge_linux.AppImage', ELF), 'edge', 'win32'), /no xenia_edge_windows.zip/);
  assert.throws(() => releases.parseRelease(githubJson('06c98e2', 'xenia_edge_linux.AppImage', ELF), 'edge', 'darwin'), /no build for this system/);
  assert.throws(() => releases.parseRelease(null, 'edge', 'linux'), /Unexpected/);
  assert.throws(() => releases.parseRelease({}, '__proto__', 'linux'), /Unknown Xenia channel/);
  assert.equal(releases.supports('edge', 'linux') && releases.supports('edge', 'win32') && !releases.supports('edge', 'darwin'), true);
  for (const platform of ['linux', 'win32']) assert.match(releases.executableName('edge', platform), /edge/, 'the config file is found by the "edge" in the name');
});

test('latest asks the official API and nothing else', async () => {
  const urls = [];
  const found = await releases.latest('edge', 'linux', async url => { urls.push(url); return Buffer.from(JSON.stringify(githubJson('abc1234', 'xenia_edge_linux.AppImage', ELF))); });
  assert.deepEqual(urls, ['https://api.github.com/repos/has207/xenia-edge/releases/latest']); assert.equal(found.tag, 'abc1234');
  await assert.rejects(releases.latest('edge', 'linux', async () => Buffer.from('{"message":"API rate limit exceeded"}')), /Unexpected answer/);
});

function fakeFetch(routes, calls = []) {
  return async (url, options) => {
    calls.push([url, options.redirect]);
    const route = routes[url]; if (!route) return new Response('missing', { status: 404 });
    if (route.redirect) return new Response(null, { status: route.status || 302, headers: { location: route.redirect } });
    // Real downloads arrive in pieces; hand the body over 64 KB at a time.
    const body = route.body, pieces = Buffer.isBuffer(body) ? Array.from({ length: Math.ceil(body.length / 65536) }, (_, i) => body.subarray(i * 65536, (i + 1) * 65536)) : [body];
    return new Response(new ReadableStream({ start(controller) { for (const piece of pieces) controller.enqueue(piece); controller.close(); } }), { status: 200 });
  };
}
test('download follows only GitHub redirects, reports progress and verifies the checksum', async t => {
  const root = await temp(t), bytes = Buffer.concat([ELF, Buffer.alloc(600 * 1024, 7)]), rel = release('t1', 'xenia_edge_linux.AppImage', bytes);
  const calls = [], progress = [], file = path.join(root, 'out', 'a.AppImage');
  const fetcher = fakeFetch({ [rel.asset.url]: { redirect: 'https://release-assets.githubusercontent.com/blob?x=1' }, 'https://release-assets.githubusercontent.com/blob?x=1': { body: bytes } }, calls);
  await releases.download(rel, file, { fetcher, onProgress: p => progress.push(p) });
  assert.deepEqual(await fs.readFile(file), bytes);
  assert.ok(calls.length === 2, 'every hop is requested separately, so each one is checked by download()');
  assert.ok(progress.length >= 2 && progress.at(-1).received === bytes.length && progress.at(-1).total === bytes.length);
  assert.deepEqual(await fs.readdir(path.join(root, 'out')), ['a.AppImage'], 'no scratch file left behind');

  const refuse = async (routes, pattern, mutate = rel) => { await assert.rejects(releases.download(mutate, path.join(root, 'x', 'b'), { fetcher: fakeFetch(routes) }), pattern); assert.deepEqual(await fs.readdir(path.join(root, 'x')).catch(() => []), [], 'nothing is kept'); };
  await refuse({ [rel.asset.url]: { redirect: 'https://evil.example.com/steal' } }, /unexpected address/);
  await refuse({ [rel.asset.url]: { redirect: 'http://release-assets.githubusercontent.com/blob' } }, /unexpected address/);
  await refuse({ [rel.asset.url]: { redirect: 'https://user:pw@github.com/blob' } }, /unexpected address/);
  await refuse({ [rel.asset.url]: { redirect: rel.asset.url } }, /Too many redirects/);
  await refuse({}, /answered 404/);
  await refuse({ [rel.asset.url]: { body: Buffer.concat([bytes.subarray(0, bytes.length - 1), Buffer.from([0])]) } }, /Checksum mismatch/);
  await refuse({ [rel.asset.url]: { body: Buffer.concat([bytes, Buffer.from([1])]) } }, /larger than announced/);
  await refuse({ [rel.asset.url]: { body: bytes.subarray(0, 1000) } }, /cut short/);
  await assert.rejects(releases.download({ ...rel, asset: { ...rel.asset, url: 'https://evil.example.com/a' } }, path.join(root, 'x', 'c'), { fetcher: fakeFetch({}) }), /unexpected address/);
});

test('the zip reader unpacks stored and deflated files and refuses anything hostile', async t => {
  const root = await temp(t), file = path.join(root, 'a.zip'), out = path.join(root, 'out');
  await fs.writeFile(file, makeZip([{ name: 'xenia_edge.exe', data: Buffer.alloc(5000, 3) }, { name: 'LICENSE', data: 'BSD', stored: true }, { name: 'docs/readme.txt', data: 'hi' }]));
  assert.deepEqual((await releases.extractZip(file, out)).sort(), ['LICENSE', 'docs/readme.txt', 'xenia_edge.exe']);
  assert.equal((await fs.readFile(path.join(out, 'xenia_edge.exe'))).length, 5000); assert.equal(await fs.readFile(path.join(out, 'docs', 'readme.txt'), 'utf8'), 'hi');
  const hostile = async (zip, pattern) => { await fs.writeFile(file, zip); await assert.rejects(releases.extractZip(file, path.join(root, 'bad')), pattern); await assert.rejects(fs.stat(path.join(root, 'evil.txt'))); };
  await hostile(makeZip([{ name: '../evil.txt', data: 'x' }]), /Unsafe path/);
  await hostile(makeZip([{ name: 'a/../../evil.txt', data: 'x' }]), /Unsafe path/);
  await hostile(makeZip([{ name: '/etc/evil', data: 'x' }]), /Unsafe path/);
  await hostile(makeZip([{ name: 'C:/evil.txt', data: 'x' }]), /Unsafe path/);
  await hostile(makeZip([{ name: 'a\\..\\evil.txt', data: 'x' }]), /Unsafe path/);
  await hostile(makeZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }]), /twice/);
  await hostile(makeZip([{ name: 'a', data: 'x' }], { flags: 1 }), /Encrypted/);
  await hostile(makeZip([{ name: 'a', data: 'x' }], { badCrc: true }), /damaged/);
  await hostile(Buffer.from('not a zip at all'), /Not a zip/);
  await hostile(makeZip(Array.from({ length: releases.CHANNELS ? 70 : 0 }, (_, i) => ({ name: `f${i}`, data: 'x' }))), /Unsupported or damaged/);
  const huge = makeZip([{ name: 'a', data: 'x' }]); huge.writeUInt32LE(0xFFFFFFFF, huge.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);
  await hostile(huge, /Zip64|larger|damaged|unpacks/);
});

test('Linux: the AppImage is checked, made executable, kept as a version and replaced on update', async t => {
  const root = await temp(t), name = 'xenia_edge_linux.AppImage';
  const grab = async (tag, bytes) => { const rel = release(tag, name, bytes); const file = path.join(root, 'dl', tag); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes); return { rel, file }; };
  const first = await grab('v1', ELF), exe = releases.executablePath(root, 'edge', 'linux');
  assert.match(path.basename(exe), /edge/);
  let state = await releases.install(root, 'edge', 'linux', first.rel, first.file);
  assert.equal(state.current.tag, 'v1'); assert.equal(state.previous, null);
  if (process.platform !== 'win32') assert.equal((await fs.stat(exe)).mode & 0o777, 0o755);   // Windows has no Unix modes
  assert.deepEqual(await fs.readFile(exe), ELF);
  const second = await grab('v2', Buffer.concat([ELF, Buffer.from('2')]));
  state = await releases.install(root, 'edge', 'linux', second.rel, second.file);
  assert.deepEqual([state.current.tag, state.previous.tag], ['v2', 'v1']); assert.equal((await fs.readFile(exe)).length, ELF.length + 1);
  const third = await grab('v3', Buffer.concat([ELF, Buffer.from('33')]));
  state = await releases.install(root, 'edge', 'linux', third.rel, third.file);
  assert.deepEqual((await fs.readdir(path.join(root, 'edge', '_versions'))).sort(), ['v2', 'v3'], 'only the current and previous versions are kept');
  state = await releases.rollback(root, 'edge', 'linux');
  assert.deepEqual([state.current.tag, state.previous.tag], ['v2', 'v3']); assert.equal((await fs.readFile(exe)).length, ELF.length + 1);
  assert.deepEqual((await releases.readState(root, 'edge')).current.tag, 'v2');
  const notElf = await grab('v4', Buffer.from('MZ not linux'));
  await assert.rejects(releases.install(root, 'edge', 'linux', notElf.rel, notElf.file), /not a Linux program/);
  assert.equal((await releases.readState(root, 'edge')).current.tag, 'v2', 'a refused install changes nothing');
  await fs.writeFile(path.join(root, 'edge', '_versions', 'v3', name), Buffer.concat([ELF, Buffer.from('tampered')]));
  await assert.rejects(releases.rollback(root, 'edge', 'linux'), /failed its checksum/);
});

test('rolling back needs an earlier version, and a damaged state file reads as "nothing installed"', async t => {
  const root = await temp(t);
  await assert.rejects(releases.rollback(root, 'edge', 'linux'), /no earlier version/);
  await fs.mkdir(path.join(root, 'edge'), { recursive: true }); await fs.writeFile(path.join(root, 'edge', 'installed.json'), '{broken');
  assert.deepEqual(await releases.readState(root, 'edge'), { current: null, previous: null });
  await fs.writeFile(path.join(root, 'edge', 'installed.json'), JSON.stringify({ current: { tag: '../x', asset: 'a', sha256: 'zz' }, previous: null }));
  assert.deepEqual(await releases.readState(root, 'edge'), { current: null, previous: null }, 'a state file with odd values is ignored');
});

test('Windows: the zip is unpacked into the channel folder with portable.txt, keeping Xenia\'s own files on update', async t => {
  const root = await temp(t), name = 'xenia_edge_windows.zip';
  const zipFor = (body) => makeZip([{ name: 'xenia_edge.exe', data: body }, { name: 'LICENSE', data: 'BSD' }]);
  const grab = async (tag, zip) => { const rel = release(tag, name, zip); const file = path.join(root, 'dl', tag); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, zip); return { rel, file }; };
  const one = await grab('w1', zipFor('exe one')), dir = path.join(root, 'edge');
  await releases.install(root, 'edge', 'win32', one.rel, one.file);
  assert.equal(await fs.readFile(path.join(dir, 'xenia_edge.exe'), 'utf8'), 'exe one'); assert.equal((await fs.stat(path.join(dir, 'portable.txt'))).size, 0);
  await fs.writeFile(path.join(dir, 'xenia-edge.config.toml'), 'my settings'); await fs.mkdir(path.join(dir, 'content')); await fs.writeFile(path.join(dir, 'content', 'save.bin'), 'save');
  const two = await grab('w2', zipFor('exe two'));
  const state = await releases.install(root, 'edge', 'win32', two.rel, two.file);
  assert.equal(await fs.readFile(path.join(dir, 'xenia_edge.exe'), 'utf8'), 'exe two');
  assert.equal(await fs.readFile(path.join(dir, 'xenia-edge.config.toml'), 'utf8'), 'my settings'); assert.equal(await fs.readFile(path.join(dir, 'content', 'save.bin'), 'utf8'), 'save');
  assert.equal(state.previous.tag, 'w1');
  await releases.rollback(root, 'edge', 'win32');
  assert.equal(await fs.readFile(path.join(dir, 'xenia_edge.exe'), 'utf8'), 'exe one'); assert.equal(await fs.readFile(path.join(dir, 'xenia-edge.config.toml'), 'utf8'), 'my settings');
  const noExe = await grab('w3', makeZip([{ name: 'LICENSE', data: 'BSD' }]));
  await assert.rejects(releases.install(root, 'edge', 'win32', noExe.rel, noExe.file), /does not contain xenia_edge.exe/);
});

test('downloadAndInstall ties it together and a failed reinstall keeps the version already stored', async t => {
  const root = await temp(t), bytes = Buffer.concat([ELF, Buffer.from('z')]), rel = release('d1', 'xenia_edge_linux.AppImage', bytes);
  const fetcher = fakeFetch({ [rel.asset.url]: { body: bytes } });
  const state = await releases.downloadAndInstall(root, 'edge', 'linux', rel, { fetcher });
  assert.equal(state.current.tag, 'd1'); assert.deepEqual(await fs.readFile(releases.executablePath(root, 'edge', 'linux')), bytes);
  await assert.rejects(releases.downloadAndInstall(root, 'edge', 'linux', rel, { fetcher: fakeFetch({}) }), /answered 404/);
  assert.deepEqual(await fs.readFile(path.join(root, 'edge', '_versions', 'd1', 'xenia_edge_linux.AppImage')), bytes, 'the stored copy survives a failed attempt');
});

test('httpsFetcher hands back status, headers and a streaming body without following redirects', async t => {
  const http = require('node:http');
  const server = http.createServer((request, response) => {
    if (request.url === '/go') { response.writeHead(302, { Location: 'https://release-assets.githubusercontent.com/x' }); response.end('moved'); }
    else if (request.url === '/file') { response.writeHead(200, { 'Content-Type': 'application/octet-stream' }); response.write(Buffer.alloc(70000, 1)); response.end(Buffer.alloc(30000, 2)); }
    else { response.writeHead(404); response.end('nope'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`, get = url => releases.httpsFetcher(url, { transport: http });
  const redirect = await get(`${base}/go`);
  assert.equal(redirect.status, 302); assert.equal(redirect.ok, false); assert.equal(redirect.headers.get('Location'), 'https://release-assets.githubusercontent.com/x'); assert.equal(redirect.headers.get('missing'), null);
  const file = await get(`${base}/file`); const chunks = [];
  for await (const chunk of file.body) chunks.push(chunk);
  assert.equal(file.ok, true); assert.equal(Buffer.concat(chunks).length, 100000);
  const missing = await get(`${base}/other`); assert.equal(missing.status, 404); assert.equal(missing.ok, false);
  await assert.rejects(releases.httpsFetcher('http://127.0.0.1:1/', { transport: http }), /ECONNREFUSED/);
  // it plugs straight into download(): the redirect is returned, then the next hop is requested and checked
  const bytes = Buffer.concat([Buffer.alloc(70000, 1), Buffer.alloc(30000, 2)]), rel = release('h1', 'xenia_edge_linux.AppImage', bytes);
  const hops = [];
  const viaFake = (url, init) => { hops.push(url); return url === rel.asset.url ? get(`${base}/go`).then(r => r) : get(`${base}/file`); };
  await releases.download(rel, path.join(await temp(t), 'f'), { fetcher: viaFake });
  assert.deepEqual(hops, [rel.asset.url, 'https://release-assets.githubusercontent.com/x']);
});

test('identify recognises an official build by its checksum, in the latest release or a recent one', async t => {
  const root = await temp(t), file = path.join(root, 'my-xenia.AppImage'), older = Buffer.concat([ELF, Buffer.from('older build')]);
  const newest = release('new0001', 'xenia_edge_linux.AppImage', Buffer.concat([ELF, Buffer.from('newest')]));
  const list = [{ tag_name: 'new0001', assets: [{ name: 'xenia_edge_linux.AppImage', digest: `sha256:${newest.asset.sha256}` }] }, { tag_name: 'old0002', assets: [{ name: 'xenia_edge_windows.zip', digest: `sha256:${sha(older)}` }, { name: 'xenia_edge_linux.AppImage', digest: `sha256:${sha(older)}` }] }];
  const requested = [], request = async url => { requested.push(url); return Buffer.from(JSON.stringify(list)); };
  await fs.writeFile(file, Buffer.concat([ELF, Buffer.from('newest')]));
  assert.equal(await releases.identify(file, 'edge', 'linux', request, newest), 'new0001'); assert.deepEqual(requested, [], 'the latest release needs no extra request');
  await fs.writeFile(file, older);
  assert.equal(await releases.identify(file, 'edge', 'linux', request, newest), 'old0002'); assert.match(requested[0], /releases\?per_page=30$/);
  await fs.writeFile(file, Buffer.concat([ELF, Buffer.from('a build nobody published')]));
  assert.equal(await releases.identify(file, 'edge', 'linux', request, newest), null);
  assert.equal(await releases.identify(path.join(root, 'missing'), 'edge', 'linux', request, newest), null);
  assert.equal(await releases.identify('', 'edge', 'linux', request, newest), null);
  assert.equal(await releases.identify(root, 'edge', 'linux', request, newest), null, 'a folder is not a build');
  assert.equal(await releases.identify(file, 'edge', 'win32', request, newest), null, 'on Windows GitHub publishes the zip checksum, not the exe');
  assert.equal(await releases.identify(file, 'edge', 'linux', async () => Buffer.from('{"message":"rate limit"}'), newest), null);
});

test('Xenia Canary and the official Xenia are listed with the right files per system', () => {
  assert.deepEqual(Object.keys(releases.CHANNELS), ['edge', 'canary', 'xenia']);
  assert.equal(releases.supports('canary', 'linux') && releases.supports('canary', 'win32'), true);
  assert.equal(releases.supports('xenia', 'win32'), true); assert.equal(releases.supports('xenia', 'linux'), false, 'the official project has no Linux build');
  assert.equal(releases.CHANNELS.canary.repo, 'xenia-canary/xenia-canary', 'not the stale xenia-canary-releases repository');
  assert.match(releases.executableName('canary', 'linux'), /canary/); assert.match(releases.executableName('canary', 'win32'), /canary/, 'the config file is found by the "canary" in the name');
  assert.equal(releases.executableName('xenia', 'win32'), 'xenia.exe');
  const canary = releases.parseRelease({ tag_name: '97bec07', published_at: '2026-10-13T19:14:24Z', body: '[CPU] x', assets: [{ name: 'xenia_canary_windows.7z', size: 3677466, digest: `sha256:${'a'.repeat(64)}`, browser_download_url: 'https://github.com/xenia-canary/xenia-canary/releases/download/97bec07/xenia_canary_windows.7z' }] }, 'canary', 'win32');
  assert.equal(canary.asset.name, 'xenia_canary_windows.7z');
  const official = releases.parseRelease({ tag_name: 'v1.0.2844-master', published_at: '2026-02-18T20:23:53Z', body: '', assets: [{ name: 'xenia_master.zip', size: 18242678, digest: `sha256:${'b'.repeat(64)}`, browser_download_url: 'https://github.com/xenia-project/release-builds-windows/releases/download/v1.0.2844-master/xenia_master.zip' }] }, 'xenia', 'win32');
  assert.equal(official.tag, 'v1.0.2844-master');
  assert.throws(() => releases.parseRelease({ tag_name: 'v1', assets: [] }, 'xenia', 'linux'), /no build for this system/);
});

const sevenZipReady = (() => { try { const p = require('7zip-bin').path7za; require('node:fs').chmodSync(p, 0o755); return true; } catch { return false; } })();
async function sevenZipArchive(root, name, build) {   // builds a real .7z with the bundled 7-Zip
  const { execFileSync } = require('node:child_process'), source = path.join(root, `src-${name}`), archive = path.join(root, `${name}.7z`);
  await fs.mkdir(source, { recursive: true }); await build(source);
  execFileSync(require('7zip-bin').path7za, ['a', '-bd', '-snl', archive, '.'], { cwd: source, stdio: 'ignore' });
  return archive;
}
test('7z archives are listed, checked and unpacked through the bundled 7-Zip', { skip: !sevenZipReady && 'bundled 7-Zip not runnable here' }, async t => {
  const root = await temp(t), out = path.join(root, 'out');
  const good = await sevenZipArchive(root, 'good', async dir => { await fs.writeFile(path.join(dir, 'xenia_canary.exe'), Buffer.alloc(30000, 5)); await fs.writeFile(path.join(dir, 'LICENSE'), 'BSD'); await fs.mkdir(path.join(dir, 'docs')); await fs.writeFile(path.join(dir, 'docs', 'a.txt'), 'hi'); await fs.writeFile(path.join(dir, 'xenia.pdb'), 'symbols'); });
  assert.deepEqual((await releases.extract7z(good, out)).sort(), ['LICENSE', 'docs/a.txt', 'xenia_canary.exe']);
  assert.equal((await fs.readFile(path.join(out, 'xenia_canary.exe'))).length, 30000); assert.equal(await fs.readFile(path.join(out, 'docs', 'a.txt'), 'utf8'), 'hi');
  await assert.rejects(fs.stat(path.join(out, 'xenia.pdb')), 'debug symbols are skipped');
  assert.deepEqual((await fs.readdir(out)).sort(), ['LICENSE', 'docs', 'xenia_canary.exe'], 'no scratch folder is left behind');
  await fs.writeFile(path.join(out, 'xenia-canary.config.toml'), 'mine');
  await releases.extract7z(good, out); assert.equal(await fs.readFile(path.join(out, 'xenia-canary.config.toml'), 'utf8'), 'mine', 'files Xenia made itself survive an update');
  const linked = await sevenZipArchive(root, 'linked', async dir => { await fs.writeFile(path.join(dir, 'real.txt'), 'x'); await fs.symlink('/etc/passwd', path.join(dir, 'link.txt')); });
  await assert.rejects(releases.extract7z(linked, path.join(root, 'out2')), /links are not supported/);
  await fs.writeFile(path.join(root, 'junk.7z'), 'this is not an archive');
  await assert.rejects(releases.extract7z(path.join(root, 'junk.7z'), path.join(root, 'out3')), /7-Zip could not read/);
  const wide = await sevenZipArchive(root, 'wide', async dir => { for (let i = 0; i < releases.CHANNELS ? 70 : 0; i++) await fs.writeFile(path.join(dir, `f${i}`), 'x'); });
  await assert.rejects(releases.extract7z(wide, path.join(root, 'out4')), /Unsupported or damaged/);
});
test('Windows install of a .7z puts the exe next to portable.txt and keeps the previous version', { skip: !sevenZipReady && 'bundled 7-Zip not runnable here' }, async t => {
  const root = await temp(t), name = 'xenia_canary_windows.7z', dir = path.join(root, 'canary');
  const make = async (tag, body) => { const archive = await sevenZipArchive(root, tag, async d => { await fs.writeFile(path.join(d, 'xenia_canary.exe'), body); await fs.writeFile(path.join(d, 'LICENSE'), 'BSD'); }); const bytes = await fs.readFile(archive); const file = path.join(root, 'dl', tag, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes); return { rel: release(tag, name, bytes, { channel: 'canary' }), file }; };
  const one = await make('c1', 'canary one');
  await releases.install(root, 'canary', 'win32', one.rel, one.file);
  assert.equal(await fs.readFile(path.join(dir, 'xenia_canary.exe'), 'utf8'), 'canary one'); assert.equal((await fs.stat(path.join(dir, 'portable.txt'))).size, 0);
  const two = await make('c2', 'canary two'); const state = await releases.install(root, 'canary', 'win32', two.rel, two.file);
  assert.equal(await fs.readFile(path.join(dir, 'xenia_canary.exe'), 'utf8'), 'canary two'); assert.equal(state.previous.tag, 'c1');
  await releases.rollback(root, 'canary', 'win32'); assert.equal(await fs.readFile(path.join(dir, 'xenia_canary.exe'), 'utf8'), 'canary one');
});
test('the official zip skips the 56 MB of debug symbols', async t => {
  const root = await temp(t), file = path.join(root, 'x.zip'), out = path.join(root, 'out');
  await fs.writeFile(file, makeZip([{ name: 'xenia.exe', data: 'exe' }, { name: 'xenia.pdb', data: Buffer.alloc(100000, 1) }, { name: 'LICENSE', data: 'BSD' }]));
  assert.deepEqual((await releases.extractZip(file, out)).sort(), ['LICENSE', 'xenia.exe']);
  await assert.rejects(fs.stat(path.join(out, 'xenia.pdb')));
});
