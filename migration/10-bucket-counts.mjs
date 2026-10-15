/**
 * 10-bucket-counts.mjs — object counts per bucket in the NEW project (report data).
 */
import { NEW, secretHeaders } from './lib/creds.mjs';

for (const bucket of ['order-content', 'products', 'documents', 'working-pictures', 'formats', 'website-products']) {
  let total = 0, sampleSize = 0;
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await fetch(`${NEW.url}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (r.status !== 200) { console.log(bucket, '-> list HTTP', r.status); break; }
    const items = await r.json();
    // recursive prefixes are complex; count top-level entries (files with id != null)
    const files = items.filter(i => i.id);
    total += files.length;
    let bytes = 0; files.forEach(f => bytes += f.metadata?.size || 0);
    sampleSize += bytes;
    if (items.length < 100) break;
  }
  console.log(bucket.padEnd(20), 'objects: ' + total, ' size: ' + (sampleSize / 1024 / 1024).toFixed(1) + 'MB');
}
