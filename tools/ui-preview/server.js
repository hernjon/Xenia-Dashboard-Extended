'use strict';
// Developer preview: serves the real dashboard UI in an ordinary browser with the Electron
// bridge replaced by an HTTP mock built on NXE's own modules. Xenia's config is read once and
// every change stays in memory; nothing on disk is modified. Not shipped with the app.
// Usage: node tools/ui-preview/server.js --xenia-config <file> --roms <dir> [--port 8765] [--covers <dir>] [--display-config <path to show instead of the real config path>] [--first-run 1]
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const scanner = require(path.join(root, 'src', 'scanner'));
const nxe = require(path.join(root, 'src', 'nxe'));
const settings = require(path.join(root, 'src', 'xenia-settings'));
const { groupGames } = require(path.join(root, 'src', 'multidisc'));
const { readAsset } = require(path.join(root, 'src', 'local-assets'));
const patches = require(path.join(root, 'src', 'xenia-patches'));
const covers = require(path.join(root, 'src', 'covers'));
const gameInfo = require(path.join(root, 'src', 'game-info'));
const profiles = require(path.join(root, 'src', 'profiles'));
const optimized = require(path.join(root, 'src', 'optimized-settings'));
const lbDirectory = '/tmp/xd-lb-preview', lbPreviews = new Map();
let lbCounter = 0;
const coverSources = require(path.join(root, 'src', 'cover-sources')).create({ fetcher: (url, init) => fetch(url, init), setupFetcher: (url, init) => fetch(url, init), directory: lbDirectory });
const patchStorage = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'nxe-preview-patches-'));
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), list[index + 1]]], []));
const STATIC = new Set(['.html', '.js', '.css', '.jpg', '.png', '.svg', '.ttf', '.wav', '.webm']);
const art = text => text.replaceAll('kratos-art://', '/__art/');
const state = { games: [], global: '', overrides: new Map(), theme: null, locks: ['xenia', 'dashboard'] };
const publicGames = () => groupGames(state.games).map(game => { const art = game.discs?.find(disc => disc.cover_art_path) || game, cover = art.cover_art_path ? `kratos-art://cover/${art.id}` : null; return { id: game.id, title: game.title, ...(game.title_id ? { title_id: game.title_id } : {}), uses_fallback_art: !cover, cover_art_path: cover, ...(game.discs ? { discs: game.discs.map(disc => ({ id: disc.id, number: disc.disc_number, title: `Disc ${disc.disc_number}`, uses_fallback_art: !cover, cover_art_path: cover })) } : {}) }; });
const gameOf = id => { if (id === null) return null; const game = groupGames(state.games).find(g => g.id === id) || state.games.find(g => g.id === id); if (!game?.title_id) throw Error('Unknown game'); return { id: game.id, title: game.title, title_id: game.title_id }; };
const view = id => { const game = gameOf(id); return { ...settings.payload(state.global, game ? state.overrides.get(game.title_id) || '' : '', { platform: process.platform, game, profiles: state.profiles }), file: game ? `config/${game.title_id}.config.toml` : args['display-config'] || args['xenia-config'], flavor: 'xenia-edge' }; };
const api = {
  getLibrary: () => ({ games: publicGames(), error: '' }),
  setSkin: name => ({ ...nxe.publicTheme(state.theme), animations: state.animations || 'on', skin: name }),
  wizardState: () => ({ first_run: Boolean(args['first-run']) }),
  wizardBegin: () => ({ session: true }),
  wizardEnd: () => true,
  getTheme: () => ({ ...nxe.publicTheme(state.theme), animations: state.animations || 'on' }),
  getAdminAccess: () => ({ pin_required: false }),
  unlockAdmin: () => true, lockAdmin: () => undefined,
  getSecurity: () => ({ admin_pin_required: false, locked_sections: state.locks }),
  setPin: pin => { state.pin = pin; return true; },
  exitToDesktop: () => { state.exited = true; return null; },
  saveSettings: () => publicGames(),
  setSectionLock: (section, locked) => { state.locks = ['xenia', 'dashboard'].filter(id => id === section ? locked : state.locks.includes(id)); return { locked_sections: state.locks }; },
  getSettings: () => ({ locked_sections: state.locks, rom_directory: args.roms, xenia_executable: '/home/user/.local/bin/xenia_edge_linux.AppImage', runner: 'wine', runner_args: [], platform_os: process.platform, admin_pin_required: false }),
  getXeniaSettings: id => view(id),
  setXeniaSetting: (id, key, value) => { const game = gameOf(id), result = settings.apply(state.global, game ? state.overrides.get(game.title_id) || '' : '', key, value, game); if (game) state.overrides.set(game.title_id, result.override); else state.global = result.global; return view(id); },
  resetXeniaSetting: (id, key) => { const game = gameOf(id); state.overrides.set(game.title_id, settings.reset(state.global, state.overrides.get(game.title_id) || '', key)); return view(id); },
  getPatches: async id => ({ ...await patches.list(patchStorage, gameOf(id).title_id), game: gameOf(id), apply_patches: true }),
  setPatch: async (id, name, enabled) => { await patches.toggle(patchStorage, gameOf(id).title_id, name, enabled); return api.getPatches(id); },
  downloadPatches: async id => { const downloaded = await patches.download(patchStorage, gameOf(id).title_id, (url, limit) => covers.request(url, fetch, limit)); return { ...await api.getPatches(id), downloaded }; },
  getGameInfo: async id => { const game = gameOf(id), request = (url, limit) => covers.request(url, fetch, limit), content = path.join(path.dirname(args['xenia-config']), 'content'), achievements = []; for (const profile of await profiles.list(content)) { const list = await profiles.achievements(content, profile.xuid, game.title_id); if (list) achievements.push({ ...profile, achievements: list }); } return { game: { ...game, media_ids: [], discs: 1 }, info: await gameInfo.metadata(game.title_id, request, patchStorage), info_error: '', installed: await gameInfo.installed(content, game.title_id), achievements }; },
  setAnimations: mode => { state.animations = mode; return { ...nxe.publicTheme(state.theme), animations: mode }; },
  // Updates: the check really asks GitHub (read-only); installing is simulated so nothing is downloaded here.
  getUpdates: () => ({ platform: 'linux', configured: '/home/you/.local/bin/xenia_edge_linux.AppImage', channels: [
    { id: 'edge', label: 'Xenia Edge', supported: true, installed: state.edge || null, previous: state.edgePrevious || null, executable: '~/.config/Xenia Dashboard/xenia/edge/xenia_edge_linux.AppImage', in_use: !!state.edgeInUse },
    { id: 'canary', label: 'Xenia Canary', supported: true, installed: state.canary || null, previous: null, executable: '~/.config/Xenia Dashboard/xenia/canary/xenia_canary_linux.AppImage', in_use: false },
    { id: 'xenia', label: 'Xenia (official)', supported: false, installed: null, previous: null, executable: null, in_use: false }] }),
  checkUpdate: async id => require(path.join(root, 'src', 'xenia-releases')).latest(id, 'linux', (url, limit) => covers.request(url, fetch, limit)),
  installUpdate: async id => { const found = await api.checkUpdate(id); if (id === 'edge') { state.edgePrevious = state.edge || null; state.edge = { tag: found.tag, published_at: found.published_at }; } else state[id] = { tag: found.tag, published_at: found.published_at }; return api.getUpdates(); },
  useUpdate: async () => { state.edgeInUse = true; return api.getUpdates(); },
  rollbackUpdate: async () => api.getUpdates(),
  // Optimized settings: really reads the community file from GitHub, but the result is kept in memory only.
  checkOptimized: async id => { const game = gameOf(id), request = (url, init) => fetch(url, init); const found = await optimized.fetchSettings(game.title_id, request); if (!found) return { available: false, game }; const index = await optimized.fetchIndex(request); return { available: true, game, title: found.title, modified: index.get(game.title_id) || '', ...optimized.plan(state.global, state.overrides.get(game.title_id) || '', found.text) }; },
  applyOptimized: async id => { const game = gameOf(id), found = await optimized.fetchSettings(game.title_id, (url, init) => fetch(url, init)), result = optimized.plan(state.global, state.overrides.get(game.title_id) || '', found.text); state.overrides.set(game.title_id, optimized.apply(state.overrides.get(game.title_id) || '', result.changes)); return { applied: result.changes.length, skipped: result.skipped.length }; },
  // Cover manager: the real sources (Xenia Manager database and LaunchBox, whose index is read from /tmp/xd-lb-preview,
  // copied there by hand); pictures are really fetched, nothing is saved.
  coverSources: async () => { const list = []; for (const source of coverSources.values()) list.push({ id: source.id, label: source.label, needs_download: source.needsDownload, ...await source.status() }); return list; },
  prepareCoverSource: async id => ({ id, ...await coverSources.get(id).status() }),
  searchCovers: async (id, source) => coverSources.get(source).search(gameOf(id).title),
  coverPictures: async (id, source, key) => coverSources.get(source).pictures(key),
  previewCover: async (id, source, key, picture) => { const image = await coverSources.get(source).image(key, picture); const n = ++lbCounter; lbPreviews.set(String(n), image); return `kratos-art://lbpreview/${n}`; },
  applyCover: async () => { throw Error('Preview mode: covers are not saved.'); },
  chooseCoverFile: async () => null,
  autoCovers: () => ({ games: publicGames(), downloaded: 0, missing: 0 }),
  rescanCovers: () => publicGames(),
  launchXeniaGame: () => { throw Error('Preview mode: games do not launch.'); }
};
const mock = `window.electronAPI=new Proxy({onGameState(){return()=>{};},onCloseRequest(){return()=>{};},onUpdateProgress(){return()=>{};}},{get(target,name){if(name in target)return target[name];return async(...args)=>{const response=await fetch('/__api/'+String(name),{method:'POST',body:JSON.stringify(args)});const body=await response.json();if(body.error)throw new Error(body.error);return body.value;};}});`;
async function serve(request, response) {
  const url = new URL(request.url, 'http://preview');
  try {
    if (url.pathname.startsWith('/__api/')) {
      const name = url.pathname.slice(7), body = await new Promise(resolve => { let data = ''; request.on('data', chunk => data += chunk); request.on('end', () => resolve(data)); });
      if (!Object.hasOwn(api, name)) throw Error(`Preview mode: ${name} is not mocked`);
      let value; try { value = await api[name](...JSON.parse(body || '[]')); } catch (error) { return send(response, 200, 'application/json', JSON.stringify({ error: error.message })); }
      return send(response, 200, 'application/json', art(JSON.stringify({ value: value ?? null })));
    }
    if (url.pathname === '/__mock.js') return send(response, 200, 'text/javascript', mock);
    if (url.pathname.startsWith('/__art/lbpreview/')) { const picture = lbPreviews.get(url.pathname.slice(17)); return picture ? send(response, 200, picture.mime, picture.bytes) : send(response, 404, 'text/plain', 'no'); }
    if (url.pathname.startsWith('/__art/cover/')) { const id = url.pathname.slice(13), game = state.games.find(g => g.id === id); return game?.cover_art_path ? send(response, 200, 'image/jpeg', await fs.readFile(game.cover_art_path)) : send(response, 404, 'text/plain', 'Not found'); }
    if (url.pathname.startsWith('/__art/theme/')) {
      const id = url.pathname.slice(13), assets = state.theme.manifest.assets;
      if (!Object.hasOwn(assets, id)) return send(response, 404, 'text/plain', 'Not found');
      const asset = await readAsset(path.join(state.theme.directory, assets[id].file), state.theme.directory, ['.jpg', '.png', '.wav']);
      return send(response, 200, asset.mime, asset.bytes);
    }
    const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !STATIC.has(path.extname(file))) return send(response, 404, 'text/plain', 'Not found');
    let bytes = await fs.readFile(file);
    if (path.basename(file) === 'index.html') bytes = bytes.toString().replace("connect-src 'none'", "connect-src 'self'").replace('<link ', '<script src="__mock.js"></script>\n  <link ');
    send(response, 200, { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.webm': 'video/webm' }[path.extname(file)], bytes);
  } catch (error) { send(response, 500, 'text/plain', error.message); }
}
function send(response, status, type, body) { response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(body); }
(async () => {
  state.global = await fs.readFile(args['xenia-config'], 'utf8');
  state.games = args.roms ? await scanner.scanDirectory(args.roms) : [];
  if (args.covers) for (const game of state.games) { const file = path.join(args.covers, game.id + '.jpg'); if (await fs.access(file).then(() => true, () => false)) Object.assign(game, { cover_art_path: file, uses_fallback_art: false }); }
  state.profiles = await profiles.list(path.join(path.dirname(args['xenia-config']), 'content'));
  state.theme = await nxe.loadTheme(null, path.join(require('node:os').tmpdir(), 'nxe-preview'));
  http.createServer(serve).listen(Number(args.port || 8765), '127.0.0.1', () => console.log(`preview on http://127.0.0.1:${args.port || 8765}/ (${state.games.length} games)`));
})();
