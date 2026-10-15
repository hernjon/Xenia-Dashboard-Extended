'use strict';
// A cover picked from the user's own files. The file is read, recognised by its first bytes (not its name),
// decoded and written back as a JPEG or PNG, so what the dashboard stores is always one small, known format.
const fs = require('node:fs/promises');

const MAX_FILE = 16 * 1024 * 1024, MAX_HEIGHT = 1200;
function format(bytes) {
  if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length > 12 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
async function load(file) {
  if (typeof file !== 'string' || !file || file.includes('\0')) throw Error('Invalid image');
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw Error('That is not an image file');
  if (stat.size > MAX_FILE) throw Error('The image is larger than 16 MB');
  const bytes = await fs.readFile(file);
  if (!format(bytes)) throw Error('Choose a JPEG, PNG or WebP image');
  return bytes;
}
// nativeImage is Electron's decoder, passed in so this stays testable without Electron. A JPEG stays a JPEG; PNG and
// WebP (which can be transparent, as 3D box art usually is) are written as PNG so the transparency survives.
function convert(bytes, nativeImage) {
  const kind = format(bytes);
  if (!kind) throw Error('Choose a JPEG, PNG or WebP image');
  let image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw Error('That image could not be read');
  if (image.getSize().height > MAX_HEIGHT) image = image.resize({ height: MAX_HEIGHT, quality: 'best' });
  const out = kind === 'jpeg' ? image.toJPEG(90) : image.toPNG();
  if (format(out) !== (kind === 'jpeg' ? 'jpeg' : 'png')) throw Error('That image could not be converted');
  return { bytes: out, extension: kind === 'jpeg' ? 'jpg' : 'png' };
}
module.exports = { MAX_FILE, format, load, convert };
