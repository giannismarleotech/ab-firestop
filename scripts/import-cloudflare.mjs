import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {resolve, relative, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import sharp from 'sharp';
import {validateContent} from '../server/model.mjs';

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const photoKey = new RegExp('^photo/(' + UUID + ')$');
const photoURL = new RegExp('^/(?:\\.netlify/functions|api)/media\\?id=(' + UUID + ')$');
const maxBackupBytes = 128 * 1024 * 1024;
const maxJSONBytes = 1_800_000;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (condition, message) => { if (!condition) throw Error(message); };
const bytes = value => Buffer.byteLength(value, 'utf8');
const sqlText = value => "'" + String(value).replaceAll("'", "''") + "'";
const validDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));

function checkContent(content, template, referencedPhotos) {
  requireValue(isObject(content) && isObject(content.values), 'Een pagina bevat ongeldige tekstvelden.');
  const allowed = new Set(Object.keys(template.fields));
  for (const [id, field] of Object.entries(template.fields)) if (field.type === 'image') allowed.add(id + '-alt');
  requireValue(Object.keys(content.values).every(id => allowed.has(id)), 'Een pagina past niet bij deze websiteversie. Gebruik dezelfde broncode als bij de export.');
  // Use the application's own field limits and image URL allowlist. Do not remove
  // unknown fields silently: a mismatched template must stop the migration.
  const checked = validateContent(content, template);
  for (const value of Object.values(checked.values)) {
    const match = typeof value === 'string' && value.match(photoURL);
    if (match) referencedPhotos.add(match[1]);
  }
  for (const extra of checked.extras) referencedPhotos.add(extra.src.match(photoURL)[1]);
}

