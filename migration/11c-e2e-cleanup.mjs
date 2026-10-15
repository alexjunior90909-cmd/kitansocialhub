/**
 * 11c-e2e-cleanup.mjs — remove E2E test artifacts:
 * test auth users + their registered_users rows. Production data untouched.
 */
import { NEW, secretHeaders, anonHeaders } from './lib/creds.mjs';

const TEST_PREFIXES = ['kitan.e2e.test', 'kitan.e2e.reg', 'kitan.probe'];

// 1. Delete test auth users (paginated scan)
let deletedAuth = 0;
for (let page = 1; page <= 20; page++) {
  const l = await fetch(`${NEW.url}/auth/v1/admin/users?per_page=200&page=${page}`, { headers: secretHeaders() });
  if (l.status !== 200) break;
  const { users = [] } = await l.json();
  if (!users.length) break;
  const targets = users.filter(u => TEST_PREFIXES.some(p => String(u.email).startsWith(p + '.')));
  for (const t of targets) {
    const d = await fetch(`${NEW.url}/auth/v1/admin/users/${t.id}`, { method: 'DELETE', headers: secretHeaders() });
    if (d.status < 300) deletedAuth++;
    console.log('auth delete:', t.email, '->', d.status);
  }
  if (users.length < 200) break;
}

// 2. Delete their registered_users rows
let deletedRows = 0;
for (const p of TEST_PREFIXES) {
  for (const email of [`${p}@gmail.com`]) {
    const d = await fetch(`${NEW.url}/rest/v1/registered_users?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { ...secretHeaders(), Prefer: 'return=representation' },
    });
    const rows = await d.json().catch(() => []);
    deletedRows += Array.isArray(rows) ? rows.length : 0;
  }
}

// 3. Confirm final counts
const ru = await fetch(`${NEW.url}/rest/v1/registered_users?select=id&limit=1`, { headers: { ...anonHeaders(NEW.url, NEW.anon), Prefer: 'count=exact' } });
const count = (ru.headers.get('content-range') || '*/?').split('/')[1];
console.log(`\ncleanup: ${deletedAuth} auth users deleted, ${deletedRows} registered_users rows deleted`);
console.log('registered_users final count:', count, '(expected 1109)');
