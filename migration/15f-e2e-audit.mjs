/**
 * 15f-e2e-audit.mjs — idempotency (duplicate payment must not charge twice)
 * + wallet integrity audit for the E2E order.
 */
import { NEW, anonHeaders, secretHeaders, loadState } from './lib/creds.mjs';

const st = loadState('e2e-consignment', {});
const id = st.adminId; // mv9iuh5w0psdo9lo06ye
const REF = 'csg_1793680535019_12bc2'; // the payment_reference the client generated
// NOTE: the client reference differs from the request id. Fetch the real reference:
const or_ = await fetch(`${NEW.url}/rest/v1/consignment_requests?select=id,payment_reference,payment_amount,processing_status,video_delivery_status,video_storage_path&app_user_id=eq.${id}&id=eq.csg_1793680535019_12bc2`, { headers: anonHeaders(NEW.url, NEW.anon) });
const order = (await or_.json())[0];
console.log('order:', JSON.stringify(order));

// 1. Duplicate payment attempt with the SAME reference (as a double-click/refresh would)
const dup = await fetch(`${NEW.url}/rest/v1/rpc/pay_consignment`, {
  method: 'POST',
  headers: { ...anonHeaders(NEW.url, NEW.anon), 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_app_user_id: id, p_user_name: 'Alex E2E', p_user_email: 'alexjnr909@gmail.com',
    p_reference: order.payment_reference,
    p_receiver_name: 'Sarah E2E', p_receiver_address: '5 Test Lane', p_sender_name: 'Alex E2E',
    p_amount: '$88,888', p_note: '', p_receiver_image_url: '', p_assets: ['gold_bars'],
  }),
});
console.log('duplicate RPC result:', (await dup.text()).slice(0, 140));

// 2. Wallet integrity
const w = await fetch(`${NEW.url}/rest/v1/wallets?select=balance&app_user_id=eq.${id}`, { headers: anonHeaders(NEW.url, NEW.anon) });
const balance = Number((await w.json())[0].balance);
console.log('balance now:', balance, '(expect 60200 - 55000 = 5200)');

const txs = await fetch(`${NEW.url}/rest/v1/wallet_transactions?select=id,type,amount,balance_after,product_type&app_user_id=eq.${id}&order=created_at.desc&limit=2`, { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('latest txs:', JSON.stringify(await txs.json()));

const pays = await fetch(`${NEW.url}/rest/v1/payments?select=id,tx_ref,amount_ngn,product_type&tx_ref=eq.${order.payment_reference}`, { headers: { ...anonHeaders(NEW.url, NEW.anon), Prefer: 'count=exact' } });
console.log('payments for this ref (count):', pays.headers.get('content-range'), JSON.stringify(await pays.json()));

const ordersCount = await fetch(`${NEW.url}/rest/v1/consignment_requests?select=id&payment_reference=eq.${order.payment_reference}`, { headers: { ...anonHeaders(NEW.url, NEW.anon), Prefer: 'count=exact' } });
console.log('orders for this ref (count):', ordersCount.headers.get('content-range'));
