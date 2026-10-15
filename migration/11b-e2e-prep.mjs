/**
 * 11b-e2e-prep.mjs — prepare reset-flow E2E test:
 * create test auth user (confirmed), generate a real recovery link.
 * Writes the link to state (never printed in full in reports).
 */
import { NEW, secretHeaders, loadState, saveState } from './lib/creds.mjs';
import crypto from 'node:crypto';

const testEmail = 'kitan.e2e.test@gmail.com';
const initialPass = crypto.randomBytes(9).toString('base64url');

// 1. Create (or reuse) the confirmed test user
const c = await fetch(`${NEW.url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: testEmail, password: initialPass, email_confirm: true }),
});
const cBody = await c.json().catch(() => ({}));
let userId = cBody?.id || null;
if (c.status !== 200 && c.status !== 201) {
  // maybe exists — find it
  const l = await fetch(`${NEW.url}/auth/v1/admin/users?email=${encodeURIComponent(testEmail)}`, { headers: secretHeaders() });
  const lb = await l.json();
  userId = lb?.users?.[0]?.id || null;
}
console.log('test user ready:', userId ? 'yes' : 'FAILED', '(status ' + c.status + ')');

// 2. Generate recovery link (what the reset email would contain)
const g = await fetch(`${NEW.url}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'recovery', email: testEmail }),
});
const gBody = await g.json().catch(() => ({}));
if (g.status === 200 && gBody?.action_link) {
  saveState('e2e-reset-link', { link: gBody.action_link, userId, email: testEmail });
  // print only the tail (contains the token; not secret-critical but keep output clean)
  console.log('recovery link generated, ends with: …' + gBody.action_link.slice(-24));
} else {
  console.log('generate_link FAILED:', g.status, JSON.stringify(gBody).slice(0, 150));
}
