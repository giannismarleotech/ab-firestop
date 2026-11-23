import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { scryptSync } from 'node:crypto';
import { Miniflare } from 'miniflare';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const origin = 'https://ab-firestop.test';
const password = 'Test-only-dashboard-password!';
const salt = '0123456789abcdef0123456789abcdef';
const hash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

async function fixture() {
  const temp = await mkdtemp(resolve(tmpdir(), 'ab-cloudflare-test-'));
  const assetsRoot = resolve(root, 'dist/cloudflare');
  const options = {
    modules: true,
    scriptPath: resolve(assetsRoot, '_worker.js'),
    compatibilityDate: '2026-07-30',
    compatibilityFlags: ['nodejs_compat'],
    cf: false,
    d1Databases: { DB: 'ab-firestop-test' },
    r2Buckets: { MEDIA: 'ab-firestop-media-test' },
    d1Persist: resolve(temp, 'd1'),
    r2Persist: resolve(temp, 'r2'),
    bindings: {
      AB_ADMIN_EMAIL: 'info@abfirestop.be',
      AB_ADMIN_PASSWORD_HASH: hash,
      AB_SESSION_SECRET: 'test-only-session-secret-at-least-32-characters',
      AB_PUBLIC_URL: origin,
    },
    serviceBindings: {
      ASSETS: async request => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Bad path', { status: 400 }); }
        const file = resolve(assetsRoot, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
        if (!file.startsWith(assetsRoot + sep) || file.endsWith('/_worker.js')) return new Response('Not found', { status: 404 });
        try { return new Response(await readFile(file), { headers: { 'content-type': types[extname(file)] ?? 'application/octet-stream' } }); }
        catch { return new Response('Not found', { status: 404 }); }
      },
    },
  };
  let mf = new Miniflare(options);
  const db = await mf.getD1Database('DB');
  const schema = await readFile(resolve(root, 'cloudflare/schema.sql'), 'utf8');
  for (const statement of schema.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  return {
    request: (path, init) => mf.dispatchFetch(origin + path, init),
    db: () => mf.getD1Database('DB'),
    bucket: () => mf.getR2Bucket('MEDIA'),
    async restart() { await mf.dispose(); mf = new Miniflare(options); await mf.ready; },
    async dispose() { await mf.dispose(); await rm(temp, { recursive: true, force: true }); },
  };
}

// This exercises the compiled Worker in workerd with actual local D1 and R2.
// No production API, account, or website is contacted.
test('Cloudflare Pages: routing, authenticated editing, photos and durable state', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  let cookie = '', csrf = '';
  const api = async (action, data, headers = {}, prefix = '/api/admin') => {
    const query = typeof action === 'string' ? action : new URLSearchParams(action).toString();
    let wireBody = data, bodyType;
    if (data instanceof FormData) {
      const encoded = new Request(origin, {method: 'POST', body: data});
      bodyType = encoded.headers.get('content-type');
      wireBody = await encoded.arrayBuffer();
    }
    return f.request(prefix + '?' + (query.startsWith('action=') ? query : 'action=' + query), {
      method: data === undefined ? 'GET' : 'POST',
      headers: { cookie, origin, 'x-csrf-token': csrf, 'content-type': bodyType ?? 'application/json', ...headers },
      ...(data === undefined ? {} : { body: data instanceof FormData ? wireBody : JSON.stringify(data) }),
    });
  };
  const login = async () => {
    const response = await api('login', { email: 'info@abfirestop.be', password });
    assert.equal(response.status, 200, await response.clone().text());
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /__Host-ab-admin=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Strict/i);
    cookie = setCookie.split(';')[0];
    csrf = (await response.json()).csrf;
    assert.match(csrf, /^[a-f0-9]{64}$/);
  };

  await t.test('all 60 pages work at HTML, clean, and trailing-slash URLs', async () => {
    const templates = JSON.parse(await readFile(resolve(root, 'server/templates.json'), 'utf8'));
    assert.equal(Object.keys(templates).length, 60);
    for (const path of Object.keys(templates)) {
      const clean = path.replace(/index\.html$/, '').replace(/\.html$/, '');
      const routes = new Set(['/' + path, '/' + clean, clean ? '/' + clean.replace(/\/$/, '') + '/' : '/']);
      if (path === 'fr/index.html' || path === 'en/index.html') routes.add('/' + path.slice(0, 2));
      for (const route of routes) {
        const response = await f.request(route);
        assert.equal(response.status, 200, route + ': ' + await response.clone().text());
        assert.match(response.headers.get('content-type'), /text\/html/);
        const html = await response.text();
        assert.ok(html.includes(`data-cms-page="${path}"`), route);
        assert.ok(html.includes('<main'), route);
      }
    }
  });
  await t.test('unknown and private paths fail; public queries cannot select another page', async () => {
    for (const path of ['/no-such-page', '/.env', '/server/templates.json', '/cloudflare/schema.sql', '/_worker.js']) {
      const response = await f.request(path);
      assert.ok([400, 403, 404].includes(response.status), path + ': ' + response.status);
    }
    assert.match(await (await f.request('/?page=missing')).text(), /data-cms-page="index.html"/);
    const head = await f.request('/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
  await t.test('admin and static assets are served with restrictive admin headers', async () => {
    const admin = await f.request('/admin/');
    assert.equal(admin.status, 200);
    assert.match(admin.headers.get('cache-control'), /no-store/);
    assert.match(admin.headers.get('x-robots-tag'), /noindex/);
    assert.match(admin.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const script = await f.request('/admin/admin.js');
    assert.equal(script.status, 200);
    assert.ok((await script.text()).includes('showLogin'));
  });
  await t.test('unauthenticated access, wrong credentials and cross-origin writes are denied', async () => {
    assert.equal((await api('pages')).status, 401);
    assert.equal((await api('login', { email: 'info@abfirestop.be', password: 'wrong' })).status, 401);
    assert.equal((await api('login', { email: 'info@abfirestop.be', password }, { origin: 'https://evil.test' })).status, 403);
    assert.equal((await api('login')).status, 405);
  });
  await t.test('login and legacy endpoint alias use the same secure session', async () => {
    await login();
    const session = await api('session', undefined, {}, '/.netlify/functions/api');
    assert.equal(session.status, 200);
    assert.equal((await session.json()).email, 'info@abfirestop.be');
  });

  let page, textId, imageId, firstEtag, uploaded;
  await t.test('edits publish safely, reject stale writes and do not publish previews', async () => {
    page = await (await api({ action: 'page', page: 'index.html' })).json();
    assert.equal(page.etag, null);
    textId = Object.keys(page.fields).find(key => page.fields[key].type === 'text' && page.fields[key].area === 'Pagina-inhoud');
    imageId = Object.keys(page.fields).find(key => page.fields[key].type === 'image');
    page.content.values[textId] = 'Cloudflare edit <script>alert(1)</script>';
    const change = { page: 'index.html', etag: page.etag, content: page.content };
    assert.equal((await api('save', change, { 'x-csrf-token': 'invalid' })).status, 403);
    assert.equal((await api('save', change, { origin: 'https://evil.test' })).status, 403);
    const response = await api('save', change);
    assert.equal(response.status, 200, await response.clone().text());
    const saved = await response.json();
    firstEtag = saved.etag;
    assert.ok(firstEtag);
    assert.ok(saved.updatedAt);
    assert.equal((await api('save', change)).status, 409);
    const html = await (await f.request('/')).text();
    assert.ok(html.includes('Cloudflare edit &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    const preview = structuredClone(page.content);
    preview.values[textId] = 'Preview not published';
    const output = await api('preview', { page: 'index.html', content: preview });
    assert.equal(output.status, 200);
    const previewHtml = (await output.json()).html;
    assert.ok(previewHtml.includes('Preview not published'));
    assert.ok(!previewHtml.includes('<script'));
    assert.ok(!(await (await f.request('/')).text()).includes('Preview not published'));
  });
  await t.test('invalid content, script URLs and oversized JSON are rejected', async () => {
    const bad = structuredClone(page.content);
    bad.values[imageId] = 'javascript:alert(1)';
    assert.equal((await api('preview', { page: 'index.html', content: bad })).status, 400);
    bad.values[imageId] = 'https://external.test/image.webp';
    assert.equal((await api('preview', { page: 'index.html', content: bad })).status, 400);
    assert.equal((await api({ action: 'page', page: '../../private' })).status, 404);
    const response = await api('save', { page: 'index.html', content: { values: { [textId]: 'x'.repeat(250000) } } });
    assert.ok([400, 413].includes(response.status));
  });
  await t.test('validated photo bytes are stored in R2 and served through both routes', async () => {
    const svg = new FormData();
    svg.append('image', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/svg+xml' }), 'bad.svg');
    assert.equal((await api('upload', svg)).status, 400);
    const bytes = await sharp({ create: { width: 20, height: 12, channels: 3, background: '#fa0000' } }).webp().toBuffer();
    const form = new FormData();
    form.append('image', new Blob([bytes], { type: 'image/webp' }), 'photo.webp');
    const response = await api('upload', form);
    assert.equal(response.status, 200, await response.clone().text());
    uploaded = await response.json();
    assert.match(uploaded.id, /^[a-f0-9-]{36}$/);
    for (const src of [uploaded.src, '/.netlify/functions/media?id=' + uploaded.id]) {
      const media = await f.request(src);
      assert.equal(media.status, 200, src);
      assert.equal(media.headers.get('content-type'), 'image/webp');
      assert.match(media.headers.get('cache-control'), /immutable/);
      assert.equal((await sharp(Buffer.from(await media.arrayBuffer())).metadata()).format, 'webp');
    }
    const library = await (await api('media')).json();
    assert.ok(library.some(photo => photo.id === uploaded.id));
    const bucket = await f.bucket();
    assert.ok(await bucket.head('photo/' + uploaded.id));
    const oversized = new FormData();
    oversized.append('image', new Blob([Buffer.alloc(4 * 1024 * 1024 + 1)], { type: 'image/webp' }), 'too-big.webp');
    assert.ok([400, 413].includes((await api('upload', oversized)).status));
  });
  await t.test('photo replacements and gallery render; version history restores content', async () => {
    page.content.values[imageId] = uploaded.src;
    page.content.extras = [{ src: uploaded.src, alt: 'Our project <script>' }];
    let response = await api('save', { page: 'index.html', etag: firstEtag, content: page.content });
    assert.equal(response.status, 200, await response.clone().text());
    const published = await (await f.request('/')).text();
    assert.ok(published.includes(uploaded.src.replaceAll('&', '&amp;')));
    assert.ok(published.includes('Our project &lt;script&gt;'));
    const fresh = await (await api({ action: 'page', page: 'index.html' })).json();
    assert.equal(fresh.history.length, 2);
    const old = fresh.history.at(-1);
    response = await api('restore', { page: 'index.html', etag: fresh.etag, id: old.id });
    assert.equal(response.status, 200);
    assert.ok(!(await (await f.request('/')).text()).includes('Cloudflare edit'));
  });
  await t.test('simultaneous publications reject one stale version', async () => {
    const fresh = await (await api({ action: 'page', page: 'index.html' })).json();
    const changes = ['Concurrent A', 'Concurrent B'].map(value => {
      const content = structuredClone(fresh.content);
      content.values[textId] = value;
      return api('save', { page: 'index.html', etag: fresh.etag, content });
    });
    const codes = (await Promise.all(changes)).map(r => r.status).sort();
    assert.deepEqual(codes, [200, 409]);
  });
  await t.test('analytics count aggregate page views, block cross-origin writes and ignore bots', async () => {
    const post = (headers = {}) => f.request('/api/track', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ page: 'index.html' }) });
    for (let i = 0; i < 2; i++) assert.equal((await post()).status, 204);
    assert.equal((await post({ 'user-agent': 'test-crawler' })).status, 204);
    assert.equal((await post({ origin: 'https://evil.test' })).status, 403);
    const stats = await (await api('stats')).json();
    assert.equal(stats.days.length, 30);
    assert.equal(stats.days.at(-1).total, 2);
    assert.deepEqual(Object.keys(stats.days.at(-1)).sort(), ['date', 'pages', 'total']);
  });
  await t.test('D1/R2 survive a Worker restart and logout revokes the persisted session', async () => {
    const before = await (await api({ action: 'page', page: 'index.html' })).json();
    await f.restart();
    const after = await (await api({ action: 'page', page: 'index.html' })).json();
    assert.equal(after.etag, before.etag);
    assert.deepEqual(after.content, before.content);
    assert.equal((await f.request(uploaded.src)).status, 200);
    assert.equal((await (await api('stats')).json()).days.at(-1).total, 2);
    assert.equal((await api('logout', {})).status, 200);
    assert.equal((await api('pages')).status, 401);
  });
});

test('Cloudflare storage: atomic D1 writes, R2 metadata, prefixes, deletion and expiry', async t => {
  const { createStore } = await import('../cloudflare/store.mjs');
  const { atomicUpdate } = await import('../server/model.mjs');
  const mf = new Miniflare({
    modules: true, script: 'export default { fetch() { return new Response("storage test"); } };',
    compatibilityDate: '2026-07-30', cf: false,
    d1Databases: { DB: 'store-test' }, r2Buckets: { MEDIA: 'store-photo-test' },
  });
  t.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');
  for (const statement of (await readFile(resolve(root, 'cloudflare/schema.sql'), 'utf8')).replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)) await DB.prepare(statement).run();
  const store = createStore({ DB, MEDIA: await mf.getR2Bucket('MEDIA') });
  await t.test('new and matching-etag writes permit exactly one winner', async () => {
    const results = await Promise.all([1, 2].map(n => store.setJSON('pages/index.html', { n }, { onlyIfNew: true })));
    assert.equal(results.filter(r => r.modified).length, 1);
    const first = await store.getWithMetadata('pages/index.html', { type: 'json' });
    const next = await Promise.all([3, 4].map(n => store.setJSON('pages/index.html', { n }, { onlyIfMatch: first.etag })));
    assert.equal(next.filter(r => r.modified).length, 1);
    assert.equal((await store.setJSON('pages/index.html', {}, { onlyIfMatch: 'invalid-etag' })).modified, false);
    assert.notEqual((await store.getMetadata('pages/index.html')).etag, first.etag);
    await Promise.all(Array.from({ length: 5 }, () => atomicUpdate(store, 'stats/concurrent', old => ({ n: (old?.n ?? 0) + 1 }))));
    assert.equal((await store.get('stats/concurrent', { type: 'json' })).n, 5);
  });
  await t.test('bulk reads cross the 90-key boundary without one query per page', async () => {
    const keys = Array.from({length: 105}, (_, n) => 'pages/batch-' + n);
    await DB.batch(keys.map((key, n) => DB.prepare('INSERT INTO ab_records (key,data,metadata,etag) VALUES (?,?,?,?)').bind(key, JSON.stringify({n}), '{}', 'etag-' + n)));
    let queries = 0;
    const batched = createStore({DB: {prepare(sql) { queries++; return DB.prepare(sql); }}, MEDIA: await mf.getR2Bucket('MEDIA')});
    const result = await batched.getMany([...keys, 'pages/not-found'], {type: 'json'});
    assert.equal(result.size, 105);
    assert.equal(queries, 2);
    assert.deepEqual(result.get('pages/batch-104').data, {n: 104});
    assert.equal(result.get('pages/batch-104').etag, 'etag-104');
    assert.equal(result.has('pages/not-found'), false);
    assert.equal((await batched.getMany([])).size, 0);
    assert.equal(queries, 2);
  });
  await t.test('R2 conditional writes preserve photo bytes and metadata', async () => {
    const key = 'photo/12345678-1234-4234-8234-123456789abc';
    const bytes = new Uint8Array([82, 73, 70, 70, 1]);
    const metadata = { name: 'Project één.webp', at: '2026-11-01T00:00:00.000Z', type: 'image/webp' };
    const write = await store.set(key, bytes, { metadata, onlyIfNew: true });
    assert.equal(write.modified, true);
    assert.equal((await store.set(key, new Uint8Array([0]), { onlyIfNew: true })).modified, false);
    assert.equal((await store.set(key, new Uint8Array([0]), { onlyIfMatch: 'wrong-etag' })).modified, false);
    const saved = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    assert.deepEqual(new Uint8Array(saved.data), bytes);
    assert.deepEqual(saved.metadata, metadata);
    assert.deepEqual((await store.getMetadata(key)).metadata, metadata);
    assert.deepEqual((await store.list({ prefix: 'photo/' })).blobs.map(b => b.key), [key]);
    assert.ok((await store.list()).blobs.some(b => b.key === key));
    await store.delete(key);
    assert.equal(await store.get(key, { type: 'arrayBuffer' }), null);
    assert.equal(await store.getMetadata(key), null);
  });
  await t.test('imported R2 sidecars preserve metadata and native metadata takes priority', async () => {
    const bucket = await mf.getR2Bucket('MEDIA');
    const id = '22345678-1234-4234-8234-123456789abc';
    const key = 'photo/' + id;
    const sidecar = 'meta/' + id + '.json';
    const bytes = new Uint8Array([1, 2, 3]);
    const imported = { name: 'Imported photo.webp', at: '2026-10-01T00:00:00.000Z', type: 'image/webp' };
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
    await bucket.put(sidecar, JSON.stringify(imported));
    await bucket.put('meta/index.json', JSON.stringify({[key]: imported}));
    assert.deepEqual((await store.list({prefix: 'photo/'})).blobs.find(b => b.key === key).metadata, imported);
    assert.deepEqual((await store.getMetadata(key)).metadata, imported);
    assert.deepEqual((await store.getWithMetadata(key, { type: 'arrayBuffer' })).metadata, imported);
    await store.set(key, bytes, { metadata: { name: 'Native photo.webp' } });
    assert.deepEqual((await store.getMetadata(key)).metadata, { name: 'Native photo.webp' });
    assert.deepEqual((await store.list({prefix: 'photo/'})).blobs.find(b => b.key === key).metadata, {name: 'Native photo.webp'});
    await store.delete(key);
    assert.equal(await bucket.head(sidecar), null);
    await bucket.put(key, bytes);
    await bucket.put(sidecar, 'x'.repeat(1501));
    await assert.rejects(() => store.getMetadata(key), /metadata/i);
    await store.delete(key);
  });
  await t.test('invalid keys and oversized values never create records', async () => {
    for (const key of ['pages/../../secret', '/pages/index.html', 'secrets/password', 'photo/not-a-uuid']) {
      await assert.rejects(() => store.setJSON(key, {}), /sleutel|foto/);
    }
    await assert.rejects(() => store.setJSON('pages/oversize', { value: 'x'.repeat(1_800_001) }), error => error.status === 413);
    await assert.rejects(() => store.setJSON('pages/invalid-options', {}, { onlyIfNew: true, onlyIfMatch: 'etag' }));
    assert.equal(await store.get('pages/oversize'), null);
  });
  await t.test('expiry cleanup removes sessions and rate limits, never pages', async () => {
    await store.setJSON('session/expired', { expires: 1000 });
    await store.setJSON('session/current', { expires: Date.now() + 86400000 });
    await store.setJSON('limit/login/expired', { bucket: 1, count: 1 });
    await store.cleanupExpired();
    assert.equal(await store.get('session/expired'), null);
    assert.equal(await store.get('limit/login/expired'), null);
    assert.ok(await store.get('session/current'));
    assert.ok(await store.get('pages/index.html'));
  });
});
