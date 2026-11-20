import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {processImage} from '../cloudflare/images.mjs';
import {settings} from '../server/security.mjs';

test('WebP parser rejects misleading or repeated extended headers', async () => {
  const valid = await sharp({create: {width: 20, height: 12, channels: 3, background: 'red'}}).webp().toBuffer();
  assert.deepEqual(await processImage(valid), valid);
  const extra = Buffer.alloc(18); extra.write('VP8X'); extra.writeUInt32LE(10, 4);
  // A second dimension header after the actual image must not override limits.
  const bad = Buffer.concat([valid, extra]); bad.writeUInt32LE(bad.length - 8, 4);
  await assert.rejects(processImage(bad), {status: 400});
});
test('malformed admin hash cannot report a configured dashboard', () => {
  assert.throws(() => settings({AB_ADMIN_PASSWORD_HASH: 'not-a-hash', AB_SESSION_SECRET: 'a'.repeat(64)}), {status: 503});
});
