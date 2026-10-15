/**
 * 01c-census.mjs — exact source row counts + order-content object enumeration.
 */
import { OLD, NEW, anonHeaders, secretHeaders, loadState, saveState } from './lib/creds.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. Exact row counts via Prefer: count=exact head requests ────────────────
const tables = loadState('source-tables', []);
const counts = {};
for (const t of tables) {
  let done = false;
  for (let attempt = 0; !done && attempt < 4; attempt++) {
    try {
      const r = await fetch(`${OLD.url}/rest/v1/${t}?select=*&limit=1`, {
        headers: { ...anonHeaders(OLD.url, OLD.anon), Prefer: 'count=exact' },
      });
      const cr = r.headers.get('content-range'); // "0-0/123" or "*/123"
      counts[t] = cr ? Number(cr.split('/')[1]) : (r.status === 200 ? 0 : 'ERR ' + r.status);
      done = true;
    } catch (e) {
      await sleep(2000 * (attempt + 1));
      if (attempt === 3) counts[t] = 'ERR ' + e.message;
    }
  }
  console.log(String(counts[t]).padStart(7), ' ', t);
}
saveState('source-counts', counts);

// ── 2. Try listing order-content bucket via the storage API (anon key) ──────
const objects = new Set();
try {
  const listUrl = `${OLD.url}/storage/v1/object/list/order-content`;
  let marker = '';
  for (let page = 0; page < 100; page++) {
    const body = JSON.stringify({ prefix: '', limit: 100, offset: page * 100, sortBy: { column: 'name', order: 'asc' } });
    const r = await fetch(listUrl, { method: 'POST', headers: { ...anonHeaders(OLD.url, OLD.anon), 'Content-Type': 'application/json' }, body });
    if (r.status !== 200) { console.log('\nstorage list API ->', r.status, (await r.text()).slice(0, 100)); break; }
    const items = await r.json();
    if (!Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      if (it.id) objects.add(it.name); // files only (folders have id == null)
    }
    if (items.length < 100) break;
  }
} catch (e) {
  console.log('\nstorage list API error:', e.message);
}
console.log('\nObjects from storage list API:', objects.size);

// ── 3. Derive object paths from order_content.image_urls (authoritative) ────
let fromDb = 0;
try {
  const r = await fetch(`${OLD.url}/rest/v1/order_content?select=image_urls`, { headers: anonHeaders(OLD.url, OLD.anon) });
  const rows = await r.json();
  for (const row of rows || []) {
    for (const u of row.image_urls || []) {
      const m = String(u).match(/\/object\/public\/order-content\/(.+)$/);
      if (m) { objects.add(decodeURIComponent(m[1])); fromDb++; }
    }
  }
} catch (e) {
  console.log('order_content URL harvest error:', e.message);
}
console.log('URLs harvested from order_content rows:', fromDb);
objects.add('logo.png'); // referenced by flw-initiate

const objList = [...objects].sort();
saveState('order-content-objects', objList);
console.log('TOTAL distinct order-content objects to copy:', objList.length);

// ── 4. Probe ONE object download from the old backend (public URL) ──────────
if (objList.length) {
  const probe = objList.find(o => o !== 'logo.png') || objList[0];
  const r = await fetch(`${OLD.url}/storage/v1/object/public/order-content/${encodeURIComponent(probe)}`);
  console.log('probe download [' + probe.slice(0, 40) + '...] ->', r.status, r.headers.get('content-type') || '');
}