/** Validate the complete backup before writing any import files. Never contacts a service. */
export async function validateBackup(snapshot, templates) {
  requireValue(snapshot?.format === 'ab-firestop-backup' && snapshot.version === 1 && Array.isArray(snapshot.records), 'Dit is geen ondersteunde AB Firestop-back-up.');
  requireValue(snapshot.records.length <= 10_000, 'De back-up bevat te veel onderdelen.');
  const seen = new Set(), referencedPhotos = new Set(), photoIDs = new Set(), jsonRecords = [], photos = [];
  for (const record of snapshot.records) {
    requireValue(isObject(record) && typeof record.key === 'string' && !seen.has(record.key), 'Ongeldige of dubbele opslagsleutel in de back-up.');
    seen.add(record.key);
    const metadata = record.metadata ?? {};
    requireValue(isObject(metadata) && bytes(JSON.stringify(metadata)) <= 1500, 'Ongeldige of te lange metadata in de back-up.');
    const image = record.key.match(photoKey);
    if (image) {
      requireValue(record.encoding === 'base64' && typeof record.data === 'string', 'Een foto heeft een ongeldige codering.');
      const buffer = Buffer.from(record.data, 'base64');
      requireValue(buffer.length > 0 && buffer.length <= 8 * 1024 * 1024 && buffer.toString('base64') === record.data, 'Een foto is beschadigd of groter dan 8 MB.');
      let info;
      try { info = await sharp(buffer, {limitInputPixels: 25_000_000, animated: false}).metadata(); }
      catch { throw Error('Een foto is geen leesbaar WebP-bestand.'); }
      requireValue(info.format === 'webp' && info.width > 0 && info.height > 0 && (info.pages ?? 1) === 1, 'Alle geïmporteerde foto’s moeten gewone WebP-bestanden zijn.');
      requireValue(metadata.name === undefined || typeof metadata.name === 'string', 'Ongeldige fotonaam.');
      requireValue(metadata.at === undefined || validDate(metadata.at), 'Ongeldige uploaddatum.');
      requireValue(metadata.type === undefined || metadata.type === 'image/webp', 'Ongeldig afbeeldingsformaat in metadata.');
      photoIDs.add(image[1]);
      photos.push({key: record.key, id: image[1], buffer, metadata: structuredClone(metadata)});
      continue;
    }
    requireValue(record.encoding === 'json' && isObject(record.data), 'Alleen pagina’s, foto’s en dagstatistieken mogen worden geïmporteerd.');
    const data = record.data;
    if (record.key.startsWith('pages/')) {
      const page = record.key.slice(6), template = Object.hasOwn(templates, page) && templates[page];
      requireValue(template, 'De back-up verwijst naar een onbekende pagina.');
      requireValue(validDate(data.updatedAt) && typeof data.user === 'string' && data.user.length <= 320 && Array.isArray(data.history) && data.history.length <= 20, 'Ongeldige paginageschiedenis.');
      checkContent(data.content, template, referencedPhotos);
      for (const revision of data.history) {
        requireValue(isObject(revision) && typeof revision.id === 'string' && new RegExp('^' + UUID + '$').test(revision.id) && (revision.at === null || validDate(revision.at)) && typeof revision.user === 'string' && revision.user.length <= 320, 'Ongeldige eerdere paginaversie.');
        checkContent(revision.content, template, referencedPhotos);
      }
    } else if (/^stats\/\d{4}-\d\d-\d\d$/.test(record.key)) {
      const day = record.key.slice(6);
      requireValue(Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day, 'Ongeldige datum in de statistieken.');
      requireValue(Number.isSafeInteger(data.total) && data.total >= 0 && isObject(data.pages), 'Ongeldige bezoekcijfers.');
      let total = 0;
      for (const [page, count] of Object.entries(data.pages)) {
        requireValue(Object.hasOwn(templates, page) && Number.isSafeInteger(count) && count >= 0, 'Ongeldige paginacijfers.');
        total += count;
      }
      requireValue(Number.isSafeInteger(total) && total === data.total, 'De bezoekcijfers in de back-up komen niet overeen.');
    } else {
      throw Error('De back-up bevat niet-toegestane gegevens. Sessies en geheimen worden niet geïmporteerd.');
    }
    const serialized = JSON.stringify(data), serializedMetadata = JSON.stringify(metadata);
    requireValue(bytes(serialized) + bytes(serializedMetadata) <= maxJSONBytes, 'Een pagina inclusief geschiedenis is te groot voor Cloudflare D1.');
    jsonRecords.push({key: record.key, data: structuredClone(data), metadata: structuredClone(metadata)});
  }
  for (const id of referencedPhotos) requireValue(photoIDs.has(id), 'Een foto uit een pagina of eerdere versie ontbreekt in de back-up. Exporteer alle foto’s opnieuw.');
  requireValue(bytes(JSON.stringify(Object.fromEntries(photos.map(photo => [photo.key, photo.metadata])))) <= 5 * 1024 * 1024, 'De metadata-index van de fotobibliotheek is te groot.');
  return {jsonRecords, photos};
}

// Keep each SQL statement below D1's 100 KB limit, also for long revision histories.
function chunks(text, limit = 30_000) {
  const output = []; let current = '', size = 0;
  for (const char of text) {
    const length = bytes(char);
    if (size + length > limit) { output.push(current); current = ''; size = 0; }
    current += char; size += length;
  }
  if (current) output.push(current);
  return output;
}

export function makeImportSQL(records, schema) {
  const lines = [
    '-- PRIVATE: contains website edits and revision history. Do not commit.',
    '-- Import with Wrangler d1 execute --remote --file: its file import is transactional.',
    schema.trim(),
    '-- A non-empty target must fail instead of overwriting any existing content.',
    'CREATE TABLE _ab_import_guard (n INTEGER NOT NULL CHECK (n = 0));',
    'INSERT INTO _ab_import_guard SELECT COUNT(*) FROM ab_records;',
    'CREATE TABLE _ab_import_chunks (record_key TEXT NOT NULL, position INTEGER NOT NULL, part TEXT NOT NULL, PRIMARY KEY(record_key, position));',
  ];
  for (const record of records) {
    const key = sqlText(record.key);
    chunks(JSON.stringify(record.data)).forEach((part, position) => {
      lines.push(`INSERT INTO _ab_import_chunks VALUES (${key}, ${position}, CAST(X'${Buffer.from(part).toString('hex')}' AS TEXT));`);
    });
    const data = `(SELECT group_concat(part, '') FROM (SELECT part FROM _ab_import_chunks WHERE record_key = ${key} ORDER BY position))`;
    lines.push(`INSERT INTO ab_records (key, data, metadata, etag, expires_at) VALUES (${key}, ${data}, ${sqlText(JSON.stringify(record.metadata))}, '${randomUUID()}', NULL);`);
  }
  lines.push('DROP TABLE _ab_import_chunks;', 'DROP TABLE _ab_import_guard;', '');
  return lines.join('\n');
}

