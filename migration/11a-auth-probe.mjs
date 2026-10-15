/**
 * 11a-auth-probe.mjs — check the new project's Supabase Auth settings:
 * does signUp return an instant session (autoconfirm ON) or require email
 * confirmation? Creates a throwaway account, inspects, then deletes it.
 */
import { NEW, anonHeaders, secretHeaders } from './lib/creds.mjs';
import crypto from 'node:crypto';

const testEmail = `kitan.probe.${Date.now()}@gmail.com`;
const testPass = crypto.randomBytes(12).toString('base64url');

// 1. signUp with the publishable key (what the frontend will do)
const r = await fetch(`${NEW.url}/auth/v1/signup`, {
  method: 'POST',
  headers: { ...anonHeaders(NEW.url, NEW.anon), 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: testEmail, password: testPass }),
});
const body = await r.json().catch(() => null);
console.log('signup HTTP:', r.status);
console.log('has session (autoconfirm ON):', !!(body && body.session && body.session.access_token));
console.log('user created:', !!(body && body.user && body.user.id));
console.log('user confirmed_at:', body?.user?.email_confirmed_at ? 'yes' : 'no');
if (!body?.session && !body?.user) console.log('body:', JSON.stringify(body).slice(0, 200));

// 2. cleanup: delete the throwaway user via admin API
if (body?.user?.id) {
  const d = await fetch(`${NEW.url}/auth/v1/admin/users/${body.user.id}`, { method: 'DELETE', headers: secretHeaders() });
  console.log('cleanup delete:', d.status);
}

// 3. sanity: admin generateLink works (needed later for reset-flow verification)
const g = await fetch(`${NEW.url}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'recovery', email: 'alexjnr909@gmail.com' }),
});
console.log('generate_link (recovery, admin):', g.status, g.status === 200 ? '(available for E2E test)' : (await g.text()).slice(0, 120));
