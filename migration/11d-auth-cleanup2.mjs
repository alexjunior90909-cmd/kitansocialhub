/**
 * 11d-auth-cleanup2.mjs — delete the two E2E test auth users by exact email.
 */
import { NEW, secretHeaders } from './lib/creds.mjs';

for (const email of ['kitan.e2e.test@gmail.com', 'kitan.e2e.reg@gmail.com']) {
  const l = await fetch(`${NEW.url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: secretHeaders() });
  const { users = [] } = await l.json().catch(() => ({}));
  const u = users[0];
  if (!u) { console.log(email, '-> not found (already gone)'); continue; }
  const d = await fetch(`${NEW.url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: secretHeaders() });
  console.log(email, '->', d.status);
}