/** Create a new, private, offline migration plan. Existing folders are never replaced. */
export async function createImportPlan(snapshot, {templates, schema, output}) {
  const checked = await validateBackup(snapshot, templates);
  const directory = resolve(output);
  await mkdir(dirname(directory), {recursive: true, mode: 0o700});
  await mkdir(directory, {mode: 0o700}); // No recursive: refuse an existing plan.
  await mkdir(resolve(directory, 'photo'), {mode: 0o700});
  await mkdir(resolve(directory, 'meta'), {mode: 0o700});
  const writePrivate = (name, content) => writeFile(resolve(directory, name), content, {mode: 0o600, flag: 'wx'});
  const objects = [];
  for (const photo of checked.photos) {
    const filename = `photo/${photo.id}.webp`, metadataFile = `meta/${photo.id}.json`;
    const metadataBytes = Buffer.from(JSON.stringify(photo.metadata));
    await writePrivate(filename, photo.buffer);
    await writePrivate(metadataFile, metadataBytes);
    objects.push({key: photo.key, file: filename, contentType: 'image/webp', sha256: createHash('sha256').update(photo.buffer).digest('hex')});
    objects.push({key: `meta/${photo.id}.json`, file: metadataFile, contentType: 'application/json', sha256: createHash('sha256').update(metadataBytes).digest('hex')});
  }
  const photoIndex = Object.fromEntries(checked.photos.map(photo => [photo.key, photo.metadata]));
  const indexBytes = Buffer.from(JSON.stringify(photoIndex));
  await writePrivate('meta/index.json', indexBytes);
  objects.push({key: 'meta/index.json', file: 'meta/index.json', contentType: 'application/json', sha256: createHash('sha256').update(indexBytes).digest('hex')});
  await writePrivate('content.sql', makeImportSQL(checked.jsonRecords, schema));
  await writePrivate('manifest.json', JSON.stringify({format: 'ab-firestop-cloudflare-import', version: 1, generatedAt: new Date().toISOString(), sourceExportedAt: snapshot.exportedAt ?? null,
    pages: checked.jsonRecords.filter(r => r.key.startsWith('pages/')).length,
    statisticsDays: checked.jsonRecords.filter(r => r.key.startsWith('stats/')).length,
    photos: checked.photos.length, objects}, null, 2) + '\n');
  const commands = [];
  for (const object of objects) {
    // UUID-derived names only: backup titles, filenames and text never enter a command.
    commands.push(`npx --no-install wrangler r2 object put "$BUCKET/${object.key}" --remote --file="$PLAN/${object.file}" --content-type=${object.contentType}`);
  }
  await writePrivate('UPLOAD-COMMANDS.txt', commands.join('\n') + '\n');
  await writePrivate('LEESMIJ.md', `# Eenmalige inhoudsmigratie naar Cloudflare\n\nDit is alleen een lokaal importplan. Er is nog niets naar Cloudflare verstuurd. Houd de hele map privé en zet ze niet in GitHub.\n\n1. Maak een **nieuwe lege** D1-database en **nieuwe lege private** R2-bucket voor AB Firestop. Importeren in gebruikte opslag is niet toegestaan. Koppel ze nog niet aan een website waarop mensen kunnen bewerken.\n2. Controleer in Cloudflare dat beide leeg zijn. De SQL-import weigert bestaande D1-records. De R2-uploadcommando’s kunnen bestaande objecten overschrijven: gebruik ze uitsluitend op de nieuw aangemaakte lege bucket.\n3. Voer in de repository \`npx --no-install wrangler login\` uit. Gebruik het juiste Cloudflare-account. Stel in de terminal \`BUCKET\` in op de naam van de nieuwe bucket en \`PLAN\` op het absolute pad van deze map.\n4. Voer de opdrachten uit \`UPLOAD-COMMANDS.txt\` **één voor één** uit. Ga alleen verder na een geslaagde upload. Elke foto heeft ook een \`meta/<id>.json\`-bestand nodig; daarin staan de oorspronkelijke naam en uploaddatum. Upload ook het laatste bestand \`meta/index.json\`; daarmee opent de volledige fotobibliotheek snel.\n5. Voeg de nieuwe D1-database toe aan een lokale Wrangler-configuratie. Importeer daarna, vanuit de repository:\n\n\`\`\`sh\nnpx --no-install wrangler d1 execute DB --remote --config wrangler.local.jsonc --file="$PLAN/content.sql"\n\`\`\`\n\nGebruik een \`wrangler.local.jsonc\` met de binding \`DB\`, de juiste \`database_name\` en \`database_id\`. Deze configuratie is uitgesloten van Git. Upload alle foto’s en metadata voordat je deze SQL uitvoert. D1 voert bestandsimport transactioneel uit; bij een fout horen de bestaande databasegegevens behouden te blijven.\n\n6. Koppel de geïmporteerde database als \`DB\` en bucket als \`MEDIA\` aan de Cloudflare Pages-productieomgeving. Test teksten, foto’s, eerdere versies, paginaweergaven en een nieuwe opgeslagen wijziging op de Pages-test-URL.\n7. Bewaar de oorspronkelijke Netlify-back-up en laat Netlify beschikbaar totdat de migratie is gecontroleerd. Dit plan wijzigt geen domeinen, nameservers of mailinstellingen.\n\nBij een onderbroken foto-upload: gebruik een nieuwe lege bucket of controleer in Cloudflare welke geplande objecten al volledig zijn verstuurd. Voer geen willekeurige verwijderacties uit. Na een geslaagde D1-import mag dit plan niet opnieuw op dezelfde database worden toegepast.\n`);
  return {directory, pages: checked.jsonRecords.filter(r => r.key.startsWith('pages/')).length, statisticsDays: checked.jsonRecords.filter(r => r.key.startsWith('stats/')).length, photos: checked.photos.length};
}

