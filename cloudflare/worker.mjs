import templates from '../server/templates.json' with {type: 'json'};
import {createApi} from '../server/api.mjs';
import {settings, sameOrigin} from '../server/security.mjs';
import {body, errorResponse, json} from '../server/responses.mjs';
import {cleanPage, getPage, validateContent, atomicUpdate, fail} from '../server/model.mjs';
import {render} from '../server/render.mjs';
import {createStore} from './store.mjs';
import {processImage} from './images.mjs';

const adminCSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function headers(response, admin = false) {
  const h = new Headers(response.headers);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (admin) {
    h.set('Cache-Control', 'no-store'); h.set('X-Robots-Tag', 'noindex, nofollow');
    h.set('X-Frame-Options', 'DENY'); h.set('Content-Security-Policy', adminCSP);
  }
  return new Response(response.body, {status: response.status, headers: h});
}

export function resolvePage(url) {
  if (url.pathname === '/.netlify/functions/page') return cleanPage(url.searchParams.get('page'), templates);
  let path;
  try { path = decodeURIComponent(url.pathname).replace(/^\//, ''); } catch { fail(404, 'Pagina niet gevonden.'); }
  if (!path || path.endsWith('/')) path += 'index.html';
  for (const candidate of [path, path + '.html', path + '/index.html']) if (Object.hasOwn(templates, candidate)) return candidate;
  if (path.endsWith('/index.html')) return cleanPage(path.slice(0, -11) + '.html', templates);
  return cleanPage(path, templates);
}

async function boundedRequest(req) {
  if (!req.body) return req;
  const max = 5 * 1024 * 1024, reader = req.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); fail(413, 'De aanvraag is te groot.'); }
    chunks.push(value);
  }
  return new Request(req, {body: Buffer.concat(chunks), duplex: 'half'});
}

async function handle(req, env, ctx) {
  const url = new URL(req.url), path = url.pathname;
  const api = path.startsWith('/api/') || path.startsWith('/.netlify/functions/');
  if (api && !['GET', 'POST', 'HEAD'].includes(req.method)) fail(405, 'Deze methode is niet toegestaan.');
  if (path === '/api/admin' || path === '/.netlify/functions/api') {
    return createApi({templates, store: () => createStore(env), configFor: () => settings(env), processImage,
      mediaPath: '/api/media'})(await boundedRequest(req), {ip: req.headers.get('cf-connecting-ip') || 'unknown'});
  }
  if (path === '/api/health') {
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'GET vereist.');
    if (!env.DB || !env.MEDIA) return json({ready: false}, 503);
    await env.DB.prepare('SELECT key FROM ab_records LIMIT 1').all();
    await env.MEDIA.head('health-check');
    settings(env);
    return json({ready: true});
  }
  if (path === '/api/media' || path === '/.netlify/functions/media') {
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'GET vereist.');
    const id = url.searchParams.get('id');
    if (!/^[a-f0-9-]{36}$/.test(id || '')) fail(404, 'Niet gevonden.');
    const data = await createStore(env).get('photo/' + id, {type: 'arrayBuffer'});
    if (!data) fail(404, 'Niet gevonden.');
    return new Response(data, {headers: {'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable'}});
  }
  if (path === '/api/track' || path === '/.netlify/functions/track') {
    if (req.method !== 'POST') fail(405, 'POST vereist.'); sameOrigin(req);
    const data = await body(await boundedRequest(req), 300), page = cleanPage(data.page, templates);
    if (!/bot|crawler|spider|headless/i.test(req.headers.get('user-agent') || '')) {
      const day = new Date().toISOString().slice(0, 10);
      await atomicUpdate(createStore(env), 'stats/' + day, old => ({total: (old?.total || 0) + 1,
        pages: {...old?.pages, [page]: (old?.pages?.[page] || 0) + 1}}));
    }
    return new Response(null, {status: 204, headers: {'Cache-Control': 'no-store'}});
  }
  if (path === '/admin' || path === '/admin/') {
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'GET vereist.');
    if (path === '/admin') return new Response(null, {status: 308, headers: {Location: '/admin/'}});
    return env.ASSETS.fetch(req);
  }
  if (path.startsWith('/admin/') || path.startsWith('/assets/') || /^\/(?:favicon[^/]*|robots\.txt|sitemap\.xml)$/.test(path)) {
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'GET vereist.');
    return env.ASSETS.fetch(req);
  }
  if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'GET vereist.');
  const page = resolvePage(url);
  // An initial preview can render the original website before storage is attached.
  // Once a DB is attached, outages fail closed rather than showing stale content.
  const content = env.DB ? (await getPage(createStore(env), page, templates[page])).content : validateContent({}, templates[page]);
  return new Response(render(templates[page], content), {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}});
}

export default {
  async fetch(req, env, ctx) {
    let response;
    try { response = await handle(req, env, ctx); } catch (e) { response = errorResponse(e); }
    const path = new URL(req.url).pathname;
    response = headers(response, path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path === '/.netlify/functions/api');
    if (req.method === 'HEAD') return new Response(null, {status: response.status, headers: response.headers});
    return response;
  }
};
