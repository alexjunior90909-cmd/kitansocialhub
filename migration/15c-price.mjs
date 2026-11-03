import { NEW, anonHeaders } from './lib/creds.mjs';
const r = await fetch(NEW.url + '/rest/v1/app_settings?select=key,value&key=eq.consignment_price', { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('price:', JSON.stringify(await r.json()));
const c = await fetch(NEW.url + '/rest/v1/consignment_requests?select=id,app_user_id,user_email,payment_amount&order=created_at.desc&limit=2', { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('orders:', JSON.stringify(await c.json()));
