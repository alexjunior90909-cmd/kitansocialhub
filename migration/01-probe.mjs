/**
 * 01-probe.mjs — validate both backends and capture the authoritative source schema.
 * Prints statuses and table names only — never credential values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NEW, OLD, anonHeaders, secretHeaders, loadState, saveState } from './lib/creds.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, headers, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers });
      return { status: r.status, json: await r.json().catch(() => null) };
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

console.log('== New project ==');
const newRoot = await fetchJson(NEW.url + '/rest/v1/', anonHeaders(NEW.url, NEW.anon));
console.log('REST root (publishable key):', newRoot.status);
const newTables = newRoot.json?.definitions ? Object.keys(newRoot.json.definitions) : [];
console.log('Existing tables in new project:', newTables.length ? newTables.join(', ') : '(none)');

const authProbe = await fetch(NEW.url + '/auth/v1/admin/users?per_page=1', { headers: secretHeaders() });
console.log('Admin-capable key check (auth admin endpoint):', authProbe.status);

console.log('\n== Old backend ==');
const oldRoot = await fetchJson(OLD.url + '/rest/v1/', anonHeaders(OLD.url, OLD.anon));
console.log('REST root (anon key):', oldRoot.status);
const spec = oldRoot.json;
if (!spec?.definitions) {
  console.error('FATAL: could not read old backend OpenAPI spec');
  process.exit(1);
}

// Extract per-table column + type info from the OpenAPI spec (PostgREST exposes it).
const schema = {};
for (const [table, def] of Object.entries(spec.definitions)) {
  const cols = {};
  for (const [col, d] of Object.entries(def.properties || {})) {
    // PostgREST format: "type" or "type[]"; description carries default/format/nullable info.
    cols[col] = {
      type: d.format || d.type || 'unknown',
      array: Array.isArray(d.type),
      desc: d.description || '',
    };
  }
  // PKs: PostgREST marks them via description "Note: This is a Primary Key.<pk/>"
  schema[table] = cols;
}
fs.writeFileSync(path.join('..', 'migration', 'state', 'source-schema.json'), JSON.stringify(spec.definitions, null, 2));
saveState('source-tables', Object.keys(schema));

console.log('\nSource tables discovered:', Object.keys(schema).length);
for (const t of Object.keys(schema).sort()) console.log(' -', t, '(' + Object.keys(schema[t]).length + ' cols)');

// Probe each table's readability + row count head-count.
console.log('\n== Source table access probes (anon key) ==');
const access = {};
for (const t of Object.keys(schema).sort()) {
  const r = await fetch(OLD.url + '/rest/v1/' + t + '?select=*&limit=1', { headers: anonHeaders(OLD.url, OLD.anon) });
  let total = '?';
  const cr = r.headers.get('content-range'); // e.g. "0-0/9" or "*/9"
  if (cr) total = cr.split('/')[1];
  access[t] = { status: r.status, readable: r.status === 200, totalHint: total };
  console.log((r.status === 200 ? 'OK ' : 'ERR') + ' ' + t + ' -> ' + r.status + ' count~' + total);
}
saveState('source-access', access);

const unreadable = Object.entries(access).filter(([, v]) => !v.readable).map(([k]) => k);
console.log('\nUnreadable tables:', unreadable.length ? unreadable.join(', ') : '(none)');
