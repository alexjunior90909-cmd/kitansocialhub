/**
 * creds.mjs — loads credentials from local files only.
 * NEVER prints secret values. Callers must not log the returned object.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.resolve(here, '..');
const root = path.resolve(migrationDir, '..');

function parseEnvFile(text) {
  const out = {};
  for (const m of text.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)\s*$/gm)) {
    out[m[1]] = m[2];
  }
  return out;
}

// New project credentials: migration/.env/migration-notes.txt..txt (as placed by owner)
const notesPath = path.join(migrationDir, '.env', 'migration-notes.txt..txt');
const notes = parseEnvFile(fs.readFileSync(notesPath, 'utf8'));

// Old project credentials: project .env (source config; anon key only)
const oldEnv = parseEnvFile(fs.readFileSync(path.join(root, '.env'), 'utf8'));

export const NEW = {
  url: notes.NEW_SUPABASE_URL,
  anon: notes.NEW_SUPABASE_ANON_KEY,
  secret: notes.NEW_SUPABASE_SERVICE_ROLE_KEY,
};
export const OLD = {
  url: oldEnv.VITE_SUPABASE_URL,
  anon: oldEnv.VITE_SUPABASE_ANON_KEY,
};

export function anonHeaders(url, key) {
  return { apikey: key, Authorization: 'Bearer ' + key };
}
export function secretHeaders() {
  return { apikey: NEW.secret, Authorization: 'Bearer ' + NEW.secret, 'Content-Type': 'application/json' };
}

export const STATE_DIR = path.join(root, 'migration', 'state');
fs.mkdirSync(STATE_DIR, { recursive: true });

export function loadState(name, fallback) {
  const p = path.join(STATE_DIR, name + '.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return fallback;
}
export function saveState(name, obj) {
  fs.writeFileSync(path.join(STATE_DIR, name + '.json'), JSON.stringify(obj, null, 2));
}
