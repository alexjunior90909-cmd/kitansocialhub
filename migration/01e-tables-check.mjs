import { NEW, anonHeaders } from './lib/creds.mjs';
for (const t of ['products', 'jap_services', 'wallets', 'payments', 'order_content', 'app_settings']) {
  const r = await fetch(`${NEW.url}/rest/v1/${t}?select=*&limit=1`, { headers: { ...anonHeaders(NEW.url, NEW.anon), Prefer: 'count=exact' } });
  const cr = r.headers.get('content-range');
  console.log(t.padEnd(16), '->', r.status, r.status === 200 ? 'rows: ' + (cr ? cr.split('/')[1] : '?') : (await r.text()).slice(0, 100));
}
