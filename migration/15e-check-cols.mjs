import { NEW, anonHeaders } from './lib/creds.mjs';
const r = await fetch(NEW.url + '/rest/v1/consignment_requests?select=id,video_storage_path,video_delivery_status&limit=1', { headers: anonHeaders(NEW.url, NEW.anon) });
const body = await r.text();
console.log('video columns:', r.status === 200 ? 'PRESENT' : 'MISSING — ' + body.slice(0, 120));
