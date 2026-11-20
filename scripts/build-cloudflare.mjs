import {cp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath, ['scripts/build.mjs'], {stdio: 'inherit'});
const out = 'dist/cloudflare';
await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
await cp('public', out, {recursive: true});
await rm(out + '/_redirects', {force: true}); // Netlify rewrites must not reach Pages.
for (const file of ['admin/admin.js', 'assets/analytics.js']) {
  let source = await readFile(out + '/' + file, 'utf8');
  source = source.replaceAll('/.netlify/functions/api', '/api/admin').replaceAll('/.netlify/functions/track', '/api/track')
    .replace('Controleer of de Netlify Functions mee zijn gepubliceerd.', 'Controleer de Cloudflare-opslag en beheerinstellingen.');
  await writeFile(out + '/' + file, source);
}
await build({entryPoints: ['cloudflare/worker.mjs'], outfile: out + '/_worker.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  alias: {cheerio: 'cheerio/slim'}, external: ['node:*'], legalComments: 'none'});
await writeFile(out + '/_routes.json', JSON.stringify({version: 1, include: ['/*'], exclude: ['/assets/*']}, null, 2));
await writeFile(out + '/_headers', '/assets/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
await writeFile(out + '/.assetsignore', '_worker.js\n_routes.json\n_headers\n');
console.log('Cloudflare Pages-pakket gebouwd: ' + out);
