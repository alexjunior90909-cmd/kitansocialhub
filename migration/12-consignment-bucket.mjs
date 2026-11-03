/**
 * 12-consignment-bucket.mjs — create the `consignment` public bucket via the
 * Storage API (write policies for it are added by supabase/consignment-setup.sql).
 */
import { NEW, secretHeaders } from './lib/creds.mjs';

const r = await fetch(`${NEW.url}/storage/v1/bucket`, {
  method: 'POST',
  headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'consignment', id: 'consignment', public: true, file_size_limit: 26214400 }),
});
console.log('create bucket:', r.status, (await r.text()).slice(0, 80));

const list = await fetch(`${NEW.url}/storage/v1/bucket`, { headers: secretHeaders() });
const buckets = await list.json();
const found = buckets.find(b => b.name === 'consignment');
console.log('consignment bucket:', found ? (found.public ? 'OK public' : 'PRIVATE (needs SQL/settings fix)') : 'MISSING');
