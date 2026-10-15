import { NEW, secretHeaders } from './lib/creds.mjs';
for (const fn of ['flw-initiate', 'flw-verify', 'flw-webhook', 'kitan-doc-credit', 'order-download', 'hero-sms', 'fivesim', 'jap']) {
  try {
    const r = await fetch(`${NEW.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { ...secretHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = (await r.text()).slice(0, 100);
    console.log(fn.padEnd(18), '->', r.status, r.status === 404 ? '(not deployed)' : body.replace(/\s+/g, ' '));
  } catch (e) {
    console.log(fn.padEnd(18), '-> ERR', e.message);
  }
}
