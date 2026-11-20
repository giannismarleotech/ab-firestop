import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, stat, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {validateBackup, createImportPlan, makeImportSQL} from '../scripts/import-cloudflare.mjs';

const schema = await readFile(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8');
const id = 'fb7bc754-0da4-487d-888c-c6ff23d2859c';
const media = '/.netlify/functions/media?id=' + id;
const templates = {'index.html': {fields: {
  'text-0': {type: 'text', value: 'Origineel', area: 'Pagina-inhoud'},
  'image-1': {type: 'image', value: 'assets/example.webp', alt: 'Project', area: 'Foto’s'},
}}};
const photo = await sharp({create: {width: 16, height: 16, channels: 3, background: '#ee0000'}}).webp().toBuffer();
function fixture() {
  return {format: 'ab-firestop-backup', version: 1, exportedAt: '2026-11-20T12:00:00.000Z', records: [
    {key: 'pages/index.html', encoding: 'json', metadata: {}, data: {
      content: {values: {'text-0': "O'Brien & brandveiligheid 🔥", 'image-1': media, 'image-1-alt': 'Project'}, extras: []},
      user: 'info@abfirestop.be', updatedAt: '2026-11-20T11:00:00.000Z', history: [{id, at: null, user: 'Originele website', content: {values: {'text-0': 'Origineel', 'image-1': 'assets/example.webp', 'image-1-alt': 'Project'}, extras: []}}],
    }},
    {key: 'stats/2026-11-20', encoding: 'json', metadata: {}, data: {total: 3, pages: {'index.html': 3}}},
    {key: 'photo/' + id, encoding: 'base64', data: photo.toString('base64'), metadata: {name: 'project $(do-not-execute).webp', at: '2026-11-20T10:00:00.000Z', type: 'image/webp'}},
  ]};
}

test('offline import preserves page content, history, numbers and photo metadata', async () => {
  const input = fixture(), checked = await validateBackup(input, templates);
  assert.deepEqual(checked.jsonRecords[0].data, input.records[0].data);
  assert.deepEqual(checked.jsonRecords[1].data, input.records[1].data);
  assert.deepEqual(checked.photos[0].buffer, photo);
  assert.deepEqual(checked.photos[0].metadata, input.records[2].metadata);
});

test('import refuses sessions, duplicate keys, mismatched templates and invalid totals', async () => {
  const unknown = fixture(); unknown.records.push({key: 'session/secret', encoding: 'json', data: {secret: 'not-importable'}});
  await assert.rejects(validateBackup(unknown, templates), /niet-toegestane/);
  const duplicate = fixture(); duplicate.records.push(duplicate.records[0]);
  await assert.rejects(validateBackup(duplicate, templates), /dubbele/);
  const mismatch = fixture(); mismatch.records[0].data.content.values['text-999'] = 'unmatched';
  await assert.rejects(validateBackup(mismatch, templates), /websiteversie/);
  const stats = fixture(); stats.records[1].data.total = 10;
  await assert.rejects(validateBackup(stats, templates), /niet overeen/);
});

test('import refuses absent historical photos and malformed image bytes', async () => {
  const missing = fixture(); missing.records[0].data.content.values['image-1'] = 'assets/example.webp';
  missing.records[0].data.history[0].content.extras.push({src: media, alt: 'Oud project'});
  missing.records.pop();
  await assert.rejects(validateBackup(missing, templates), /ontbreekt/);
  const corrupt = fixture(); corrupt.records[2].data = Buffer.from('not-an-image').toString('base64');
  await assert.rejects(validateBackup(corrupt, templates), /WebP/);
  const encoded = fixture(); encoded.records[2].data += '\n';
  await assert.rejects(validateBackup(encoded, templates), /beschadigd/);
});

test('SQL restores long Unicode revision history within D1 statement limits', async () => {
  const input = fixture();
  input.records[0].data.history = Array.from({length: 20}, (_, i) => ({
    id, at: '2026-11-19T12:00:00.000Z', user: 'info@abfirestop.be',
    content: {values: {'text-0': "🔥 O'Brien ".repeat(1000) + i, 'image-1': media, 'image-1-alt': 'Foto'}, extras: []},
  }));
  const checked = await validateBackup(input, templates), sql = makeImportSQL(checked.jsonRecords, schema);
  assert.ok(sql.split('\n').every(line => Buffer.byteLength(line) < 100_000));
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('BEGIN;\n' + sql + '\nCOMMIT;');
    const row = db.prepare('SELECT * FROM ab_records WHERE key=?').get('pages/index.html');
    assert.deepEqual(JSON.parse(row.data), input.records[0].data);
    assert.equal(row.expires_at, null);
    assert.match(row.etag, /^[a-f0-9-]{36}$/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name LIKE '_ab_import_%'").get().n, 0);
  } finally { db.close(); }
});

test('SQL import refuses a non-empty destination without replacing its content', async () => {
  const db = new DatabaseSync(':memory:');
  const checked = await validateBackup(fixture(), templates);
  try {
    db.exec(schema);
    db.prepare('INSERT INTO ab_records VALUES (?, ?, ?, ?, NULL)').run('pages/index.html', '{"original":"keep"}', '{}', 'keep-etag');
    db.exec('BEGIN;');
    assert.throws(() => db.exec(makeImportSQL(checked.jsonRecords, schema)), /CHECK constraint/);
    db.exec('ROLLBACK;');
    assert.deepEqual({...db.prepare('SELECT data, etag FROM ab_records').get()}, {data: '{"original":"keep"}', etag: 'keep-etag'});
  } finally { db.close(); }
});

test('plan creates private WebP, sidecars, index and commands without executing them', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ab-cf-import-'));
  const output = join(temporary, 'plan');
  try {
    const result = await createImportPlan(fixture(), {templates, schema, output});
    assert.deepEqual({pages: result.pages, photos: result.photos, statisticsDays: result.statisticsDays}, {pages: 1, photos: 1, statisticsDays: 1});
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json')));
    assert.equal(manifest.objects.length, 3);
    assert.deepEqual(await readFile(join(output, `photo/${id}.webp`)), photo);
    const metadata = JSON.parse(await readFile(join(output, `meta/${id}.json`)));
    assert.equal(metadata.name, fixture().records[2].metadata.name);
    const index = JSON.parse(await readFile(join(output, 'meta/index.json')));
    assert.deepEqual(index['photo/' + id], metadata);
    const commands = await readFile(join(output, 'UPLOAD-COMMANDS.txt'), 'utf8');
    assert.ok(!commands.includes('do-not-execute'));
    assert.match(commands, /--remote/);
    assert.match(commands, /meta\/index\.json/);
    assert.equal((await stat(join(output, 'content.sql'))).mode & 0o777, 0o600);
    assert.equal((await stat(output)).mode & 0o777, 0o700);
    await assert.rejects(createImportPlan(fixture(), {templates, schema, output}), /EEXIST/);
    assert.ok((await readdir(output)).includes('LEESMIJ.md'));
  } finally { await rm(temporary, {recursive: true, force: true}); }
});
