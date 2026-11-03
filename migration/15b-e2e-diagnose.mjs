/**
 * 15b-e2e-diagnose.mjs — what does the DB say after the failed-looking payment?
 */
import { NEW, anonHeaders } from './lib/creds.mjs';

const id = 'mv9iuh5w0psdo9lo06ye';
const w = await fetch(`${NEW.url}/rest/v1/wallets?select=balance,updated_at&app_user_id=eq.${id}`, { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('wallet now:', JSON.stringify(await w.json()));

const cr = await fetch(`${NEW.url}/rest/v1/consignment_requests?select=id,payment_reference,payment_amount,processing_status,created_at&order=created_at.desc&limit=3`, { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('consignment rows:', JSON.stringify(await cr.json()));

const pm = await fetch(`${NEW.url}/rest/v1/payments?select=id,tx_ref,product_type,amount_ngn,payment_status&order=created_at.desc&limit=3`, { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('payments:', JSON.stringify(await pm.json()));

const tx = await fetch(`${NEW.url}/rest/v1/wallet_transactions?select=id,type,amount,balance_after,product_type&app_user_id=eq.${id}&order=created_at.desc&limit=3`, { headers: anonHeaders(NEW.url, NEW.anon) });
console.log('txs:', JSON.stringify(await tx.json()));
