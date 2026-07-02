// Import customers from an exported xlsx into shop.customers.
// Usage: DATABASE_URL=… node scripts/import-customers.js <path-to-xlsx>
const XLSX = require("xlsx");
const { Client } = require("pg");

const file = process.argv[2];
if (!file) { console.error("Usage: node import-customers.js <xlsx>"); process.exit(1); }

const s = (v) => String(v ?? "").trim();

(async () => {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`delete from shop.customers where imported_from = 'vidskiptamenn-xlsx'`);

  let n = 0;
  await client.query("begin");
  try {
    for (const r of rows) {
      const name = s(r["Nafn"]);
      if (!name) continue;
      const kt = s(r["Kennitala"]) || null;
      const addr = [s(r["Heimilisfang"]), s(r["Address2"])].filter(Boolean).join(", ") || null;
      const pnr = s(r["Pnr."]);
      const postal = /^\d{3}$/.test(pnr) ? pnr : null;
      const city = s(r["Staður"]) || null;
      const phone = s(r["Sími"]) || s(r["Farsími"]) || null;
      const email = s(r["Tölvupóstfang"]) || s(r["Tölvupóstfang v. reikn."]) || null;
      const active = s(r["Staða"]).toLowerCase().startsWith("virk");

      await client.query(
        `insert into shop.customers (name, kennitala, address, postal_code, city, phone, email, is_account, is_active, imported_from)
         values ($1,$2,$3,$4,$5,$6,$7,true,$8,'vidskiptamenn-xlsx')`,
        [name, kt, addr, postal, city, phone, email, active],
      );
      n++;
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  const total = (await client.query(`select count(*)::int n from shop.customers`)).rows[0].n;
  console.log(`Imported ${n} customers. Total in shop.customers: ${total}.`);
  await client.end();
})().catch((e) => { console.error("IMPORT ERROR:", e.message); process.exit(1); });
