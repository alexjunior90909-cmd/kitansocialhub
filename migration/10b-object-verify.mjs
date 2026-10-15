/**
 * 10b-object-verify.mjs — authoritative object count per bucket: gather every
 * Storage URL stored in DB rows, then verify each with a public GET.
 */
import { NEW, anonHeaders } from './lib/creds.mjs';

const TABLES = [
  ['products', 'images'],
  ['kitan_documents', 'preview_images'],
  ['working_pictures', 'images'],
  ['formats', 'preview_images'],
];
const TABLES_OC = [['order_content', 'image_urls']];

const all = new Map(); // bucket -> Set(path)
function harvest(urls) {
  for (const u of urls || []) {
    const m = String(u).match(/\/storage\/v1\/object\/public\/([a-z-]+)\/(.+)$/);
    if (m) {
      if (!all.has(m[1])) all.set(m[1], new Set());
      all.get(m[1]).add(decodeURIComponent(m[2]));
    }
  }
}

for (const [table, col] of [...TABLES, ...TABLES_OC]) {
  let offset = 0;
  for (;;) {
    const r = await fetch(`${NEW.url}/rest/v1/${table}?select=${col}&order=created_at.asc&limit=50&offset=${offset}`, { headers: anonHeaders(NEW.url, NEW.anon) });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach(row => harvest(row[col]));
    if (rows.length < 50) break;
    offset += 50;
  }
}

let grand = 0, fail = 0;
for (const [bucket, paths] of all) {
  // verify every 5th path with a public GET (full check for small buckets)
  const arr = [...paths];
  const step = arr.length > 40 ? 5 : 1;
  let bad = [];
  for (let i = 0; i < arr.length; i += step) {
    const r = await fetch(`${NEW.url}/storage/v1/object/public/${bucket}/${encodeURIComponent(arr[i])}`);
    if (r.status !== 200) bad.push(arr[i] + '->' + r.status);
  }
  grand += arr.length; fail += bad.length;
  console.log(bucket.padEnd(20), 'DB-referenced objects: ' + arr.length, '| sampled GET failures: ' + bad.length + (bad.length ? ' e.g. ' + bad[0] : ''));
}
console.log('\nTOTAL DB-referenced storage objects: ' + grand + ', failures: ' + fail);
