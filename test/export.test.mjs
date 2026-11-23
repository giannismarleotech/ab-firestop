import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSnapshot} from '../scripts/export-netlify.mjs';

function store(change = false) {
  const data = new Map([
    ['pages/index.html', {etag: 'a', data: {content: {values: {'text-0': 'Gewijzigd'}, extras: []}, history: []}}],
    ['photo/example', {etag: 'b', data: Uint8Array.of(1, 2, 3).buffer, metadata: {name: 'foto.webp'}}],
    ['stats/2026-11-20', {etag: 'c', data: {total: 1, pages: {'index.html': 1}}}],
    ['session/private', {etag: 'secret', data: {csrf: 'secret'}}]
  ]);
  return {
    async *list({prefix}) { // Multiple result pages test pagination.
      for (const key of data.keys()) if (key.startsWith(prefix)) yield {blobs: [{key}]};
    },
    async getWithMetadata(key) { return data.get(key); },
    async getMetadata(key) { return {etag: change ? 'changed' : data.get(key).etag}; }
  };
}
test('backup exports content, binary photos and stats but never sessions', async () => {
  const backup = await exportSnapshot(store());
  assert.equal(backup.format, 'ab-firestop-backup');
  assert.equal(backup.version, 1);
  assert.equal(backup.records.length, 3);
  assert.equal(backup.records.find(r => r.key.startsWith('photo/')).data, 'AQID');
  assert.equal(backup.records.find(r => r.key.startsWith('pages/')).data.content.values['text-0'], 'Gewijzigd');
  assert.ok(!JSON.stringify(backup).includes('secret'));
});
test('backup aborts if a page or photo changes during export', async () => {
  await assert.rejects(exportSnapshot(store(true)), /wijzigde tijdens de export/);
});
