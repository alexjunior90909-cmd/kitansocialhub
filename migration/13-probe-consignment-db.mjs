/**
 * 13-probe-consignment-db.mjs — does consignment_requests exist? does the
 * pay_consignment RPC exist? (determines what's testable today)
 */
import { NEW, anonHeaders, secretHeaders } from './lib/creds.mjs';

const r = await fetch(`${NEW.url}/rest/v1/consignment_requests?select=id&limit=1`, { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('consignment_requests table:', r.status === 200 ? 'EXISTS' : r.status === 404 ? 'MISSING (SQL not applied)' : 'HTTP ' + r.status);

// RPC probe: call with invalid-ish args; PGRST202 = function missing, anything else = exists
const rpc = await fetch(`${NEW.url}/rest/v1/rpc/pay_consignment`, {
  method: 'POST',
  headers: { ...anonHeaders(NEW.url, NEW.anon), 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_app_user_id: 'probe', p_user_name: 'probe', p_user_email: 'probe@probe', p_reference: 'probe_' + Date.now(), p_receiver_name: '', p_receiver_address: '', p_sender_name: '', p_amount: '', p_note: '', p_receiver_image_url: '', p_assets: [] }),
});
const body = await rpc.text();
console.log('pay_consignment RPC:', rpc.status === 404 && body.includes('PGRST202') ? 'MISSING (SQL not applied)' : 'EXISTS (status ' + rpc.status + ', ' + body.slice(0, 120) + ')');

// app_settings keys present?
const s = await fetch(`${NEW.url}/rest/v1/app_settings?select=key&in=(consignment_price,consignment_sample_video_url)`, { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('settings rows:', JSON.stringify(await s.json()));

// current buckets
const b = await fetch(`${NEW.url}/storage/v1/bucket`, { headers: secretHeaders() });
console.log('buckets:', (await b.json()).map(x => x.name + (x.public ? '(public)' : '(private)')).join(', '));
