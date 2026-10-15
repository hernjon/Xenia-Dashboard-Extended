'use strict';
// Installing and updating Xenia from its GitHub releases. Nothing here runs on its own: the user starts every
// download, only fixed GitHub hosts are contacted, every file is checked against the SHA-256 GitHub publishes,
// and nothing that was downloaded is ever executed by this module.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const inflateRaw = promisify(zlib.inflateRaw);

const CHANNELS = {
  edge: {
    label: 'Xenia Edge', repo: 'has207/xenia-edge',
    // The file name must keep "edge" in it: that is how Xenia Dashboard finds the matching config file.
    assets: { linux: 'xenia_edge_linux.AppImage', win32: 'xenia_edge_windows.zip' },
    executables: { linux: 'xenia_edge_linux.AppImage', win32: 'xenia_edge.exe' }
  },
  canary: {
    label: 'Xenia Canary', repo: 'xenia-canary/xenia-canary',
    // The older xenia-canary-releases repository stopped in February 2026; the main repository carries today's builds.
    assets: { linux: 'xenia_canary_linux.AppImage', win32: 'xenia_canary_windows.7z' },
    executables: { linux: 'xenia_canary_linux.AppImage', win32: 'xenia_canary.exe' }
  },
  xenia: {
    label: 'Xenia (official)', repo: 'xenia-project/release-builds-windows',
    // The official project publishes Windows builds only.
    assets: { win32: 'xenia_master.zip' },
    executables: { win32: 'xenia.exe' }
  }
};
// Debug symbols are tens of megabytes and nobody launches them.
const SKIPPED = /\.pdb$/i;
const HOSTS = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const MAX_ASSET = 150 * 1024 * 1024, MAX_UNPACKED = 400 * 1024 * 1024, MAX_REDIRECTS = 4, MAX_ENTRIES = 64;
const TAG = /^[0-9A-Za-z._-]{1,64}$/, DIGEST = /^sha256:([0-9a-f]{64})$/;

function channel(id) { const found = Object.hasOwn(CHANNELS, id) ? CHANNELS[id] : null; if (!found) throw Error('Unknown Xenia channel'); return found; }
function supports(id, platform) { return Object.hasOwn(channel(id).assets, platform); }
function executableName(id, platform) { if (!supports(id, platform)) throw Error(`${channel(id).label} has no build for this system`); return channel(id).executables[platform]; }
function folder(root, id) { channel(id); return path.join(root, id); }
function executablePath(root, id, platform) { return path.join(folder(root, id), executableName(id, platform)); }

