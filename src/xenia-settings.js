'use strict';
// The Xbox-style "System Settings" catalog layered over Xenia's raw config. Curated entries
// pick friendly labels and choices; every key stays reachable from Advanced.
const xeniaConfig = require('./xenia-config');
const on = [{ value: true, label: 'On' }, { value: false, label: 'Off' }];
const LANGUAGES = { 1: 'English', 2: 'Japanese', 3: 'German', 4: 'French', 5: 'Spanish', 6: 'Italian', 7: 'Korean', 8: 'Chinese (Traditional)', 9: 'Portuguese', 11: 'Polish', 12: 'Russian', 13: 'Swedish', 14: 'Turkish', 15: 'Norwegian', 16: 'Dutch', 17: 'Chinese (Simplified)' };
const scale = [1, 2, 3, 4].map(value => ({ value, label: `${value}× (${['720p', '1440p', '4K', '5K'][value - 1]} for 720p games)` }));
const CATEGORIES = [
  { id: 'console', label: 'Console', description: 'Language, region and the console the games believe they run on.', items: [
    { id: 'Console.user_language', label: 'Language', options: Object.entries(LANGUAGES).map(([value, label]) => ({ value: Number(value), label })) },
    { id: 'Console.user_country', label: 'Country or region' },
    { id: 'Console.video_standard', label: 'Video standard' },
    { id: 'Console.widescreen', label: 'Widescreen (16:9)' },
    { id: 'Console.use_50Hz_mode', label: 'PAL 50 Hz mode' },
    { id: 'Console.xmp_default_volume', label: 'Default music volume', step: 5 },
    { id: 'Content.license_mask', label: 'Arcade (XBLA) license', options: [{ value: 0, label: 'Trial' }, { value: 1, label: 'Full version' }, { value: -1, label: 'All licenses' }] },
    { id: 'Kernel.console_type', label: 'Console type', options: [{ value: -1, label: 'Retail' }, { value: 0, label: 'Development kit' }, { value: 1, label: 'Test kit' }] }
  ] },
  { id: 'display', label: 'Display', description: 'How the picture reaches your screen.', items: [
    { id: 'Display.fullscreen', label: 'Fullscreen' },
    { id: 'Console.internal_display_resolution', label: 'Console output resolution' },
    { id: 'Video.avpack', label: 'Video cable' },
    { id: 'Display.present_letterbox', label: 'Keep aspect ratio (letterbox)' },
    { id: 'Display.postprocess_antialiasing', label: 'Anti-aliasing', options: [{ value: 'none', label: 'Off' }, { value: 'fxaa', label: 'FXAA' }, { value: 'fxaa_extreme', label: 'FXAA extreme' }] },
    { id: 'Display.postprocess_scaling_and_sharpening', label: 'Upscaling', options: [{ value: 'bilinear', label: 'Bilinear' }, { value: 'cas', label: 'AMD CAS sharpening' }, { value: 'fsr', label: 'AMD FSR 1.0' }] },
    { id: 'Display.postprocess_ffx_cas_additional_sharpness', label: 'Extra sharpness', type: 'float', min: 0, max: 1, step: 0.1 },
    { id: 'Display.postprocess_dither', label: 'Smooth gradients (dither)' },
    { id: 'Kernel.kernel_display_gamma_type', label: 'Gamma', options: [{ value: 0, label: 'Linear' }, { value: 1, label: 'sRGB (CRT)' }, { value: 2, label: 'BT.709 (HDTV)' }, { value: 3, label: 'Custom power' }] },
    { id: 'Video.enable_3d_mode', label: 'Stereoscopic 3D' }
  ] },
  { id: 'graphics', label: 'Graphics', description: 'Rendering quality and speed. Higher scales need a stronger GPU.', items: [
    { id: 'GPU.draw_resolution_scale_x', label: 'Resolution scale', options: scale, link: 'GPU.draw_resolution_scale_y' },
    { id: 'GPU.render_target_path', label: 'Render path', options: [{ value: 'performance', label: 'Performance' }, { value: 'accuracy', label: 'Accuracy' }] },
    { id: 'GPU.anisotropic_override', label: 'Texture filtering', options: [{ value: -1, label: 'Game default' }, { value: 0, label: 'Off' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 3, label: '4×' }, { value: 4, label: '8×' }, { value: 5, label: '16×' }] },
    { id: 'GPU.async_shader_compilation', label: 'Background shader compiling' },
    { id: 'GPU.framerate_limit', label: 'Frame rate limit (0 = unlimited)', step: 10, min: 0, max: 360 },
    { id: 'GPU.guest_display_refresh_cap', label: 'Lock to console refresh rate' },
    { id: 'Vulkan.vulkan_allow_present_mode_immediate', label: 'Allow tearing (lowest latency)' },
    { id: 'Vulkan.vulkan_allow_present_mode_mailbox', label: 'Allow mailbox (low latency, no tearing)' },
    { id: 'Vulkan.vulkan_device', label: 'Vulkan GPU index (-1 = automatic)', min: -1, max: 8 }
  ] },
  { id: 'audio', label: 'Audio', description: 'Volume and the audio engine.', items: [
    { id: 'APU.volume', label: 'Master volume', min: 0, max: 100, step: 5 },
    { id: 'APU.enable_xmp', label: 'Music player' },
    { id: 'APU.xma_decoder', label: 'Audio decoder', options: [{ value: 'new', label: 'New (recommended)' }, { value: 'old', label: 'Old' }, { value: 'master', label: 'Original Xenia' }, { value: 'fake', label: 'No audio' }] },
    { id: 'APU.apu_max_queued_frames', label: 'Audio buffer (lower = less delay)', step: 4 },
    { id: 'APU.use_dedicated_xma_thread', label: 'Decode audio on its own thread' },
    { id: 'APU.apu', label: 'Audio output', options: [{ value: 'sdl', label: 'SDL' }, { value: 'nop', label: 'Muted (no device)' }] }
  ] },
  { id: 'controller', label: 'Controllers', description: 'Vibration, Guide button and stick deadzones.', items: [
    { id: 'HID.vibration', label: 'Vibration' },
    { id: 'HID.guide_button', label: 'Guide button reaches the game' },
    { id: 'HID.left_stick_deadzone_percentage', label: 'Left stick deadzone', type: 'float', min: 0, max: 1, step: 0.05 },
    { id: 'HID.right_stick_deadzone_percentage', label: 'Right stick deadzone', type: 'float', min: 0, max: 1, step: 0.05 },
    { id: 'General.controller_hotkeys', label: 'Controller hotkeys' },
    { id: 'HID.keyboard_passthrough', label: 'Keyboard goes straight to the game' }
  ] },
  { id: 'system', label: 'Emulation', description: 'Updates, patches, notifications and integrations.', items: [
    { id: 'General.apply_patches', label: 'Game patches' },
    { id: 'Kernel.apply_title_update', label: 'Title updates' },
    { id: 'Kernel.allow_incompatible_title_update', label: 'Allow mismatched title updates' },
    { id: 'UI.show_achievement_notification', label: 'Achievement pop-ups' },
    { id: 'General.discord', label: 'Discord status' },
    { id: 'General.allow_plugins', label: 'Plugins and trainers' },
    { id: 'Linux.use_gamemode', label: 'Feral GameMode', platforms: ['linux'] },
    { id: 'Linux.use_mangohud', label: 'MangoHud overlay', platforms: ['linux'] }
  ] },
  { id: 'profiles', label: 'Profiles', systemOnly: true, separate: true, description: 'Which Xenia profiles are signed in when a game starts. Create profiles in Xenia itself.', items: [1, 2, 3, 4].map(player => ({ id: `Profiles.logged_profile_slot_${player - 1}_xuid`, label: `Player ${player} signed in as`, profiles: true }))},
  { id: 'storage', label: 'Storage', description: 'Where Xenia keeps saves, content and caches. Leave paths empty for the defaults.', items: [
    { id: 'Storage.content_root', label: 'Content folder' },
    { id: 'Storage.cache_root', label: 'Cache folder' },
    { id: 'Storage.mount_memory_unit', label: 'Memory unit' },
    { id: 'Storage.mount_cache', label: 'Cache partition' },
    { id: 'UI.storage_selection_dialog', label: 'Ask which storage device to use' }
  ] }
];
const CATALOG = new Map(CATEGORIES.flatMap(category => category.items.map(item => [item.id, item])));
// Profile slots hold an XUID; offer the profiles found in Xenia's content folder by gamertag.
function profileOptions(profiles, current) {
  const options = [{ value: '', label: 'Nobody' }, ...profiles.map(profile => ({ value: profile.xuid, label: `${profile.gamertag} (${profile.xuid})` }))];
  return current && !options.some(option => option.value === current) ? [...options, { value: current, label: `${current} (profile not found)` }] : options;
}
// Curated entries already show their choices, so keep only the prose before Xenia's option tables.
function summary(description) {
  const lines = description.split('\n'), end = lines.findIndex(line => /^(Use:|-?\d+\s*=|0x[0-9A-Fa-f]+\s*=|[\w-]+( \(.*\))?:$|true:|false:)/.test(line));
  return lines.slice(0, end < 0 ? lines.length : end).join('\n').replace(/\s*(Use|Possible values):?\s*\[[^\]]*\]\.?/g, '').trim();
}
// Curated choices replace the parsed ones; curated numeric hints replace parsed ranges.
function describeEntry(entry, profiles = []) {
  const item = CATALOG.get(`${entry.section}.${entry.key}`) || {};
  const type = item.type || entry.type;
  const options = item.profiles ? profileOptions(profiles, entry.value) : item.options || (entry.type === 'bool' ? on : entry.options.length && (type === 'string' || entry.options.some(option => option.value === entry.value)) ? entry.options : []);
  return { id: `${entry.section}.${entry.key}`, section: entry.section, key: entry.key, label: item.label || entry.key, type, options, description: item.label ? summary(entry.description) : entry.description, ...(item.min ?? entry.min) !== undefined ? { min: item.min ?? entry.min, max: item.max ?? entry.max } : {}, step: item.step || (type === 'float' ? 0.1 : 1), ...(item.link ? { link: item.link } : {}) };
}
function entryFor(global, id) {
  const [section, key] = typeof id === 'string' ? id.split('.') : [];
  return section && key ? xeniaConfig.get(global, section, key) : undefined;
}
// Values shown for a scope: per-game overrides win over the system file.
function payload(globalText, overrideText, { platform = process.platform, game = null, profiles = [] } = {}) {
  const global = xeniaConfig.parse(globalText), overrides = overrideText ? xeniaConfig.parse(overrideText) : null;
  const item = entry => {
    const override = overrides && xeniaConfig.get(overrides, entry.section, entry.key);
    return { ...describeEntry(entry, profiles), value: override ? override.value : entry.value, ...(game ? { overridden: !!override, system_value: entry.value } : {}) };
  };
  const categories = CATEGORIES.filter(category => !(game && category.systemOnly)).map(category => ({ id: category.id, label: category.label, description: category.description, ...(category.separate ? { separate: true } : {}), items: category.items.filter(entry => !entry.platforms || entry.platforms.includes(platform)).map(entry => entryFor(global, entry.id)).filter(Boolean).map(item) })).filter(category => category.items.length);
  const advanced = global.sections.map(section => ({ id: section.name, label: section.name, items: section.keys.map(entry => ({ ...item(entry), label: entry.key, description: entry.description })) })).filter(section => section.items.length);
  return { categories, advanced, ...(game ? { game } : {}) };
}
function validate(global, id, value, profiles = []) {
  const entry = entryFor(global, id);
  if (!entry) throw Error('Unknown Xenia setting');
  const described = describeEntry(entry, profiles), item = CATALOG.get(id);
  xeniaConfig.validate({ ...entry, type: described.type, options: described.type === 'string' ? described.options : [] }, value);
  if (item?.options && !item.options.some(option => option.value === value)) throw Error(`${described.label} must be one of the listed choices`);
  return { entry, described };
}
// Applies one change to the system file (game = null) or the game's override file.
function apply(globalText, overrideText, id, value, game = null, profiles = []) {
  const global = xeniaConfig.parse(globalText), { entry, described } = validate(global, id, value, profiles);
  if (game && CATEGORIES.some(category => category.systemOnly && category.items.some(item => item.id === id))) throw Error('This setting applies to the whole system');
  const targets = [entry, ...(described.link ? [entryFor(global, described.link)].filter(Boolean) : [])];
  if (!game) return { global: targets.reduce((text, target) => xeniaConfig.setValue(text, target.section, target.key, value, described.type), globalText) };
  return { override: targets.reduce((text, target) => xeniaConfig.setOverride(text, target.section, target.key, described.type, value), overrideText || '') };
}
function reset(globalText, overrideText, id) {
  const global = xeniaConfig.parse(globalText), entry = entryFor(global, id);
  if (!entry) throw Error('Unknown Xenia setting');
  const link = describeEntry(entry).link, targets = [id, ...(link ? [link] : [])];
  return targets.reduce((text, target) => { const [section, key] = target.split('.'); return xeniaConfig.removeOverride(text, section, key); }, overrideText || '');
}
module.exports = { CATEGORIES, payload, apply, reset, validate };
