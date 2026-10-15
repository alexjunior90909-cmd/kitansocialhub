/**
 * 03-create-buckets.mjs — create the six public buckets in the NEW project
 * via the Storage API (no SQL needed for this part).
 */
import { NEW, secretHeaders } from './lib/creds.mjs';

const BUCKETS = [
  { name: 'order-content', public: true, fileSizeLimit: '52428800' },   // 50MB (matches order-content upload guard)
  { name: 'products', public: true, fileSizeLimit: '26214400' },        // 25MB (MAX_IMAGE_BYTES)
  { name: 'documents', public: true, fileSizeLimit: '26214400' },
  { name: 'working-pictures', public: true, fileSizeLimit: '52428800' }, // videos allowed
  { name: 'formats', public: true, fileSizeLimit: '26214400' },
  { name: 'website-products', public: true, fileSizeLimit: '26214400' },
];

// Discover existing buckets first (idempotent).
const listRes = await fetch(`${NEW.url}/storage/v1/bucket`, { headers: secretHeaders() });
const existing = new Set((await listRes.json()).map(b => b.name));
console.log('Existing buckets:', [...existing].join(', ') || '(none)');

for (const b of BUCKETS) {
  if (existing.has(b.name)) { console.log('SKIP (exists):', b.name); continue; }
  const r = await fetch(`${NEW.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: secretHeaders(),
    body: JSON.stringify({ name: b.name, id: b.name, public: b.public, file_size_limit: Number(b.fileSizeLimit) }),
  });
  const body = await r.text();
  console.log((r.status === 200 ? 'CREATED' : 'FAILED') , b.name, '->', r.status, body.slice(0, 100));
}

// Verify all six exist and are public.
const verify = await fetch(`${NEW.url}/storage/v1/bucket`, { headers: secretHeaders() });
const final = await verify.json();
for (const b of BUCKETS) {
  const found = final.find(x => x.name === b.name);
  console.log(b.name.padEnd(20), found ? (found.public ? 'OK public' : 'PRIVATE (needs fix!)') : 'MISSING');
}
