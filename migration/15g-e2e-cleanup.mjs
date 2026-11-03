/**
 * 15g-e2e-cleanup.mjs — remove ALL test artifacts, restore wallet, keep the
 * user's REAL order (csg_1793678752203_d5712) untouched.
 */
import { NEW, anonHeaders, secretHeaders, loadState } from './lib/creds.mjs';

const st = loadState('e2e-consignment', {});
const id = st.adminId;
const H = { ...secretHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' };
let log = [];

// 1. Delete the test video object from the private bucket
const vo = await fetch(`${NEW.url}/rest/v1/consignment_requests?select=video_storage_path&id=eq.csg_1793680535019_12bc2`, { headers: anonHeaders(NEW.url, NEW.anon) });
const vPath = ((await vo.json())[0] || {}).video_storage_path;
if (vPath) {
  const rv = await fetch(`${NEW.url}/storage/v1/object/consignment-videos/${vPath}`, { method: 'DELETE', headers: secretHeaders() });
  log.push('video object ' + vPath.split('/').pop() + ' -> ' + rv.status);
}

// 2. Delete test order, payment, wallet tx (all filtered to the exact test ids)
const dOrder = await fetch(`${NEW.url}/rest/v1/consignment_requests?id=eq.csg_1793680535019_12bc2`, { method: 'DELETE', headers: H });
log.push('order row -> ' + dOrder.status + ' (' + (await dOrder.json()).length + ' deleted)');
const dPay = await fetch(`${NEW.url}/rest/v1/payments?id=eq.pay_csg_1793680535031_9b73f`, { method: 'DELETE', headers: H });
log.push('payments row -> ' + dPay.status);
const dTx = await fetch(`${NEW.url}/rest/v1/wallet_transactions?id=eq.wt_csg_1793680535031_2c883`, { method: 'DELETE', headers: H });
log.push('wallet tx row -> ' + dTx.status);

// 3. Restore wallet to its true original balance (st.before = 200)
const rw = await fetch(`${NEW.url}/rest/v1/wallets?app_user_id=eq.${id}`, {
  method: 'PATCH',
  headers: { ...H },
  body: JSON.stringify({ balance: st.before, updated_at: new Date().toISOString() }),
});
const wb = (await rw.json())[0];
log.push('wallet restored -> ' + wb.balance + ' (original ' + st.before + ')');

// 4. Privacy-test user: registered_users row + auth account
const dRu = await fetch(`${NEW.url}/rest/v1/registered_users?email=eq.kitan.e2e.buyer2%40gmail.com`, { method: 'DELETE', headers: H });
log.push('registered_users row -> ' + dRu.status);
const au = await fetch(`${NEW.url}/auth/v1/admin/users?email=kitan.e2e.buyer2%40gmail.com`, { headers: secretHeaders() });
const auBody = await au.json();
if (auBody?.users?.[0]) {
  const da = await fetch(`${NEW.url}/auth/v1/admin/users/${auBody.users[0].id}`, { method: 'DELETE', headers: secretHeaders() });
  log.push('auth user -> ' + da.status);
} else { log.push('auth user -> not found (local-only)'); }

// 5. Verify: user's real order still present; test order gone; counts sane
const real = await fetch(`${NEW.url}/rest/v1/consignment_requests?select=id&order=created_at.desc&limit=5`, { headers: anonHeaders(NEW.url, NEW.anon) });
const remaining = await real.json();
log.push('remaining orders: ' + JSON.stringify(remaining.map(r => r.id)));

console.log(log.join('\n'));
