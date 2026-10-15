'use strict';
// Reads and edits Xenia's flat TOML configs (`[Section]` + `key = value  # comment`) while
// keeping every comment, unknown key and column alignment exactly as Xenia wrote it.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const VALUE = String.raw`"(?:[^"\\]|\\.)*"|'[^']*'|true|false|[-+]?(?:0x[0-9A-Fa-f]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|inf|nan)`;
const KEY_LINE = new RegExp(String.raw`^([A-Za-z0-9_]+)(\s*=\s*)(${VALUE})(\s*)(#.*)?$`);
const SECTION_LINE = /^\[([A-Za-z0-9_.]+)\]\s*(#.*)?$/;
const CONTINUATION = /^\s+#(.*)$/;
const COMMENT_COLUMN = 50;
const MAX_FILE = 4 * 1024 * 1024;
function decode(raw) {
  if (raw === 'true' || raw === 'false') return { type: 'bool', value: raw === 'true' };
  if (raw.startsWith('"')) { try { return { type: 'string', value: JSON.parse(raw) }; } catch { return { type: 'string', value: raw.slice(1, -1) }; } }
  if (raw.startsWith("'")) return { type: 'string', value: raw.slice(1, -1) };
  if (/^[-+]?0x/i.test(raw)) return { type: 'int', value: Number.parseInt(raw, 16) * (raw.startsWith('-') ? -1 : 1) };
  if (/^[-+]?\d+$/.test(raw)) return { type: 'int', value: Number(raw) };
  return { type: 'float', value: Number(raw.replace(/^([-+]?)inf$/, '$1Infinity').replace(/^[-+]?nan$/, 'NaN')) };
}
function encode(type, value) {
  if (type === 'bool') return value ? 'true' : 'false';
  if (type === 'int') return String(value);
  if (type === 'float') { const text = String(value); return /[.eE]/.test(text) || !Number.isFinite(value) ? text : `${text}.0`; }
  return JSON.stringify(value);
}
// "Use: [a, b]" lists and "N=label" tables in the comment become selectable options.
// Xenia hard-wraps long comments; rejoin a line that continues a sentence, keep real line breaks.
function reflow(lines) {
  return lines.reduce((result, line) => {
    const previous = result[result.length - 1];
    if (previous !== undefined && /^[a-z(]/.test(line) && !/[.:!?)\]]$/.test(previous)) result[result.length - 1] = `${previous} ${line}`;
    else result.push(line);
    return result;
  }, []);
}
function describe(lines) {
  const description = reflow(lines.map(line => line.trim()).filter(Boolean));
  const text = description.join('\n');
  const use = /Use:\s*\[([^\]]+)\]/.exec(text);
  const options = use ? use[1].split(',').map(option => option.trim()).filter(Boolean).map(value => ({ value, label: value })) : [];
  if (!options.length && !/bitmask/i.test(text)) {
    for (const line of description) for (const match of line.matchAll(/(?:^|\s)(-?\d+)\s*=\s*(.+?)(?=\s+-?\d+\s*=|$)/g)) options.push({ value: Number(match[1]), label: match[2].trim() });
    const seen = new Set();
    for (let index = options.length - 1; index >= 0; index--) { if (seen.has(options[index].value)) options.splice(index, 1); else seen.add(options[index].value); }
  }
  const range = /(?:Value range|Allowed range|Range)\s*:?\s*\[?\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*\]?/i.exec(text) || /\[(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\]/.exec(text);
  return { description: text, options: options.length >= 2 ? options : [], ...(range ? { min: Number(range[1]), max: Number(range[2]) } : {}) };
}
function parse(text) {
  if (typeof text !== 'string') throw Error('Invalid Xenia config');
  const lines = text.split(/\r?\n/), sections = [], entries = new Map();
  let section = null, last = null, comments = [];
  const finish = () => {
    if (last) {
      Object.assign(last, describe(comments));
      // Xenia writes whole-number defaults for some fractional settings (e.g. deadzones "[0.0-1.0]").
      if (last.type === 'int' && last.max !== undefined && /\.\d/.test(last.description.match(/-?\d+\.\d+/)?.[0] || '')) last.type = 'float';
    }
    last = null; comments = [];
  };
  lines.forEach((line, index) => {
    const header = SECTION_LINE.exec(line);
    if (header) { finish(); section = { name: header[1], keys: [] }; sections.push(section); return; }
    const continuation = CONTINUATION.exec(line);
    if (continuation && last) { comments.push(continuation[1]); return; }
    const match = KEY_LINE.exec(line);
    if (match && section) {
      finish();
      const { type, value } = decode(match[3]);
      last = { section: section.name, key: match[1], type, value, line: index };
      comments = match[5] ? [match[5].slice(1)] : [];
      last.raw = match[3];
      section.keys.push(last); entries.set(`${section.name}.${match[1]}`, last);
      return;
    }
    if (!line.trim()) { if (last && comments.length) finish(); return; }
    finish();
  });
  finish();
  return { sections, entries, lines, newline: text.includes('\r\n') ? '\r\n' : '\n' };
}
function get(config, section, key) { return config.entries.get(`${section}.${key}`); }
// Values must keep the existing key's type and text options must be listed. Numeric ranges and
// tables only guide the UI: Xenia's own defaults sit outside some of them (scribble_heap_value = 0).
function validate(entry, value) {
  if (!entry) throw Error('Unknown Xenia setting');
  if (entry.type === 'bool' && typeof value !== 'boolean') throw Error(`${entry.key} must be on or off`);
  if (entry.type === 'int' && !Number.isSafeInteger(value)) throw Error(`${entry.key} must be a whole number`);
  if (entry.type === 'float' && (typeof value !== 'number' || !Number.isFinite(value))) throw Error(`${entry.key} must be a number`);
  if (entry.type === 'string' && (typeof value !== 'string' || value.length > 4096 || /[\0\r\n]/.test(value))) throw Error(`${entry.key} must be a single line of text`);
  if (entry.type === 'string' && entry.options?.length && !entry.options.some(option => option.value === value)) throw Error(`${entry.key} must be one of: ${entry.options.map(option => option.value).join(', ')}`);
  return value;
}
function setLine(line, entry, value) {
  const match = KEY_LINE.exec(line);
  const head = `${match[1]}${match[2]}${encode(entry.type, value)}`;
  if (!match[5]) return head;
  const padding = match[4].replace(/\t+$/, ''), tabs = /\t*$/.exec(match[4])[0];
  const width = match[1].length + match[2].length + match[3].length + padding.length;
  return head + ' '.repeat(Math.max(1, width - head.length, COMMENT_COLUMN - head.length)) + tabs + match[5];
}
// `type` lets a caller widen a key Xenia wrote as a whole number (e.g. 0 for a 0–1 slider) to float.
function setValue(text, section, key, value, type) {
  const config = parse(text), found = get(config, section, key), entry = found && type ? { ...found, type } : found;
  validate(entry, value);
  config.lines[entry.line] = setLine(config.lines[entry.line], entry, value);
  return config.lines.join(config.newline);
}
// Per-game files hold only overrides: add or replace one key, creating its section if needed.
function setOverride(text, section, key, type, value) {
  const config = parse(text || ''), entry = get(config, section, key);
  if (entry) { config.lines[entry.line] = setLine(config.lines[entry.line], entry, value); return config.lines.join(config.newline); }
  const line = `${key} = ${encode(type, value)}`, target = config.sections.find(s => s.name === section);
  const lines = config.lines.slice();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!target) return [...lines, ...(lines.length ? [''] : []), `[${section}]`, line, ''].join(config.newline);
  const after = target.keys.length ? target.keys[target.keys.length - 1].line : config.lines.findIndex(l => SECTION_LINE.exec(l)?.[1] === section);
  let insert = after + 1;
  while (insert < config.lines.length && CONTINUATION.test(config.lines[insert])) insert++;
  const copy = config.lines.slice(); copy.splice(insert, 0, line); return copy.join(config.newline);
}
function removeOverride(text, section, key) {
  const config = parse(text || ''), entry = get(config, section, key);
  if (!entry) return text || '';
  let end = entry.line + 1;
  while (end < config.lines.length && CONTINUATION.test(config.lines[end])) end++;
  const lines = config.lines.slice(); lines.splice(entry.line, end - entry.line);
  if (!parse(lines.join('\n')).sections.find(s => s.name === section)?.keys.length) {
    const header = lines.findIndex(l => SECTION_LINE.exec(l)?.[1] === section);
    if (header >= 0) { lines.splice(header, 1); if (header > 0 && !lines[header - 1]?.trim() && !lines[header]?.trim()) lines.splice(header - 1, 1); }
  }
  while (lines.length && !lines[0].trim()) lines.shift();
  const result = lines.join(config.newline);
  return result.trim() ? result : '';
}
// Where Xenia keeps its files: next to the executable in portable mode, else the user folder.
function locate({ executable, platform = process.platform, home, documents, xdgDataHome, existing = () => false }) {
  const paths = platform === 'win32' ? path.win32 : path.posix, join = paths.join;
  if (typeof executable !== 'string' || !paths.isAbsolute(executable)) return null;
  const directory = paths.dirname(executable);
  const storage = existing(join(directory, 'portable.txt')) ? directory : platform === 'win32' ? join(documents, 'Xenia') : join(xdgDataHome || join(home, '.local', 'share'), 'Xenia');
  const name = paths.basename(executable).toLowerCase();
  const names = name.includes('edge') ? ['xenia-edge.config.toml'] : name.includes('canary') ? ['xenia-canary.config.toml'] : ['xenia.config.toml', 'xenia-canary.config.toml', 'xenia-edge.config.toml'];
  const file = names.map(file => join(storage, file)).find(existing) || join(storage, names[0]);
  return { storage, file, flavor: paths.basename(file).replace(/\.config\.toml$/, '') };
}
async function read(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE) throw Error('Xenia config is not a regular file');
  return fs.readFile(file, 'utf8');
}
async function readOptional(file) { try { return await read(file); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; } }
// Atomic replace through an exclusive random temp file; the first edit keeps Xenia's original.
async function write(file, text, { backup = true } = {}) {
  if (Buffer.byteLength(text) > MAX_FILE) throw Error('Xenia config is too large');
  await fs.mkdir(path.dirname(file), { recursive: true });
  let mode = 0o644;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Xenia config is not a regular file');
    mode = stat.mode & 0o777;
    if (backup) await fs.copyFile(file, `${file}.nxe-backup`, fs.constants.COPYFILE_EXCL).catch(error => { if (error.code !== 'EEXIST') throw error; });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  let created = false;
  try { await fs.writeFile(temp, text, { mode, flag: 'wx' }); created = true; await fs.rename(temp, file); created = false; }
  finally { if (created) await fs.unlink(temp).catch(() => {}); }
}
async function remove(file) { await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
module.exports = { parse, get, validate, setValue, setOverride, removeOverride, locate, read, readOptional, write, remove, encode };
