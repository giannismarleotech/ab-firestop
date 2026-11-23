import {getStore} from '@netlify/blobs';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';

const prefixes = ['pages/', 'photo/', 'stats/'];
const maxBytes = 128 * 1024 * 1024;

async function keys(db) {
  const result = [];
  for (const prefix of prefixes) {
    for await (const page of db.list({prefix, paginate: true})) {
      for (const blob of page.blobs) result.push(blob.key);
    }
  }
  return result.sort();
}

// Export only website content. No login tokens, passwords or rate-limit data.
export async function exportSnapshot(db) {
  const names = await keys(db), records = [], versions = new Map();
  let bytes = 0;
  for (const key of names) {
    const photo = key.startsWith('photo/');
    const entry = await db.getWithMetadata(key, {type: photo ? 'arrayBuffer' : 'json'});
    if (!entry) throw Error('Inhoud wijzigde tijdens de export. Pauzeer het bewerken en probeer opnieuw.');
    const record = {key, encoding: photo ? 'base64' : 'json',
      data: photo ? Buffer.from(entry.data).toString('base64') : entry.data,
      metadata: entry.metadata ?? {}};
    bytes += Buffer.byteLength(JSON.stringify(record));
    if (bytes > maxBytes - 1024 * 1024) throw Error('De back-up is groter dan 127 MB. Laat de migratie in delen uitvoeren.');
    records.push(record);
    if (!key.startsWith('stats/')) versions.set(key, entry.etag);
  }
  // Statistics may keep increasing; page edits or uploads during export require a retry.
  for (const [key, etag] of versions) {
    if ((await db.getMetadata(key))?.etag !== etag) throw Error('Inhoud wijzigde tijdens de export. Pauzeer het bewerken en probeer opnieuw.');
  }
  const contentKeys = list => list.filter(key => !key.startsWith('stats/'));
  if (JSON.stringify(contentKeys(names)) !== JSON.stringify(contentKeys(await keys(db)))) {
    throw Error('Er zijn foto’s of pagina’s gewijzigd tijdens de export. Probeer opnieuw.');
  }
  return {format: 'ab-firestop-backup', version: 1, exportedAt: new Date().toISOString(), records};
}

function hiddenToken() {
  if (!process.stdin.isTTY) throw Error('Stel NETLIFY_AUTH_TOKEN in of gebruik een interactieve terminal.');
  process.stdout.write('Netlify persoonlijk toegangstoken (verborgen): ');
  return new Promise((resolveToken, reject) => {
    let value = '';
    process.stdin.setRawMode(true); process.stdin.resume();
    function finish(error) {
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', input);
      process.stdout.write('\n');
      error ? reject(error) : resolveToken(value);
    }
    function input(chunk) {
      for (const char of chunk.toString()) {
        if (char === '\u0003') return finish(Error('Afgebroken.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    }
    process.stdin.on('data', input);
  });
}

async function main() {
  let siteID = process.env.NETLIFY_SITE_ID;
  if (!siteID) {
    if (!process.stdin.isTTY) throw Error('NETLIFY_SITE_ID ontbreekt.');
    const rl = createInterface({input: process.stdin, output: process.stdout});
    siteID = (await rl.question('Netlify Project ID (bij Project configuration → General): ')).trim(); rl.close();
  }
  if (!/^[a-zA-Z0-9-]+$/.test(siteID)) throw Error('Ongeldig Project ID.');
  const token = process.env.NETLIFY_AUTH_TOKEN || await hiddenToken();
  if (!token) throw Error('Een Netlify-toegangstoken is vereist.');
  const db = getStore({name: 'ab-firestop-cms-v1', siteID, token, consistency: 'strong'});
  const snapshot = await exportSnapshot(db);
  const directory = resolve('.private-backups');
  await mkdir(directory, {recursive: true, mode: 0o700});
  const filename = resolve(directory, 'ab-firestop-' + snapshot.exportedAt.replace(/[:.]/g, '-') + '.json');
  await writeFile(filename, JSON.stringify(snapshot), {mode: 0o600, flag: 'wx'});
  console.log(`Back-up opgeslagen: ${filename}\n${snapshot.records.length} onderdelen. Houd dit bestand privé; upload het niet naar GitHub.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // SDK errors can include request details. Never print them or the access token.
    console.error('Export niet voltooid. Controleer Project ID/toegangstoken, pauzeer bewerkingen en probeer opnieuw. Er is geen brondata gewijzigd.');
    process.exitCode = 1;
  });
}
