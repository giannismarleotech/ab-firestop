import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

// This generated config is LOCAL ONLY and ignored by git. All commands below
// explicitly operate on local D1/R2; no Cloudflare account is accessed.
const config = 'wrangler.local.jsonc';
await writeFile(config, JSON.stringify({
  name: 'ab-firestop-local', pages_build_output_dir: './dist/cloudflare',
  compatibility_date: '2026-07-30', compatibility_flags: ['nodejs_compat'],
  d1_databases: [{binding: 'DB', database_name: 'ab-firestop-local', database_id: '00000000-0000-4000-8000-000000000001'}],
  r2_buckets: [{binding: 'MEDIA', bucket_name: 'ab-firestop-local-media'}]
}, null, 2), {mode: 0o600});
execFileSync(process.execPath, ['scripts/build-cloudflare.mjs'], {stdio: 'inherit'});
const cli = 'node_modules/wrangler/bin/wrangler.js';
execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--config', config, '--file', 'cloudflare/schema.sql'], {stdio: 'inherit'});
execFileSync(process.execPath, [cli, 'pages', 'dev', '--config', config], {stdio: 'inherit'});
