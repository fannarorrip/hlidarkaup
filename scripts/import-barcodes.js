// Import barcodes from Regla into Postgres shop.product_barcodes.
// Pulls GetAllProductBarcodes once, inserts those whose product is in shop.products.
// Usage: DATABASE_URL=postgres://... node scripts/import-barcodes.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

(async () => {
  const env = loadEnv();
  const base = env.REGLA_BASE_URL, user = env.REGLA_USERNAME, pass = env.REGLA_PASSWORD;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const login = await (await fetch(`${base}/Login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json();
  if (!login?.Result?.Success) throw new Error('Regla login failed');
  const token = login.Result.Messages[0];

  const { rows: prodRows } = await client.query('select product_number from shop.products');
  const have = new Set(prodRows.map((r) => r.product_number));
  console.log('Products in catalog:', have.size);

  const res = await (await fetch(`${base}/GetAllProductBarcodes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  if (!res?.Result?.Success) throw new Error('GetAllProductBarcodes failed');
  const all = res.Returned || [];
  console.log('Barcodes in Regla:', all.length);

  const stmt = `insert into shop.product_barcodes (barcode, product_number)
                values ($1, $2)
                on conflict (barcode) do update set product_number = excluded.product_number`;
  let n = 0;
  await client.query('begin');
  try {
    for (const b of all) {
      const pn = String(b.ProductNumber || '').trim();
      const bc = String(b.Barcode || '').trim();
      if (!bc || !pn || !have.has(pn)) continue;
      await client.query(stmt, [bc, pn]);
      n++;
    }
    await client.query('commit');
  } catch (e) { await client.query('rollback'); throw e; }

  const { rows } = await client.query('select count(*)::int c from shop.product_barcodes');
  console.log(`Imported ${n} barcodes for catalog products. Table now has ${rows[0].c}.`);
  await client.end();
})().catch((e) => { console.error('BARCODE IMPORT ERROR:', e.message); process.exit(1); });
