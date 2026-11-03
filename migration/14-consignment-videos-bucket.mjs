/**
 * 14-consignment-videos-bucket.mjs — create the PRIVATE consignment-videos
 * bucket via the Storage API (its policies come from consignment-fulfilment-setup.sql).
 */
import { NEW, secretHeaders } from './lib/creds.mjs';

const r = await fetch(`${NEW.url}/storage/v1/bucket`, {
  method: 'POST',
  headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'consignment-videos', id: 'consignment-videos', public: false, file_size_limit: 52428800 }),
});
console.log('create:', r.status, (await r.text()).slice(0, 80));

const list = await fetch(`${NEW.url}/storage/v1/bucket`, { headers: secretHeaders() });
const found = (await list.json()).find(b => b.name === 'consignment-videos');
console.log('consignment-videos bucket:', found ? (found.public ? 'PUBLIC (WRONG — run the SQL)' : 'private OK') : 'MISSING');
