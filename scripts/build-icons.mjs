import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Format the supplied mark without redrawing it. A white square keeps the
// original black and red visible in both light and dark browser tab bars.
export async function buildIcons() {
  const source = await readFile(join(root, 'public/assets/beeldmerk.png'));
  const {data, info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error('The AB Firestop logo is empty.');
  const mark = await sharp(source).extract({left, top, width: right - left + 1, height: bottom - top + 1}).png().toBuffer();
  const sizes = [16, 32, 48, 64, 180, 192];
  const images = new Map();
  for (const size of sizes) {
    const inset = Math.max(1, Math.round(size * .06));
    const resized = await sharp(mark).resize(size - 2 * inset, size - 2 * inset, {fit: 'inside', kernel: 'lanczos3'}).png().toBuffer();
    const image = await sharp({create: {width: size, height: size, channels: 4, background: '#ffffff'}})
      .composite([{input: resized, gravity: 'centre'}]).png({compressionLevel: 9}).toBuffer();
    images.set(size, image);
  }

  // ICO supports embedded PNG frames: provide native 16/32/48/64 pixel choices.
  const icoSizes = [16, 32, 48, 64];
  const directory = Buffer.alloc(6 + icoSizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(icoSizes.length, 4);
  let offset = directory.length;
  for (let index = 0; index < icoSizes.length; index++) {
    const size = icoSizes[index], image = images.get(size), entry = 6 + index * 16;
    directory[entry] = size; directory[entry + 1] = size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  }
  const files = {
    'favicon.ico': Buffer.concat([directory, ...icoSizes.map(size => images.get(size))]),
    'favicon-32.png': images.get(32),
    'favicon-192.png': images.get(192),
    'apple-touch-icon.png': images.get(180)
  };
  await mkdir(join(root, 'public'), {recursive: true});
  for (const [name, content] of Object.entries(files)) await writeFile(join(root, 'public', name), content);
  return Object.keys(files);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(`AB Firestop logo icons generated: ${(await buildIcons()).join(', ')}`);
}
