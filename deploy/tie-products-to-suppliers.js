#!/usr/bin/env node
// Tie products to their birgi (shop.products.preferred_supplier_id) from the store's own
// per-supplier data: the gold price lists (deploy/seed-store-data/gold/*.csv, one supplier
// each) matched to products by EAN→barcode then exact name, plus product_number lines on
// order templates already linked to a lánadrottinn. Only fills products with NO birgi yet.
//
// DRY RUN by default (writes nothing); pass --apply to write. Idempotent.
//   node deploy/tie-products-to-suppliers.js            # the plan
//   node deploy/tie-products-to-suppliers.js --apply    # execute
const fs = require("fs");
const path = require("path");
const APPLY = process.argv.includes("--apply");
const SEED = path.join(__dirname, "seed-store-data");

const env = {};
for (const ln of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = ln.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
const { Pool } = require("pg");
const pool = new Pool({ connectionString: env.DATABASE_URL });

const digits = (s) => String(s || "").replace(/\D/g, "");
const normName = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
function barcodeVariants(ean) {
  const e = digits(ean); if (e.length < 8) return [];
  const v = new Set([e]);
  if (/^\d{12}$/.test(e)) v.add("0" + e);
  if (/^0\d{12}$/.test(e)) v.add(e.slice(1));
  return [...v];
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split(",").map((h) => h.trim());
  return lines.map((l) => {
    // simple CSV (fields may contain commas only in the trailing note → cap at header length)
    const cells = l.split(",");
    const row = {}; head.forEach((h, i) => row[h] = (i === head.length - 1 ? cells.slice(i).join(",") : cells[i] || "").trim());
    return row;
  });
}

async function main() {
  const q = async (s, p) => (await pool.query(s, p)).rows;

  // product lookup maps (barcode + unambiguous exact name)
  const byBarcode = new Map((await q(`select barcode, product_number from shop.product_barcodes`)).map((r) => [r.barcode, r.product_number]));
  const byName = new Map();
  for (const p of await q(`select product_number, name from shop.products where is_active`)) {
    const k = normName(p.name); byName.set(k, byName.has(k) ? null : p.product_number);
  }
  const matchRow = (r) => {
    for (const v of barcodeVariants(r.ean)) { const pn = byBarcode.get(v); if (pn) return pn; }
    return byName.get(normName(r.name)) || null;
  };

  // Aliases so gold supplier names reuse the lánadrottnar the birgjar migration already made.
  const ALIAS = { "MS": "Mjólkursamsalan", "CCEP": "Coca Cola", "Gunnars (Myllan-Ora)": "Gunnars ehf", "Gunnars": "Gunnars ehf" };

  // supplier resolution: existing lánadrottinn (name) → matching viðskiptamaður (move) → create bare
  const supCache = new Map();
  const resolveSupplier = async (rawName) => {
    if (!rawName) return null;
    if (supCache.has(rawName)) return supCache.get(rawName);
    const name = ALIAS[rawName] || rawName;
    let res;
    const es = (await q(`select id,name from acc.suppliers where coalesce(is_active,true) and not coalesce(is_generic,false) and (unaccent(lower(name))=unaccent(lower($1)) or similarity(name,$1)>0.5) order by similarity(name,$1) desc limit 1`, [name]))[0];
    if (es) res = { id: es.id, how: "existing", label: es.name };
    else {
      const c = (await q(`select id,name,kennitala,address,postal_code,city,phone,email,payment_terms_days from shop.customers where coalesce(is_active,true) and not coalesce(is_generic,false) and similarity(name,$1)>0.5 order by similarity(name,$1) desc limit 1`, [name]))[0];
      if (c) {
        let id = null;
        if (APPLY) {
          id = (await q(`select id from acc.suppliers where regexp_replace(coalesce(kennitala,''),'\\D','','g')=$1 limit 1`, [digits(c.kennitala)]))[0]?.id;
          if (!id) id = (await q(`insert into acc.suppliers (name,kennitala,address,postal_code,city,phone,email,payment_terms_days,ap_account,is_active) values ($1,$2,$3,$4,$5,$6,$7,$8,'9300',true) returning id`, [c.name, c.kennitala, c.address, c.postal_code, c.city, c.phone, c.email, c.payment_terms_days ?? 0]))[0].id;
          try { await q(`delete from shop.customers where id=$1`, [c.id]); } catch { await q(`update shop.customers set is_active=false where id=$1`, [c.id]); }
        }
        res = { id, how: "move", label: c.name };
      } else {
        let id = null;
        if (APPLY) id = (await q(`insert into acc.suppliers (name,payment_terms_days,ap_account,is_active) values ($1,0,'9300',true) returning id`, [name]))[0].id;
        res = { id, how: "create", label: name };
      }
    }
    supCache.set(name, res); return res;
  };

  // product_number → chosen supplier, plus per-source stats
  const assign = new Map(); // product_number -> {supplierName, supId}
  const conflicts = [];
  const perSupplier = new Map();
  const noteAssign = (pn, supName, supId, vnr) => {
    if (assign.has(pn)) { if (assign.get(pn).supName !== supName) conflicts.push({ pn, a: assign.get(pn).supName, b: supName }); return; }
    assign.set(pn, { supName, supId, vnr: (vnr || "").toString().trim() || null });
    perSupplier.set(supName, (perSupplier.get(supName) || 0) + 1);
  };

  // ── source 1: gold price files (per-supplier) ──
  let goldMatched = 0, goldUnmatched = 0;
  const goldDir = path.join(SEED, "gold");
  for (const f of fs.readdirSync(goldDir).filter((x) => x.endsWith(".csv"))) {
    for (const r of parseCsv(fs.readFileSync(path.join(goldDir, f), "utf8"))) {
      if (!r.name && !r.ean) continue;
      const pn = matchRow(r);
      if (!pn) { goldUnmatched++; continue; }
      goldMatched++;
      const s = await resolveSupplier((r.supplier || "").trim());
      if (s) noteAssign(pn, s.label, s.id, r.vnr);
    }
  }

  // ── source 2: order-template lines already linked to a lánadrottinn ──
  const tplRows = await q(`select l.product_number, l.vnr, s.name sup, t.supplier_id
    from acc.order_template_lines l join acc.order_templates t on t.id=l.template_id
    join acc.suppliers s on s.id=t.supplier_id
    where l.product_number is not null and t.supplier_id is not null and t.is_active`);
  for (const r of tplRows) noteAssign(r.product_number, r.sup, r.supplier_id, r.vnr);

  // ── apply ──
  let written = 0;
  if (APPLY) {
    for (const [pn, a] of assign) {
      if (!a.supId) continue;
      written += (await q(`update shop.products set preferred_supplier_id=$1, supplier_item_no=coalesce($3, supplier_item_no), updated_at=now() where product_number=$2 and preferred_supplier_id is null returning product_number`, [a.supId, pn, a.vnr])).length;
    }
  }

  // ── report ──
  console.log(`\n${APPLY ? "✅ APPLIED" : "🔎 DRY RUN (nothing written)"}\n`);
  console.log(`gold rows matched to a product: ${goldMatched} (unmatched: ${goldUnmatched})`);
  console.log(`order-template product lines: ${tplRows.length}`);
  console.log(`\nDistinct products that get a birgi: ${assign.size}`);
  console.log(`  (of 9292 active — the rest have no supplier data; tie them via móttaka/editor over time)`);
  console.log(`\nPer birgi:`);
  for (const [sup, n] of [...perSupplier.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${sup}`);
  if (conflicts.length) { console.log(`\n⚠ ${conflicts.length} products appear under 2 birgjar (first one wins):`); conflicts.slice(0, 10).forEach((c) => console.log(`  ${c.pn}: ${c.a} vs ${c.b}`)); }
  console.log(APPLY ? `\nWrote preferred_supplier_id on ${written} products.` : `\nRun with --apply to write.`);
  await pool.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
