/**
 * 04-copy-storage.mjs — copy every order-content object from the old backend
 * to the new project, preserving EXACT paths. Resumable via state file.
 * Downloads use the old PUBLIC object URLs (read-only, no auth needed).
 * Uploads use the new project's secret key. Never deletes anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OLD, NEW, secretHeaders, loadState, saveState } from './lib/creds.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, 'state', 'object-cache');
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const objects = loadState('order-content-objects', []);
const progress = loadState('storage-copy', {}); // { [path]: 'ok' | 'failed' }

// Determine content-type from extension (old backend serves it; we preserve it).
function contentType(p) {
  const ext = p.split('.').pop()?.toLowerCase() || '';
  return {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm',
    pdf: 'application/pdf',
  }[ext] || 'application/octet-stream';
}

let copied = 0, skipped = 0, failed = 0;
for (const objPath of objects) {
  if (progress[objPath] === 'ok') { skipped++; continue; }

  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      // 1. Download from old backend (public URL)
      const dl = await fetch(`${OLD.url}/storage/v1/object/public/order-content/${encodeURIComponent(objPath)}`);
      if (dl.status !== 200) throw new Error('download HTTP ' + dl.status);
      const buf = Buffer.from(await dl.arrayBuffer());
      const ct = dl.headers.get('content-type') || contentType(objPath);

      // 2. Upload to new project, exact same path (upsert for resumability)
      const up = await fetch(`${NEW.url}/storage/v1/object/order-content/${objPath}`, {
        method: 'POST',
        headers: { ...secretHeaders(), 'Content-Type': ct, 'x-upsert': 'true', 'Cache-Control': '31536000' },
        body: buf,
      });
      if (up.status !== 200 && up.status !== 201) throw new Error('upload HTTP ' + up.status + ' ' + (await up.text()).slice(0, 120));

      // 3. Read-back verify via public URL (redirects followed)
      const rb = await fetch(`${NEW.url}/storage/v1/object/public/order-content/${encodeURIComponent(objPath)}`);
      if (rb.status !== 200) throw new Error('readback HTTP ' + rb.status);
      const rbBuf = Buffer.from(await rb.arrayBuffer());
      if (rbBuf.length !== buf.length) throw new Error(`readback size mismatch ${rbBuf.length} != ${buf.length}`);

      progress[objPath] = 'ok';
      ok = true;
      copied++;
      console.log('OK  ', (buf.length / 1024).toFixed(0).padStart(6) + 'KB', objPath);
    } catch (e) {
      if (attempt === 2) {
        progress[objPath] = 'failed: ' + e.message;
        failed++;
        console.log('FAIL', objPath, '->', e.message);
      } else {
        await sleep(2000 * (attempt + 1));
      }
    }
  }
  saveState('storage-copy', progress); // checkpoint after every object
}

saveState('storage-copy', progress);
console.log(`\nStorage copy complete: copied=${copied} skipped(already done)=${skipped} failed=${failed} total=${objects.length}`);
if (failed > 0) {
  const failures = Object.entries(progress).filter(([, v]) => v !== 'ok');
  console.log('Failed objects:');
  for (const [p, err] of failures) console.log(' -', p, '->', err);
}
