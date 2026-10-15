/**
 * 05-migrate-data.mjs — resumable table-by-table data migration.
 * Old backend (read-only, anon key) -> new project (secret key, upserts).
 * Preserves ALL values verbatim, including Base64 image data and IDs.
 * Idempotent: re-running upserts the same rows (no duplicates).
 */
import { OLD, NEW, anonHeaders, secretHeaders, loadState, saveState } from './lib/creds.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Order matters only for readability; upserts make it safe in any order.
// Small config tables first, then core data, then big provider tables.
const TABLE_ORDER = [
  'exchange_rate', 'app_settings', 'website_settings', 'receipt_settings',
  'smspool_global_settings', 'fivesim_global_settings', 'tutorial_videos',
  'subscription_plans', 'plan_products', 'receipt_products', 'receipt_fields',
  'products', 'kitan_documents', 'working_pictures', 'formats', 'website_products',
  'social_accounts', 'order_content', 'registered_users', 'user_profiles',
  'wallets', 'wallet_transactions', 'admin_wallet_adjustments',
  'payments', 'purchases', 'user_subscriptions', 'receipt_generations',
  'document_submissions', 'social_account_orders',
  'virtual_number_orders', 'fivesim_orders', 'jap_orders',
  'smspool_price_overrides', 'jap_services',
];

const PAGE = 500; // rows per source read
const BATCH = 200; // rows per dest upsert

const progress = loadState('data-migration', {}); // { [table]: { done: bool, rows: n, error?: string } }

async function fetchAll(table) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const url = `${OLD.url}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`;
    let r;
    for (let a = 0; ; a++) {
      r = await fetch(url, { headers: anonHeaders(OLD.url, OLD.anon) });
      if (r.status === 200) break;
      if (a >= 3) throw new Error(`source read ${table}@${offset} HTTP ${r.status}`);
      await sleep(2000 * (a + 1));
    }
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

/** Batch by BOTH row count and serialized byte size (Base64 media rows are MBs each). */
function chunkBySize(rows, maxRows, maxBytes) {
  const out = [];
  let cur = [], curBytes = 0;
  for (const row of rows) {
    const sz = Buffer.byteLength(JSON.stringify(row));
    if (cur.length > 0 && (cur.length >= maxRows || curBytes + sz > maxBytes)) {
      out.push(cur); cur = []; curBytes = 0;
    }
    cur.push(row); curBytes += sz;
  }
  if (cur.length) out.push(cur);
  return out;
}

// Tables whose rows embed Base64 media need small byte-capped batches.
const MEDIA_TABLES = new Set(['products', 'kitan_documents', 'working_pictures', 'formats', 'website_products', 'document_submissions']);

// Discover PK column per table from source-schema.json
import fs from 'node:fs';
const spec = JSON.parse(fs.readFileSync(new URL('./state/source-schema.json', import.meta.url), 'utf8'));
const pkCol = {};
for (const [t, def] of Object.entries(spec)) {
  const pk = Object.entries(def.properties || {}).find(([, p]) => /Primary Key\.<pk\/>/.test(p.description || ''));
  pkCol[t] = pk ? pk[0] : 'id';
}

let allOk = true;
for (const table of TABLE_ORDER) {
  if (!pkCol[table]) { console.log('SKIP unknown table', table); continue; }
  if (progress[table]?.done) { console.log('SKIP (done)', table, progress[table].rows); continue; }

  try {
    const rows = await fetchAll(table);
    const batches = MEDIA_TABLES.has(table) ? chunkBySize(rows, 20, 3.5 * 1024 * 1024) : chunk(rows, BATCH);
    let inserted = 0;
    for (const part of batches) {
      let r;
      for (let a = 0; ; a++) {
        r = await fetch(`${NEW.url}/rest/v1/${table}`, {
          method: 'POST',
          headers: { ...secretHeaders(), Prefer: `resolution=merge-duplicates,return=minimal` },
          body: JSON.stringify(part),
        });
        if (r.status === 201 || r.status === 200) break;
        const errText = await r.text();
        if (a >= 3) throw new Error(`dest upsert ${table} HTTP ${r.status}: ${errText.slice(0, 200)}`);
        await sleep(2000 * (a + 1));
      }
      inserted += part.length;
    }
    progress[table] = { done: true, rows: rows.length, migrated: inserted };
    console.log('OK  ', String(rows.length).padStart(6), table);
  } catch (e) {
    progress[table] = { done: false, rows: -1, error: e.message };
    allOk = false;
    console.log('FAIL', table, '->', e.message);
  }
  saveState('data-migration', progress); // checkpoint after every table
}

console.log('\nAll tables attempted. Success:', Object.values(progress).filter(p => p.done).length, '/', TABLE_ORDER.length);
if (!allOk) {
  console.log('Failed tables (re-run this script to resume):');
  for (const [t, p] of Object.entries(progress)) if (!p.done) console.log(' -', t, '->', p.error);
  process.exitCode = 1;
}
