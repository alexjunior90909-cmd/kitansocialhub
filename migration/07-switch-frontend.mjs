/**
 * 07-switch-frontend.mjs — AFTER data verification passes, point the frontend
 * .env at the NEW Supabase project. The old config is preserved as
 * .env.old-backend (fallback). Refuses to run if verification hasn't passed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEW } from './lib/creds.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const envPath = path.join(root, '.env');
const backupPath = path.join(root, '.env.old-backend');

// Safety gate: only switch after verification reports all-OK.
let verification = null;
try {
  verification = JSON.parse(fs.readFileSync(path.join(here, 'state', 'verification.json'), 'utf8'));
} catch { /* not run yet */ }

const tables = Object.values(verification?.report || {});
const badTables = tables.filter(t => !t.ok);
// Storage failures that are objects which never existed on the SOURCE are non-blocking.
const copyState = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(here, 'state', 'storage-copy.json'), 'utf8')); } catch { return {}; }
})();
const realStorageFails = (verification?.storage?.fail ?? 0) - Object.values(copyState).filter(v => String(v).startsWith('absent-on-source')).length;
if (!verification || badTables.length > 0 || realStorageFails > 0) {
  console.error('REFUSING to switch: verification has not passed.');
  if (badTables.length) console.error('Tables with mismatches:', badTables.length);
  if (realStorageFails > 0) console.error('Real storage failures:', realStorageFails);
  process.exit(1);
}

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(envPath, backupPath);
  console.log('Old backend config preserved as .env.old-backend');
}

const newEnv = [
  '# KitanSocialHub — pointed at the NEW Supabase project (owner-controlled).',
  '# Old OnSpace backend config is preserved in .env.old-backend',
  `VITE_SUPABASE_URL=${NEW.url}`,
  `VITE_SUPABASE_ANON_KEY=${NEW.anon}`,
  '',
].join('\n');
fs.writeFileSync(envPath, newEnv);
console.log('Frontend .env now points at the new Supabase project host:', NEW.url.replace(/^https:\/\/([^.]+).*$/, '$1...'));
console.log('Run `npm run build` and redeploy to apply.');
