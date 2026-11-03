/**
 * 15-e2e-prep.mjs — snapshot admin wallet + tx counts, credit ₦10,000 test funds.
 * Saves state for exact cleanup.
 */
import { NEW, anonHeaders, secretHeaders, loadState, saveState } from './lib/creds.mjs';

// Admin app-user id (registered_users by email)
const ru = await fetch(`${NEW.url}/rest/v1/registered_users?select=id,email&email=eq.alexjnr909%40gmail.com`, { headers: anonHeaders(NEW.url, NEW.anon) });
const adminId = (await ru.json())[0]?.id;
if (!adminId) throw new Error('admin row not found');

// Wallet snapshot
const w = await fetch(`${NEW.url}/rest/v1/wallets?select=id,balance&app_user_id=eq.${adminId}`, { headers: anonHeaders(NEW.url, NEW.anon) });
const wallet = (await w.json())[0];
const before = Number(wallet?.balance ?? 0);

// Tx + payments counts for this user
const txc = await fetch(`${NEW.url}/rest/v1/wallet_transactions?select=id&app_user_id=eq.${adminId}`, { headers: { ...anonHeaders(NEW.url, NEW.anon), Prefer: 'count=exact' } });
const txCount = Number((txc.headers.get('content-range') || '*/0').split('/')[1]);
const payc = await fetch(`${NEW.url}/rest/v1/payments?select=id&app_user_id=eq.${adminId}`, { headers: { ...anonHeaders(NEW.url, NEW.anon), Prefer: 'count=exact' } });
const payCount = Number((payc.headers.get('content-range') || '*/0').split('/')[1]);

// Credit ₦10,000 test funds (service key, filtered PATCH)
const cred = await fetch(`${NEW.url}/rest/v1/wallets?app_user_id=eq.${adminId}`, {
  method: 'PATCH',
  headers: { ...secretHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ balance: before + 10000, updated_at: new Date().toISOString() }),
});
const credRows = await cred.json();
console.log('credit status:', cred.status, 'new balance:', credRows?.[0]?.balance);

saveState('e2e-consignment', { adminId, before, txCount, payCount, walletId: wallet?.id ?? null });
console.log('snapshot saved: admin', adminId, 'balance', before, 'tx', txCount, 'payments', payCount);
