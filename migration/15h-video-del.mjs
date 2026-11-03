import { NEW, secretHeaders } from './lib/creds.mjs';
const path = 'videos/csg_1793680535019_12bc2/1793710626584_9qsot7.mp4';
// supabase-js remove() style: DELETE /object/{bucket}/[{...paths}] JSON body
const r1 = await fetch(`${NEW.url}/storage/v1/object/consignment-videos/` + encodeURIComponent(path), { method: 'DELETE', headers: secretHeaders() });
console.log('encoded-path DELETE:', r1.status, (await r1.text()).slice(0, 80));
if (r1.status !== 200) {
  const r2 = await fetch(`${NEW.url}/storage/v1/object/consignment-videos`, {
    method: 'DELETE',
    headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] }),
  });
  console.log('prefixes DELETE:', r2.status, (await r2.text()).slice(0, 80));
}