// ---------------------------------------------------------------- what GitHub says is the latest release
function parseRelease(json, id, platform) {
  const info = channel(id), wanted = info.assets[platform];
  if (!wanted) throw Error(`${info.label} has no build for this system`);
  if (!json || typeof json.tag_name !== 'string' || !TAG.test(json.tag_name) || !Array.isArray(json.assets)) throw Error('Unexpected answer from GitHub');
  const asset = json.assets.find(item => item?.name === wanted);
  if (!asset) throw Error(`This release has no ${wanted}`);
  const url = `https://github.com/${info.repo}/releases/download/${json.tag_name}/${wanted}`;
  if (asset.browser_download_url !== url) throw Error('The download address is not the official one');
  if (!Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_ASSET) throw Error('The download has an unexpected size');
  const digest = DIGEST.exec(String(asset.digest || ''));
  if (!digest) throw Error('GitHub published no checksum for this release, so it cannot be verified');
  const notes = String(json.body || '').split('\n').map(line => line.replace(/^[#\-*\s]+/, '').trim()).filter(Boolean).slice(0, 4).join('\n').slice(0, 400);
  return { channel: id, tag: json.tag_name, published_at: typeof json.published_at === 'string' ? json.published_at.slice(0, 10) : '', notes, asset: { name: wanted, size: asset.size, url, sha256: digest[1] } };
}
async function latest(id, platform, request) {
  const info = channel(id);
  return parseRelease(JSON.parse((await request(`https://api.github.com/repos/${info.repo}/releases/latest`, 2 * 1024 * 1024)).toString('utf8')), id, platform);
}

// Electron's own net.fetch refuses to hand redirects back ("Redirect was cancelled"), and GitHub serves every
// download through one. Node's https gives each hop to download() below, which checks it against HOSTS.
function httpsFetcher(url, { signal, transport = https } = {}) {
  return new Promise((resolve, reject) => {
    const request = transport.get(url, { headers: { 'User-Agent': 'xenia-dashboard', 'Accept-Encoding': 'identity' }, signal }, response => {
      if (response.statusCode >= 300) response.resume();     // nobody reads these bodies; free the socket
      resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, headers: { get: name => response.headers[String(name).toLowerCase()] ?? null }, body: response });
    });
    request.on('error', reject);
  });
}

// ---------------------------------------------------------------- download with redirects limited to GitHub
async function download(release, file, { fetcher, onProgress = () => {}, timeoutMs = 180000 }) {
  let url = release.asset.url, response;
  for (let hop = 0; ; hop++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !HOSTS.has(parsed.hostname) || parsed.username || parsed.password) throw Error('Refusing to download from an unexpected address');
    response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || hop >= MAX_REDIRECTS) throw Error('Too many redirects while downloading');
      url = new URL(location, url).href; continue;
    }
    break;
  }
  if (!response.ok) throw Error(`GitHub answered ${response.status} for the download`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`, hash = crypto.createHash('sha256');
  const handle = await fs.open(temp, 'wx', 0o600);
  let received = 0, reported = 0;
  try {
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > release.asset.size) throw Error('The download is larger than announced');
      hash.update(chunk); await handle.write(chunk);
      if (received - reported >= 256 * 1024 || received === release.asset.size) { reported = received; onProgress({ received, total: release.asset.size }); }
    }
    await handle.close();
    if (received !== release.asset.size) throw Error('The download was cut short');
    if (hash.digest('hex') !== release.asset.sha256) throw Error('Checksum mismatch: the file is not what GitHub published, so it was discarded');
    await fs.rename(temp, file);
  } catch (error) { await handle.close().catch(() => {}); await fs.unlink(temp).catch(() => {}); throw error; }
}

// ---------------------------------------------------------------- a small, strict zip reader (stored + deflate)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) { let c = 0xFFFFFFFF; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function safeName(name) {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  return name.split('/').every(part => part !== '..' && part !== '.');
}
function zipEntries(buffer) {
  const start = Math.max(0, buffer.length - 65557);
  let end = -1;
  for (let at = buffer.length - 22; at >= start; at--) if (buffer.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  if (end < 0) throw Error('Not a zip file');
  const count = buffer.readUInt16LE(end + 10), size = buffer.readUInt32LE(end + 12), offset = buffer.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES || count === 0xFFFF || offset === 0xFFFFFFFF || offset + size > buffer.length) throw Error('Unsupported or damaged zip file');
  const entries = [], seen = new Set();
  let at = offset, total = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) throw Error('Damaged zip directory');
    const flags = buffer.readUInt16LE(at + 8), method = buffer.readUInt16LE(at + 10), crc = buffer.readUInt32LE(at + 16);
    const packed = buffer.readUInt32LE(at + 20), unpacked = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28), extraLength = buffer.readUInt16LE(at + 30), commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42), name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (!safeName(name.replace(/\/$/, ''))) throw Error(`Unsafe path in the zip: ${name}`);
    if (name.endsWith('/')) continue;
    if (flags & 1) throw Error('Encrypted zip files are not supported');
    if (method !== 0 && method !== 8) throw Error('Unsupported zip compression');
    if (packed === 0xFFFFFFFF || unpacked === 0xFFFFFFFF) throw Error('Zip64 files are not supported');
    if (seen.has(name)) throw Error('The zip lists the same file twice'); seen.add(name);
    total += unpacked; if (total > MAX_UNPACKED) throw Error('The zip unpacks to more than the allowed size');
    entries.push({ name, method, crc, packed, unpacked, local });
  }
  return entries;
}
async function extractZip(file, directory) {
  const buffer = await fs.readFile(file);
  const entries = zipEntries(buffer).filter(entry => !SKIPPED.test(entry.name)), root = path.resolve(directory), written = [];
  await fs.mkdir(root, { recursive: true });
  for (const entry of entries) {
    if (entry.local + 30 > buffer.length || buffer.readUInt32LE(entry.local) !== 0x04034b50) throw Error('Damaged zip entry');
    const dataAt = entry.local + 30 + buffer.readUInt16LE(entry.local + 26) + buffer.readUInt16LE(entry.local + 28);
    if (dataAt + entry.packed > buffer.length) throw Error('Damaged zip entry');
    const raw = buffer.subarray(dataAt, dataAt + entry.packed);
    const data = entry.method === 0 ? raw : await inflateRaw(raw, { maxOutputLength: entry.unpacked });
    if (data.length !== entry.unpacked || crc32(data) !== entry.crc) throw Error(`The zip entry ${entry.name} is damaged`);
    const target = path.resolve(root, ...entry.name.split('/'));
    if (!target.startsWith(root + path.sep)) throw Error('Unsafe path in the zip');
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try { await fs.writeFile(temp, data, { mode: 0o755, flag: 'wx' }); await fs.rename(temp, target); }
    catch (error) { await fs.unlink(temp).catch(() => {}); throw error.code === 'EBUSY' || error.code === 'EPERM' ? Error('Close Xenia first: its program file is in use') : error; }
    written.push(entry.name);
  }
  return written;
}

// ---------------------------------------------------------------- .7z through the bundled 7-Zip
// Canary's Windows build is a .7z (BCJ2 + LZMA2), which needs the real 7-Zip. The archive is listed and every
// entry checked first; it is unpacked into a scratch folder and only then moved into place.
function sevenZipPath() { return require('7zip-bin').path7za.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked'); }
function run7z(args) {
  return new Promise((resolve, reject) => execFile(sevenZipPath(), args, { windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(Error(`7-Zip could not read the archive: ${String(stderr || error.message).split('\n')[0].slice(0, 200)}`)) : resolve(stdout)));
}
function list7z(output) {
  return output.split(/\r?\n\r?\n/).map(block => Object.fromEntries(block.split(/\r?\n/).map(line => line.match(/^([A-Za-z ]+?) = (.*)$/)).filter(Boolean).map(match => [match[1], match[2]]))).filter(entry => entry.Path !== undefined);
}
async function extract7z(file, directory) {
  const entries = list7z(await run7z(['l', '-slt', '-ba', file]));
  if (!entries.length || entries.length > MAX_ENTRIES) throw Error('Unsupported or damaged 7z file');
  let total = 0;
  const files = [], seen = new Set();
  for (const entry of entries) {
    const name = entry.Path.replace(/\\/g, '/');
    if (!safeName(name.replace(/\/$/, ''))) throw Error(`Unsafe path in the archive: ${entry.Path}`);
    if (/^l[rwx-]{9}/.test(entry.Attributes?.replace(/^[A-Z_]+\s*/, '') || '') || /L/.test((entry.Attributes || '').split(' ')[0]) || entry['Symbolic Link']) throw Error('Archives with links are not supported');
    if (entry.Folder === '+' || /^D/.test(entry.Attributes || '')) continue;
    if (seen.has(name)) throw Error('The archive lists the same file twice'); seen.add(name);
    total += Number(entry.Size) || 0; if (total > MAX_UNPACKED) throw Error('The archive unpacks to more than the allowed size');
    if (!SKIPPED.test(name)) files.push(name);
  }
  const root = path.resolve(directory), staging = path.join(root, `_unpack-${crypto.randomBytes(6).toString('hex')}`);
  await fs.mkdir(staging, { recursive: true });
  try {
    await run7z(['x', '-y', '-bd', '-aoa', `-o${staging}`, file]);
    for (const name of files) {
      const from = path.resolve(staging, ...name.split('/')), to = path.resolve(root, ...name.split('/'));
      if (!from.startsWith(staging + path.sep) || !to.startsWith(root + path.sep)) throw Error('Unsafe path in the archive');
      const stat = await fs.lstat(from);
      if (!stat.isFile()) throw Error(`The archive entry ${name} is not a plain file`);
      await fs.mkdir(path.dirname(to), { recursive: true });
      try { await fs.rename(from, to); }
      catch (error) { throw error.code === 'EBUSY' || error.code === 'EPERM' ? Error('Close Xenia first: its program file is in use') : error; }
    }
  } finally { await fs.rm(staging, { recursive: true, force: true }).catch(() => {}); }
  return files;
}

// ---------------------------------------------------------------- installed state and installing from a verified file
const stateFile = (root, id) => path.join(folder(root, id), 'installed.json');
async function readState(root, id) {
  try {
    const state = JSON.parse(await fs.readFile(stateFile(root, id), 'utf8'));
    const valid = entry => entry && typeof entry.tag === 'string' && TAG.test(entry.tag) && typeof entry.asset === 'string' && DIGEST.test(`sha256:${entry.sha256}`);
    return { current: valid(state.current) ? state.current : null, previous: valid(state.previous) ? state.previous : null };
  } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return { current: null, previous: null }; throw error; }
}
async function writeState(root, id, state) {
  const file = stateFile(root, id), temp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' }); await fs.rename(temp, file);
}
const archivePath = (root, id, entry) => path.join(folder(root, id), '_versions', entry.tag, entry.asset);
async function sha256File(file) { const hash = crypto.createHash('sha256'); hash.update(await fs.readFile(file)); return hash.digest('hex'); }

// Puts an already verified archive in place (the AppImage itself on Linux, the unpacked zip on Windows).
async function place(root, id, platform, archive) {
  const directory = folder(root, id), executable = executablePath(root, id, platform);
  await fs.mkdir(directory, { recursive: true });
  if (platform === 'win32') {
    const names = /\.7z$/i.test(archive) ? await extract7z(archive, directory) : await extractZip(archive, directory);
    if (!names.includes(path.basename(executable))) throw Error(`The download does not contain ${path.basename(executable)}`);
    // portable.txt keeps Xenia's config and saves inside this folder, so a new version never loses them.
    await fs.writeFile(path.join(directory, 'portable.txt'), '', { flag: 'a' });
  } else {
    const head = Buffer.alloc(4), handle = await fs.open(archive, 'r');
    try { await handle.read(head, 0, 4, 0); } finally { await handle.close(); }
    if (!head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw Error('The download is not a Linux program file');
    const temp = `${executable}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try { await fs.copyFile(archive, temp, fs.constants.COPYFILE_EXCL); await fs.chmod(temp, 0o755); await fs.rename(temp, executable); }
    catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
  }
  return executable;
}
async function prune(root, id, keep) {
  const versions = path.join(folder(root, id), '_versions');
  let names = []; try { names = await fs.readdir(versions); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of names) if (!keep.has(name)) await fs.rm(path.join(versions, name), { recursive: true, force: true });
}
async function install(root, id, platform, release, archive) {
  const state = await readState(root, id);
  const kept = archivePath(root, id, { tag: release.tag, asset: release.asset.name });
  await fs.mkdir(path.dirname(kept), { recursive: true });
  if (path.resolve(archive) !== path.resolve(kept)) await fs.rename(archive, kept);
  await place(root, id, platform, kept);
  const entry = { tag: release.tag, asset: release.asset.name, sha256: release.asset.sha256, published_at: release.published_at, installed_at: new Date().toISOString() };
  const next = { current: entry, previous: state.current && state.current.tag !== entry.tag ? state.current : state.previous };
  await writeState(root, id, next);
  await prune(root, id, new Set([next.current.tag, ...(next.previous ? [next.previous.tag] : [])]));
  return next;
}
async function rollback(root, id, platform) {
  const state = await readState(root, id);
  if (!state.previous) throw Error('There is no earlier version to go back to');
  const archive = archivePath(root, id, state.previous);
  let actual; try { actual = await sha256File(archive); } catch (error) { if (error.code === 'ENOENT') throw Error('The earlier version is no longer stored'); throw error; }
  if (actual !== state.previous.sha256) throw Error('The stored earlier version failed its checksum');
  await place(root, id, platform, archive);
  const next = { current: { ...state.previous, installed_at: new Date().toISOString() }, previous: state.current };
  await writeState(root, id, next);
  return next;
}
// Downloads the latest release into a scratch file inside the channel folder and installs it.
async function downloadAndInstall(root, id, platform, release, options) {
  const scratch = path.join(folder(root, id), '_versions', release.tag, release.asset.name);
  await download(release, scratch, options);
  try { return await install(root, id, platform, release, scratch); }
  catch (error) {
    // Drop the file that failed to install, unless that version is one we already keep (a failed reinstall).
    const state = await readState(root, id).catch(() => ({ current: null, previous: null }));
    if (state.current?.tag !== release.tag && state.previous?.tag !== release.tag) await fs.rm(path.dirname(scratch), { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
// Which official build is this file? Matches its SHA-256 against the latest release and then the recent ones
// (Linux only: on Windows GitHub publishes the zip's checksum, not the exe's). Returns the tag, or null.
async function identify(file, id, platform, request, newest) {
  if (platform !== 'linux' || !file) return null;
  let hash;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_ASSET) return null;
    hash = await sha256File(file);
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'EACCES') return null; throw error; }
  if (newest && hash === newest.asset.sha256) return newest.tag;
  const info = channel(id), wanted = info.assets[platform];
  const list = JSON.parse((await request(`https://api.github.com/repos/${info.repo}/releases?per_page=30`, 6 * 1024 * 1024)).toString('utf8'));
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const asset = item?.assets?.find?.(candidate => candidate?.name === wanted);
    if (asset && typeof item.tag_name === 'string' && TAG.test(item.tag_name) && asset.digest === `sha256:${hash}`) return item.tag_name;
  }
  return null;
}
module.exports = { CHANNELS, HOSTS, httpsFetcher, identify, extract7z, supports, executablePath, executableName, parseRelease, latest, download, zipEntries, extractZip, crc32, readState, install, rollback, downloadAndInstall };