async function main() {
  const [filename, ...args] = process.argv.slice(2);
  if (!filename || filename.startsWith('-') || args.some((arg, i) => i % 2 === 0 && arg !== '--output') || args.length % 2 || args.length > 2) {
    throw Error('Gebruik: npm run import:cloudflare -- BACKUP.json [--output .private-backups/import-cloudflare-DATUM]');
  }
  const source = resolve(filename);
  requireValue((await stat(source)).size <= maxBackupBytes, 'De back-up is groter dan 128 MB.');
  const output = args.length ? resolve(args[1]) : resolve('.private-backups', 'import-cloudflare-' + new Date().toISOString().replace(/[:.]/g, '-'));
  const privateRelative = relative(resolve('.private-backups'), output);
  requireValue(privateRelative && !privateRelative.startsWith('..') && !privateRelative.startsWith('/'), 'Sla importplannen op in een nieuwe submap van .private-backups.');
  const snapshot = JSON.parse(await readFile(source, 'utf8'));
  const templates = JSON.parse(await readFile(new URL('../server/templates.json', import.meta.url), 'utf8'));
  const schema = await readFile(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8');
  const plan = await createImportPlan(snapshot, {templates, schema, output});
  console.log(`Importplan gemaakt: ${plan.directory}\n${plan.pages} gewijzigde pagina’s, ${plan.photos} foto’s en ${plan.statisticsDays} dagen statistieken.\nEr is niets online gewijzigd. Volg LEESMIJ.md in deze privémappen.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof SyntaxError ? 'De back-up bevat ongeldige JSON.' : error.message); process.exitCode = 1; });
}
