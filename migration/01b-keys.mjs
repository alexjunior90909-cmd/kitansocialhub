/**
 * 01b-keys.mjs — determine exactly how the new project's keys behave.
 */
import { NEW, anonHeaders, secretHeaders } from './lib/creds.mjs';

const variants = [
  ['publishable / auth health', NEW.url + '/auth/v1/health', { apikey: NEW.anon }],
  ['publishable / rest root', NEW.url + '/rest/v1/', { apikey: NEW.anon, Authorization: 'Bearer ' + NEW.anon }],
  ['publishable / rest table probe', NEW.url + '/rest/v1/products?select=id&limit=1', { apikey: NEW.anon, Authorization: 'Bearer ' + NEW.anon }],
  ['secret / rest root', NEW.url + '/rest/v1/', { apikey: NEW.secret, Authorization: 'Bearer ' + NEW.secret }],
  ['secret / rest table probe', NEW.url + '/rest/v1/products?select=id&limit=1', { apikey: NEW.secret, Authorization: 'Bearer ' + NEW.secret }],
  ['secret / storage health', NEW.url + '/storage/v1/status', { apikey: NEW.secret, Authorization: 'Bearer ' + NEW.secret }],
  ['secret / bucket list', NEW.url + '/storage/v1/bucket', { apikey: NEW.secret, Authorization: 'Bearer ' + NEW.secret }],
];

for (const [label, url, headers] of variants) {
  try {
    const r = await fetch(url, { headers });
    const body = await r.text();
    console.log(label.padEnd(32), '->', r.status, body.slice(0, 120).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(label.padEnd(32), '-> ERR', e.message);
  }
}
