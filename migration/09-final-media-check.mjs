/**
 * 09-final-media-check.mjs — verify NO Base64 remains in any media table
 * on the NEW project, and that all image URLs now point at the new host.
 */
import { NEW, anonHeaders } from './lib/creds.mjs';

const TABLES = [
  ['products', 'images'],
  ['kitan_documents', 'preview_images'],
  ['working_pictures', 'images'],
  ['formats', 'preview_images'],
  ['website_products', 'preview_images'],
];

for (const [table, col] of TABLES) {
  let base64 = 0, newHost = 0, oldHost = 0, other = 0, emptyRows = 0;
  let offset = 0;
  for (;;) {
    const r = await fetch(`${NEW.url}/rest/v1/${table}?select=id,${col}&order=created_at.asc&limit=25&offset=${offset}`, { headers: anonHeaders(NEW.url, NEW.anon) });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const urls = row[col] || [];
      if (!urls.length) { emptyRows++; continue; }
      for (const u of urls) {
        const s = String(u);
        if (s.startsWith('data:')) base64++;
        else if (s.includes('.supabase.co')) newHost++;
        else if (s.includes('onspace.ai')) oldHost++;
        else other++;
      }
    }
    if (rows.length < 25) break;
    offset += 25;
  }
  const status = base64 === 0 ? 'CLEAN' : 'HAS BASE64!';
  console.log(status.padEnd(12), table.padEnd(18), 'base64=' + base64, 'supabase=' + newHost, 'onspace=' + oldHost, 'other=' + other, 'empty=' + emptyRows);
}

// thumbnails too (should be new-host URLs now)
for (const [table] of TABLES) {
  const r = await fetch(`${NEW.url}/rest/v1/${table}?select=thumbnail&limit=200`, { headers: anonHeaders(NEW.url, NEW.anon) });
  const rows = await r.json();
  let dataT = 0, okT = 0, nullT = 0, onspaceT = 0;
  for (const row of rows || []) {
    const t = row.thumbnail;
    if (!t) nullT++;
    else if (String(t).startsWith('data:')) dataT++;
    else if (String(t).includes('onspace.ai')) onspaceT++;
    else okT++;
  }
  console.log('thumbnails '.padEnd(12), table.padEnd(18), 'url=' + okT, 'base64=' + dataT, 'onspace=' + onspaceT, 'null=' + nullT);
}
