/**
 * 11-auth-seed.mjs — ONE-TIME: pre-create Supabase Auth accounts for every
 * existing registered user (and the two admin emails) so that:
 *   - password reset ("Forgot password") works immediately for everyone
 *   - cross-device login works after a user sets/resets their password once
 *
 * Safety: email_confirm=true, RANDOM password (unknown to everyone — nobody's
 * password is changed or revealed; users who never reset simply keep using the
 * app exactly as before). createUser sends NO emails. Idempotent — re-running
 * skips existing accounts. Never deletes or modifies registered_users rows.
 */
import { NEW, anonHeaders, secretHeaders, loadState, saveState } from './lib/creds.mjs';
import crypto from 'node:crypto';

const ADMIN_EMAILS = ['alexjnr909@gmail.com', 'alexroseline345@gmail.com'];

// 1. Gather every existing email from registered_users (paginated) + admins
const emails = new Set(ADMIN_EMAILS);
for (let offset = 0; ; offset += 500) {
  const r = await fetch(`${NEW.url}/rest/v1/registered_users?select=email,id&order=registered_at.asc&limit=500&offset=${offset}`, { headers: anonHeaders(NEW.url, NEW.anon) });
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) break;
  rows.forEach(row => { if (row.email) emails.add(String(row.email).toLowerCase().trim()); });
  if (rows.length < 500) break;
}
console.log('Emails to ensure auth accounts for:', emails.size);

// 2. Clean up any leftover probe accounts from testing
const probeList = await fetch(`${NEW.url}/auth/v1/admin/users?per_page=100`, { headers: secretHeaders() });
if (probeList.status === 200) {
  const users = await probeList.json();
  const probes = (users.users || []).filter(u => String(u.email).startsWith('kitan.probe.'));
  for (const p of probes) {
    const d = await fetch(`${NEW.url}/auth/v1/admin/users/${p.id}`, { method: 'DELETE', headers: secretHeaders() });
    console.log('probe cleanup:', p.email, '->', d.status);
  }
}

// 3. Create auth accounts (email confirmed, random password)
const progress = loadState('auth-seed', { done: [], created: 0, skipped: 0, failed: [] });
const done = new Set(progress.done);
let created = progress.created || 0, skipped = progress.skipped || 0;
const failed = progress.failed || [];

for (const email of emails) {
  if (done.has(email)) continue;
  try {
    const r = await fetch(`${NEW.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: crypto.randomBytes(18).toString('base64url'), email_confirm: true }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 200 || r.status === 201) { created++; done.add(email); }
    else if (String(body.msg || body.error || '').includes('already') || String(body.msg || '').includes('Already')) { skipped++; done.add(email); }
    else { failed.push({ email, status: r.status, msg: String(body.msg || body.error || '').slice(0, 80) }); }
  } catch (e) {
    failed.push({ email, msg: e.message.slice(0, 80) });
  }
  if ((created + skipped + failed.length) % 100 === 0) console.log(`…progress: created=${created} skipped=${skipped} failed=${failed.length}`);
  saveState('auth-seed', { done: [...done], created, skipped, failed });
}

saveState('auth-seed', { done: [...done], created, skipped, failed });
console.log(`\nDONE: created=${created} already-existed=${skipped} failed=${failed.length} / total=${emails.size}`);
if (failed.length) {
  console.log('Failures (legacy login still works for these on known devices; reset unavailable until fixed):');
  failed.slice(0, 20).forEach(f => console.log(' -', f.email, '->', f.status || '', f.msg));
}
