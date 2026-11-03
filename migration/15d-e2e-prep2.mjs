/**
 * 15d-e2e-prep2.mjs — top up test credit to cover the real ₦55,000 price.
 * Original balance snapshot (200) retained in state for final cleanup.
 */
import { NEW, anonHeaders, secretHeaders, loadState, saveState } from './lib/creds.mjs';

const st = loadState('e2e-consignment', {});
const id = st.adminId;

const w = await fetch(`${NEW.url}/rest/v1/wallets?select=balance&app_user_id=eq.${id}`, { headers: anonHeaders(NEW.url, NEW.anon) });
const cur = Number((await w.json())[0]?.balance ?? 0);

const target = 60200; // covers ₦55,000 + margin
const cred = await fetch(`${NEW.url}/rest/v1/wallets?app_user_id=eq.${id}`, {
  method: 'PATCH',
  headers: { ...secretHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ balance: target, updated_at: new Date().toISOString() }),
});
const rows = await cred.json();
console.log('balance:', cur, '->', rows?.[0]?.balance);
saveState('e2e-consignment', { ...st, totalCredit: target - st.before });
