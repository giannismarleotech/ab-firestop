// Storage contract used by the existing CMS model and authentication code.
// Each JSON mutation is ONE conditional D1 statement. No read-then-write lock
// in a Worker isolate: concurrent requests can safely reject stale etags.
// Photos use R2 directly, so a successful upload never depends on a second
// non-transactional D1 write. Keep the bucket private; the media handler serves it.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const JSON_LIMIT = 1_800_000; // Below D1's 2 MB per-row/string limit.
const PHOTO_LIMIT = 8 * 1024 * 1024;
const PHOTO_KEY = /^photo\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const JSON_KEY = /^(?:pages|stats|session|limit)\/[a-zA-Z0-9][a-zA-Z0-9._/-]{0,511}$/;
const error = (message, status = 400) => Object.assign(new Error(message), { status });

function keyType(key) {
  if (typeof key !== 'string' || key.split('/').some(part => part === '.' || part === '..')) throw error('Ongeldige opslagsleutel.');
  if (PHOTO_KEY.test(key)) return 'photo';
  if (JSON_KEY.test(key)) return 'json';
  throw error('Ongeldige opslagsleutel.');
}
function optionsForWrite(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw error('Ongeldige opslagopties.');
  if (options.onlyIfNew && options.onlyIfMatch !== undefined) throw error('Gebruik één opslagvoorwaarde.');
  if (options.onlyIfMatch !== undefined && (typeof options.onlyIfMatch !== 'string' || !options.onlyIfMatch)) throw error('Ongeldige versie.');
  return options;
}
function metadataJSON(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw error('Ongeldige fotogegevens.');
  const json = JSON.stringify(metadata);
  if (encoder.encode(json).byteLength > 1500) throw error('De fotogegevens zijn te lang.', 413);
  return json;
}
function expiration(key, value) {
  if (key.startsWith('session/') && Number.isSafeInteger(value?.expires)) return value.expires;
  if (key.startsWith('limit/') && Number.isSafeInteger(value?.bucket)) return (value.bucket + 1) * 900000;
  return null;
}
function decodeValue(text, type = 'text') {
  if (type === 'json') return JSON.parse(text);
  if (type === 'text') return text;
  if (type === 'arrayBuffer') return encoder.encode(text).buffer;
  if (type === 'blob') return new Blob([text]);
  if (type === 'stream') return new Blob([text]).stream();
  throw error('Onbekend opslagformaat.');
}
async function photoMetadata(object, bucket, key) {
  let raw = object.customMetadata?.abMetadata;
  // A migration via `wrangler r2 object put` cannot set customMetadata. Private
  // sidecars preserve the original names/dates without changing photo URLs.
  if (!raw) {
    const sidecar = await bucket.get('meta/' + key.slice(6) + '.json');
    if (!sidecar) return {};
    if (sidecar.size > 1500) throw new Error('Invalid photo metadata size.');
    raw = await sidecar.text();
  }
  const metadata = JSON.parse(raw);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid photo metadata.');
  return metadata;
}

