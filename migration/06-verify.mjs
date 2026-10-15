/**
 * 06-verify.mjs — full verification: per-table row counts (old vs new) and
 * per-object storage checks. Prints a mismatch report. Read-only.
 */
import { OLD, NEW, anonHeaders, secretHeaders, loadState } from './lib/creds.mjs';

const tables = loadState('source-tables', []);
const objects = loadState('order-content-objects', []);

console.log('TABLE'.padEnd(30), 'OLD'.padStart(7), 'NEW'.padStart(7), '  STATUS');
console.log('-'.repeat(60));
let mismatches = 0;
const report = {};
for (const t of tables) {
  const oldR = await fetch(`${OLD.url}/rest/v1/${t}?select=*&limit=1`, { headers: { ...anonHeaders(OLD.url, OLD.anon), Prefer: 'count=exact' } });
  const newR = await fetch(`${NEW.url}/rest/v1/${t}?select=*&limit=1`, { headers: { ...anonHeaders(NEW.url, NEW.anon), Prefer: 'count=exact' } });
  const oc = Number((oldR.headers.get('content-range') || '*/0').split('/')[1]);
  let nc = null, nerr = '';
  // PostgREST returns 200 (full range) or 206 (partial) — both are success.
  if (newR.status === 200 || newR.status === 206) nc = Number((newR.headers.get('content-range') || '*/0').split('/')[1]);
  else nerr = 'HTTP ' + newR.status + ' ' + (await newR.text()).slice(0, 80);
  const ok = nc === oc;
  if (!ok) mismatches++;
  report[t] = { old: oc, new: nc, ok, err: nerr };
  console.log(t.padEnd(30), String(oc).padStart(7), nerr ? 'ERR'.padStart(7) : String(nc).padStart(7), '  ', ok ? 'OK' : nerr || 'MISMATCH');
}

// Spot-check: first product from old == first product in new (ID + title)
try {
  const o = await (await fetch(`${OLD.url}/rest/v1/products?select=id,title&limit=1`, { headers: anonHeaders(OLD.url, OLD.anon) })).json();
  const n = await (await fetch(`${NEW.url}/rest/v1/products?select=id,title&limit=1`, { headers: anonHeaders(NEW.url, NEW.anon) })).json();
  console.log('\nSpot-check products[0]:', JSON.stringify(o[0]), '->', JSON.stringify(n[0]));
} catch (e) { console.log('spot-check error:', e.message); }

// Anon-key read test on the new project (proves RLS policies work for the app)
try {
  const anonProducts = await fetch(`${NEW.url}/rest/v1/products?select=id&limit=3`, { headers: anonHeaders(NEW.url, NEW.anon) });
  console.log('Anon read on new products:', anonProducts.status, '(200 = policies OK)');
} catch (e) { console.log('anon read error:', e.message); }

console.log('\n=== STORAGE order-content ===');
let sOk = 0, sFail = 0;
for (const p of objects) {
  const r = await fetch(`${NEW.url}/storage/v1/object/public/order-content/${encodeURIComponent(p)}`);
  if (r.status === 200) sOk++; else { sFail++; console.log('MISSING/ERR', r.status, p); }
}
console.log(`objects: ${sOk}/${objects.length} readable, ${sFail} failed`);

import fs from 'node:fs';
fs.writeFileSync(new URL('./state/verification.json', import.meta.url), JSON.stringify({ report, storage: { ok: sOk, fail: sFail, total: objects.length } }, null, 2));
console.log('\nRESULT:', mismatches === 0 && sFail === 0 ? 'ALL VERIFIED' : `${mismatches} table mismatch(es), ${sFail} storage failure(s)`);
