/**
 * 08-inspect-wp.mjs — examine working_pictures image payloads row-by-row
 * (small queries avoid the statement timeout) on BOTH old and new backends.
 */
import { OLD, NEW, anonHeaders, secretHeaders } from './lib/creds.mjs';

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers });
  return { status: r.status, json: await r.json().catch(() => null) };
}

for (const [label, urlBase, hdrs] of [['OLD', OLD.url, anonHeaders(OLD.url, OLD.anon)], ['NEW', NEW.url, anonHeaders(NEW.url, NEW.anon)]]) {
  console.log('=== ' + label + ' working_pictures ===');
  const ids = await fetchJson(`${urlBase}/rest/v1/working_pictures?select=id&order=created_at.asc&limit=70`, hdrs);
  if (ids.status !== 200) { console.log('id list HTTP', ids.status, JSON.stringify(ids.json).slice(0, 120)); continue; }
  console.log('rows:', ids.json.length);
  let dataUrls = 0, onspaceUrls = 0, otherUrls = 0, empty = 0, errRows = 0;
  const samples = [];
  for (const { id } of ids.json) {
    const row = await fetchJson(`${urlBase}/rest/v1/working_pictures?select=images,thumbnail&id=eq.${id}`, hdrs);
    if (row.status !== 200 || !row.json?.length) { errRows++; continue; }
    const imgs = row.json[0].images || [];
    for (const u of imgs) {
      const s = String(u);
      if (s.startsWith('data:')) { dataUrls++; if (samples.length < 2) samples.push({ id, kind: 'base64', len: s.length }); }
      else if (s.includes('onspace.ai')) { onspaceUrls++; if (samples.length < 4) samples.push({ id, kind: 'onspace-url', url: s.slice(0, 110) }); }
      else { otherUrls++; }
    }
    if (imgs.length === 0) empty++;
  }
  console.log(`image entries -> base64: ${dataUrls}, onspace URLs: ${onspaceUrls}, other URLs: ${otherUrls}; rows with no images: ${empty}; row read errors: ${errRows}`);
  for (const s of samples) console.log(' sample:', JSON.stringify(s));
}
