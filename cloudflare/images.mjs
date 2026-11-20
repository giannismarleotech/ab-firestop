import {fail} from '../server/model.mjs';

// The dashboard converts JPG/PNG/WebP to WebP in the browser. No native image
// module is required in Workers. Bound container size, dimensions and chunk sizes.
export async function processImage(input) {
  const b = Buffer.from(input);
  const bad = () => fail(400, 'Deze foto kan niet worden verwerkt. Upload ze opnieuw via het dashboard.');
  if (b.length < 20 || b.length > 4 * 1024 * 1024 || b.toString('ascii', 0, 4) !== 'RIFF' ||
      b.toString('ascii', 8, 12) !== 'WEBP' || b.readUInt32LE(4) !== b.length - 8) bad();
  let dimensions, imageCount = 0, extended = false;
  for (let offset = 12; offset < b.length;) {
    if (offset + 8 > b.length) bad();
    const kind = b.toString('ascii', offset, offset + 4), length = b.readUInt32LE(offset + 4), start = offset + 8;
    const end = start + length;
    if (end > b.length) bad();
    if (kind === 'ANIM' || kind === 'ANMF') bad();
    if (kind === 'VP8X') {
      if (offset !== 12 || extended || length !== 10 || (b[start] & 0xc3) || b[start+1] || b[start+2] || b[start+3]) bad();
      extended = true;
      dimensions = [b.readUIntLE(start + 4, 3) + 1, b.readUIntLE(start + 7, 3) + 1];
    } else if (kind === 'VP8 ') {
      if (length < 10 || (b[start] & 1) || b[start + 3] !== 0x9d || b[start + 4] !== 0x01 || b[start + 5] !== 0x2a) bad();
      const size = [b.readUInt16LE(start + 6) & 0x3fff, b.readUInt16LE(start + 8) & 0x3fff];
      if (dimensions && String(dimensions) !== String(size)) bad();
      dimensions = size; imageCount++;
    } else if (kind === 'VP8L') {
      if (length < 5 || b[start] !== 0x2f) bad();
      const bits = b.readUInt32LE(start + 1);
      if (bits >>> 29) bad();
      const size = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
      if (dimensions && String(dimensions) !== String(size)) bad();
      dimensions = size; imageCount++;
    }
    offset = end + (length & 1);
    if (offset > b.length) bad();
  }
  if (imageCount !== 1 || !dimensions || dimensions.some(n => n < 1 || n > 2400)) bad();
  return b;
}
