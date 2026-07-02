// Import products from Regla into Postgres shop.products.
// Usage: DATABASE_URL=postgres://user@host:port/db node scripts/import-products.js [limit]
// Re-runnable: upserts by product_number. Pass a curated list later via importList().
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const env = {};
  const p = path.join(__dirname, '..', '.env.local');
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function reglaLogin(base, user, pass) {
  const r = await fetch(`${base}/Login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
  const d = await r.json();
  if (!d?.Result?.Success) throw new Error('Regla login failed');
  return d.Result.Messages[0];
}

async function searchPage(base, token, indexFrom, count) {
  const r = await fetch(`${base}/SearchProducts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, search: '', indexFrom, maxRecordCount: count }) });
  const d = await r.json();
  if (!d?.Result?.Success) throw new Error('SearchProducts failed: ' + JSON.stringify(d?.Result?.Messages));
  return d.Returned ?? [];
}

const UPSERT = `insert into shop.products
  (product_number, regla_id, name, description, unit_price_net, vat_key, vat_rate,
   stock_quantity, is_stock_controlled, product_group, unit_code, use_scale, allow_discount, source, synced_at)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'regla',now())
  on conflict (product_number) do update set
    regla_id=excluded.regla_id, name=excluded.name, description=excluded.description,
    unit_price_net=excluded.unit_price_net, vat_key=excluded.vat_key, vat_rate=excluded.vat_rate,
    stock_quantity=excluded.stock_quantity, is_stock_controlled=excluded.is_stock_controlled,
    product_group=excluded.product_group, unit_code=excluded.unit_code, use_scale=excluded.use_scale,
    allow_discount=excluded.allow_discount, synced_at=now()`;

function rowParams(p) {
  return [
    String(p.ProductNumber ?? '').trim(),
    p.ID ?? null,
    p.Name ?? '',
    (p.DescriptionShort || p.DescriptionLong || null),
    p.UnitPrice ?? 0,
    p.VatDefinition?.Key ?? null,
    p.VatDefinition?.Percentage ?? 24,
    p.StockQuantity ?? 0,
    !!p.IsInStockControl,
    p.ProductGroupNumber || null,
    p.UnitCode || null,
    !!p.UseScale,
    !!p.AllowDiscount,
  ];
}

(async () => {
  const env = loadEnv();
  const limit = parseInt(process.argv[2] || process.env.IMPORT_LIMIT || '1000', 10);
  const base = env.REGLA_BASE_URL, user = env.REGLA_USERNAME, pass = env.REGLA_PASSWORD;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const token = await reglaLogin(base, user, pass);
  console.log(`Regla login ok. Importing up to ${limit} products...`);

  const pageSize = 100;
  let imported = 0, index = 0;
  await client.query('begin');
  try {
    while (imported < limit) {
      const want = Math.min(pageSize, limit - imported);
      const page = await searchPage(base, token, index, want);
      if (!page.length) break;
      for (const p of page) {
        const params = rowParams(p);
        if (!params[0]) continue;
        await client.query(UPSERT, params);
        imported++;
      }
      index += page.length;
      console.log(`  ${imported} imported...`);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
  const { rows } = await client.query('select count(*)::int n, count(*) filter (where price_gross > 0)::int priced from shop.products');
  console.log(`Done. shop.products has ${rows[0].n} rows (${rows[0].priced} with a gross price > 0).`);
  await client.end();
})().catch(e => { console.error('IMPORT ERROR:', e.message); process.exit(1); });
