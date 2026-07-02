// Import the real product catalog from Regla, scoped to a list of product numbers
// taken from a sales-report Excel ("Vörur í reglu.xlsx": columns Vara, Vörunr., …).
//
// For each number in the list:
//   - if Regla still has it  → upsert full master data (price, VAT, unit, stock)   [source='regla']
//   - if Regla no longer has it → create a basic record from the Excel
//                                 (name + derived VAT + average net price)         [source='sales-import']
// Then PRUNE: delete any product NOT in the list, so shop.products == the list.
// Re-runnable (upsert). Barcodes are attached separately by scripts/import-barcodes.js.
//
// Usage:
//   node scripts/import-products-from-list.js "C:/Users/.../Vörur í reglu.xlsx"
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const XLSX = require('xlsx');

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// Snap a derived VAT rate to the legal Icelandic steps (24 / 11 / 0).
function deriveVat(net, vsk) {
  if (net > 0) {
    const r = (vsk / net) * 100;
    for (const cand of [24, 11, 0]) if (Math.abs(r - cand) <= 1) return cand;
    return Math.round(r);
  }
  return 24;
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

const UPSERT_REGLA = `insert into shop.products
  (product_number, regla_id, name, description, unit_price_net, vat_key, vat_rate,
   stock_quantity, is_stock_controlled, product_group, unit_code, use_scale, allow_discount, source, synced_at)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'regla',now())
  on conflict (product_number) do update set
    regla_id=excluded.regla_id, name=excluded.name, description=excluded.description,
    unit_price_net=excluded.unit_price_net, vat_key=excluded.vat_key, vat_rate=excluded.vat_rate,
    stock_quantity=excluded.stock_quantity, is_stock_controlled=excluded.is_stock_controlled,
    product_group=excluded.product_group, unit_code=excluded.unit_code, use_scale=excluded.use_scale,
    allow_discount=excluded.allow_discount, source='regla', synced_at=now()`;

function reglaParams(p) {
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

// Basic record from the sales report when Regla no longer has the product.
// Does not clobber an existing Regla-sourced row's stock/unit fields.
const UPSERT_BASIC = `insert into shop.products
  (product_number, name, unit_price_net, vat_rate, product_group, source, synced_at)
  values ($1,$2,$3,$4,$5,'sales-import',now())
  on conflict (product_number) do update set
    name=excluded.name, unit_price_net=excluded.unit_price_net, vat_rate=excluded.vat_rate,
    product_group=coalesce(excluded.product_group, shop.products.product_group), synced_at=now()`;

(async () => {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) throw new Error('Pass the Excel path: node scripts/import-products-from-list.js "<path.xlsx>"');
  const env = loadEnv();
  const base = env.REGLA_BASE_URL, user = env.REGLA_USERNAME, pass = env.REGLA_PASSWORD;
  const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  // 1) Read the list from the Excel.
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const list = new Map(); // number -> {name, vat, netUnit, group}
  for (const r of rows) {
    const num = r['Vörunr.'] == null ? '' : String(r['Vörunr.']).trim();
    const name = r['Vara'] == null ? '' : String(r['Vara']).trim();
    if (!num || !name) continue; // skip totals / blank rows
    const upph = Number(r['Upph.']) || 0, afsl = Number(r['Afsl.']) || 0, vsk = Number(r['Vsk.']) || 0, magn = Number(r['Magn']) || 0;
    const net = upph - afsl;
    list.set(num, {
      name,
      vat: deriveVat(net, vsk),
      netUnit: magn > 0 ? Math.round((net / magn) * 10000) / 10000 : 0,
      group: r['Vöruflokkur'] == null ? null : String(r['Vöruflokkur']).trim(),
    });
  }
  console.log(`List: ${list.size} unique products from ${path.basename(xlsxPath)}`);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // 2) Pull the full Regla catalog (paginate), keep only those in the list.
  const token = await reglaLogin(base, user, pass);
  console.log('Regla login ok. Scanning catalog…');
  const reglaByNum = new Map();
  const pageSize = 200;
  let index = 0, scanned = 0;
  while (true) {
    const page = await searchPage(base, token, index, pageSize);
    if (!page.length) break;
    for (const p of page) {
      const pn = String(p.ProductNumber ?? '').trim();
      if (pn && list.has(pn)) reglaByNum.set(pn, p);
    }
    scanned += page.length;
    index += page.length;
    if (scanned % 2000 === 0) console.log(`  scanned ${scanned} Regla products, matched ${reglaByNum.size}/${list.size}…`);
    if (page.length < pageSize) break;
  }
  console.log(`Scanned ${scanned} Regla products. Matched ${reglaByNum.size} of ${list.size} list items.`);

  // 3) Upsert: Regla master data where matched, basic Excel record otherwise.
  let matched = 0, basic = 0;
  await client.query('begin');
  try {
    for (const [num, info] of list) {
      const rp = reglaByNum.get(num);
      if (rp) { await client.query(UPSERT_REGLA, reglaParams(rp)); matched++; }
      else { await client.query(UPSERT_BASIC, [num, info.name, info.netUnit, info.vat, info.group]); basic++; }
    }
    // 4) Optionally prune everything not in the list (DESTRUCTIVE — opt-in).
    //    Default: additive only. Report how many would be removed.
    const nums = Array.from(list.keys());
    const prune = process.env.PRUNE === '1' || process.argv.includes('--prune');
    let prunedCount;
    if (prune) {
      const del = await client.query('delete from shop.products where not (product_number = any($1::text[]))', [nums]);
      prunedCount = del.rowCount;
    } else {
      const { rows: pc } = await client.query('select count(*)::int n from shop.products where not (product_number = any($1::text[]))', [nums]);
      prunedCount = pc[0].n;
    }
    await client.query('commit');
    console.log(`Upserted: ${matched} from Regla + ${basic} basic (Excel-only). ` +
      (prune ? `Pruned ${prunedCount} products not in the list.` : `${prunedCount} products NOT in the list remain — run again with --prune to remove them.`));
  } catch (e) {
    await client.query('rollback');
    throw e;
  }

  const { rows: stat } = await client.query(
    `select count(*)::int total,
            count(*) filter (where source='regla')::int regla,
            count(*) filter (where source='sales-import')::int sales,
            count(*) filter (where price_gross > 0)::int priced
       from shop.products`);
  console.log(`Done. shop.products = ${stat[0].total} (regla=${stat[0].regla}, sales-import=${stat[0].sales}, priced=${stat[0].priced}).`);
  console.log('Next: node scripts/import-barcodes.js   (attaches barcodes for the catalog)');
  await client.end();
})().catch((e) => { console.error('IMPORT ERROR:', e.message); process.exit(1); });
