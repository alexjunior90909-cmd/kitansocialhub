import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync('state/source-schema.json', 'utf8'));
console.log(JSON.stringify(s.products, null, 1).slice(0, 1100));
console.log('\n--- payments.metadata ---');
console.log(JSON.stringify(s.payments.properties.metadata));
console.log('\n--- products.images ---');
console.log(JSON.stringify(s.products.properties.images));
console.log('\n--- wallets ---');
console.log(JSON.stringify(s.wallets, null, 1).slice(0, 700));