export function createStore(env) {
  if (!env?.DB?.prepare || !env?.MEDIA?.put || !env.MEDIA.get || !env.MEDIA.list) {
    throw error('Koppel eerst de D1-database DB en de R2-fotobibliotheek MEDIA in Cloudflare.', 503);
  }
  const { DB, MEDIA } = env;
  const store = {
    async getWithMetadata(key, { type = 'text' } = {}) {
      if (keyType(key) === 'photo') {
        const object = await MEDIA.get(key);
        if (!object) return null;
        let data;
        if (type === 'arrayBuffer') data = await object.arrayBuffer();
        else if (type === 'text') data = await object.text();
        else if (type === 'json') data = await object.json();
        else if (type === 'blob') data = new Blob([await object.arrayBuffer()], { type: object.httpMetadata?.contentType });
        else if (type === 'stream') data = object.body;
        else throw error('Onbekend opslagformaat.');
        return { data, etag: object.etag, metadata: await photoMetadata(object, MEDIA, key) };
      }
      const row = await DB.prepare('SELECT data, metadata, etag FROM ab_records WHERE key = ?').bind(key).first();
      if (!row) return null;
      return { data: decodeValue(row.data, type), etag: row.etag, metadata: JSON.parse(row.metadata) };
    },
    async get(key, options) {
      return (await store.getWithMetadata(key, options))?.data ?? null;
    },
    async getMany(keys, { type = 'json' } = {}) {
      if (!Array.isArray(keys) || keys.length > 10000) throw error('Ongeldige opslagsleutels.');
      const unique = [...new Set(keys)];
      for (const key of unique) if (keyType(key) !== 'json') throw error('Gebruik get voor afbeeldingsbestanden.');
      const entries = new Map();
      // D1 has a 100-bound-parameter limit. Sixty pages and thirty daily counts
      // each fit in a single query, also on the Free plan's per-request quota.
      for (let offset = 0; offset < unique.length; offset += 90) {
        const batch = unique.slice(offset, offset + 90);
        const result = await DB.prepare(`SELECT key, data, metadata, etag FROM ab_records WHERE key IN (${batch.map(() => '?').join(',')})`).bind(...batch).all();
        for (const row of result.results) entries.set(row.key, { data: decodeValue(row.data, type), etag: row.etag, metadata: JSON.parse(row.metadata) });
      }
      return entries;
    },
    async getMetadata(key) {
      if (keyType(key) === 'photo') {
        const object = await MEDIA.head(key);
        return object ? { etag: object.etag, metadata: await photoMetadata(object, MEDIA, key) } : null;
      }
      const row = await DB.prepare('SELECT metadata, etag FROM ab_records WHERE key = ?').bind(key).first();
      return row ? { etag: row.etag, metadata: JSON.parse(row.metadata) } : null;
    },
    async setJSON(key, value, suppliedOptions = {}) {
      if (keyType(key) !== 'json') throw error('Bewaar foto’s als afbeeldingsbestand.');
      const options = optionsForWrite(suppliedOptions);
      const data = JSON.stringify(value);
      if (typeof data !== 'string') throw error('Ongeldige inhoud.');
      const metadata = metadataJSON(options.metadata);
      if (encoder.encode(data).byteLength + encoder.encode(metadata).byteLength > JSON_LIMIT) {
        throw error('De opgeslagen inhoud inclusief versiegeschiedenis is te groot voor één pagina.', 413);
      }
      const etag = crypto.randomUUID();
      const expires = expiration(key, value);
      let statement;
      if (options.onlyIfMatch !== undefined) {
        statement = DB.prepare('UPDATE ab_records SET data = ?, metadata = ?, etag = ?, expires_at = ? WHERE key = ? AND etag = ? RETURNING etag')
          .bind(data, metadata, etag, expires, key, options.onlyIfMatch);
      } else if (options.onlyIfNew) {
        statement = DB.prepare('INSERT INTO ab_records (key, data, metadata, etag, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING RETURNING etag')
          .bind(key, data, metadata, etag, expires);
      } else {
        statement = DB.prepare('INSERT INTO ab_records (key, data, metadata, etag, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, metadata = excluded.metadata, etag = excluded.etag, expires_at = excluded.expires_at RETURNING etag')
          .bind(key, data, metadata, etag, expires);
      }
      const result = await statement.first();
      return result ? { modified: true, etag: result.etag } : { modified: false };
    },
    async set(key, value, suppliedOptions = {}) {
      if (keyType(key) !== 'photo') {
        const text = typeof value === 'string' ? value : decoder.decode(value);
        return store.setJSON(key, JSON.parse(text), suppliedOptions);
      }
      const options = optionsForWrite(suppliedOptions);
      let bytes;
      if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
      else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      else if (value instanceof Blob) {
        if (value.size > PHOTO_LIMIT) throw error('Het afbeeldingsbestand is te groot.', 413);
        bytes = new Uint8Array(await value.arrayBuffer());
      } else throw error('Ongeldig afbeeldingsbestand.');
      if (!bytes.byteLength || bytes.byteLength > PHOTO_LIMIT) throw error('Het afbeeldingsbestand is te groot.', 413);
      const params = {
        httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
        customMetadata: { abMetadata: metadataJSON(options.metadata) },
      };
      if (options.onlyIfNew) params.onlyIf = { etagDoesNotMatch: '*' };
      else if (options.onlyIfMatch !== undefined) params.onlyIf = { etagMatches: options.onlyIfMatch };
      const result = await MEDIA.put(key, bytes, params);
      return result ? { modified: true, etag: result.etag } : { modified: false };
    },
    async delete(key) {
      if (keyType(key) === 'photo') await MEDIA.delete([key, 'meta/' + key.slice(6) + '.json']);
      else await DB.prepare('DELETE FROM ab_records WHERE key = ?').bind(key).run();
    },
    async list({ prefix = '' } = {}) {
      if (typeof prefix !== 'string' || prefix.length > 512 || prefix.includes('\0')) throw error('Ongeldige opslagfilter.');
      const blobs = [];
      if (!prefix.startsWith('photo/')) {
        let after = '';
        while (true) {
          const result = await DB.prepare('SELECT key, etag FROM ab_records WHERE substr(key, 1, ?) = ? AND key > ? ORDER BY key LIMIT 1000')
            .bind(prefix.length, prefix, after).all();
          for (const row of result.results) blobs.push({ key: row.key, etag: row.etag });
          if (result.results.length < 1000) break;
          after = result.results.at(-1).key;
        }
      }
      if (prefix.startsWith('photo/') || 'photo/'.startsWith(prefix)) {
        let cursor;
        do {
          const result = await MEDIA.list({ prefix: prefix.startsWith('photo/') ? prefix : 'photo/', limit: 1000, include: ['customMetadata'], ...(cursor ? { cursor } : {}) });
          for (const object of result.objects) {
            const blob = { key: object.key, etag: object.etag };
            if (object.customMetadata?.abMetadata) blob.metadata = await photoMetadata(object, MEDIA, object.key);
            blobs.push(blob);
          }
          cursor = result.truncated ? result.cursor : undefined;
          if (result.truncated && !cursor) throw new Error('R2 returned a truncated listing without a cursor.');
        } while (cursor);
        const imported = blobs.filter(blob => blob.key.startsWith('photo/') && !Object.hasOwn(blob, 'metadata'));
        if (imported.length) {
          // Migration uploads one aggregate index as well as individual sidecars.
          // Reading it once keeps large photo libraries within Worker subrequest
          // limits; direct image reads still use the individual private sidecar.
          const object = await MEDIA.get('meta/index.json');
          if (object && object.size > 5 * 1024 * 1024) throw new Error('Photo metadata index is too large.');
          const index = object ? await object.json() : {};
          if (!index || typeof index !== 'object' || Array.isArray(index)) throw new Error('Invalid photo metadata index.');
          for (const blob of imported) {
            const metadata = index[blob.key] ?? {};
            metadataJSON(metadata);
            blob.metadata = metadata;
          }
        }
      }
      blobs.sort((a, b) => a.key.localeCompare(b.key));
      return { blobs };
    },
    // Optional maintenance from a scheduled Worker; never removes site content.
    async cleanupExpired(now = Date.now()) {
      if (!Number.isSafeInteger(now)) throw error('Ongeldig tijdstip.');
      return DB.prepare("DELETE FROM ab_records WHERE key IN (SELECT key FROM ab_records WHERE expires_at <= ? AND (key LIKE 'session/%' OR key LIKE 'limit/%') LIMIT 1000)").bind(now).run();
    },
  };
  return store;
}
