#!/usr/bin/env node
// Import the old store's extracted operational data (deploy/seed-store-data/) into the DB:
//   gold/*.csv       -> products.cost_price (matched by barcode, then exact name)
//                       + missing barcode mappings (exact-name matches only)
//                       + retail-price deviation report (NEVER auto-changes our retail prices)
//   templates/*.csv  -> acc.order_templates + lines (order forms per supplier)
//   pars/*.csv       -> par-level templates (min/max/daily_rate lines)
//   schedule.json    -> acc.order_schedule (the weekday ordering heartbeat)
//   freight.json     -> acc.suppliers.freight_rule (by name, when the supplier exists)
//   pricing-rules.json -> acc.pricing_rules
// Idempotent: safe to re-run. Usage:  node deploy/import-store-data.js [seed-dir]
// DB: reads DATABASE_URL from env or .env.local next to the repo root.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const SEED = process.argv[2] || path.join(ROOT, "deploy", "seed-store-data");

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const ln of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = ln.match(/^DATABASE_URL=(.+)$/);
      if (m) return m[1].trim();
    }
  }
  throw new Error("DATABASE_URL vantar");
}

// Minimal CSV parser (handles quoted fields with commas/newlines)
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const digits = (s) => String(s || "").replace(/\D/g, "");
const num = (s) => { const n = Number(String(s ?? "").replace(/\./g, (m, i, str) => (/,\d/.test(str) ? "" : m)).replace(",", ".")); return Number.isFinite(n) && String(s).trim() !== "" ? n : null; };
const normName = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
function barcodeVariants(ean) {
  const e = digits(ean);
  if (e.length < 8) return [];
  const v = new Set([e]);
  if (/^\d{12}$/.test(e)) v.add("0" + e);
  if (/^0\d{12}$/.test(e)) v.add(e.slice(1));
  return [...v];
}

async function main() {
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  const q = (text, params) => client.query(text, params);
  const report = { costUpdated: 0, barcodesAdded: 0, unmatched: [], retailDeviations: [], templates: 0, templateLines: 0, schedule: 0, pricingRules: 0, freight: 0, freightUnmatchedSuppliers: [] };

  // ── product lookup maps ────────────────────────────────────────────────────
  const bcRows = (await q(`select b.barcode, b.product_number from shop.product_barcodes b`)).rows;
  const byBarcode = new Map(bcRows.map((r) => [r.barcode, r.product_number]));
  const prodRows = (await q(`select product_number, name, price_gross from shop.products`)).rows;
  const byName = new Map();
  for (const p of prodRows) {
    const k = normName(p.name);
    if (!byName.has(k)) byName.set(k, p); else byName.set(k, null); // ambiguous names -> null
  }
  const byNumber = new Map(prodRows.map((p) => [p.product_number, p]));

  function matchRow(r) {
    for (const v of barcodeVariants(r.ean)) {
      const pn = byBarcode.get(v);
      if (pn) return { pn, how: "barcode" };
    }
    const p = byName.get(normName(r.name));
    if (p) return { pn: p.product_number, how: "name" };
    return null;
  }

  // ── 1. gold price files ────────────────────────────────────────────────────
  const goldDir = path.join(SEED, "gold");
  for (const f of fs.existsSync(goldDir) ? fs.readdirSync(goldDir).filter((x) => x.endsWith(".csv")) : []) {
    const rows = parseCsv(fs.readFileSync(path.join(goldDir, f), "utf8"));
    for (const r of rows) {
      if (!r.name && !r.ean) continue;
      const m = matchRow(r);
      if (!m) { report.unmatched.push({ file: f, supplier: r.supplier, ean: r.ean, name: r.name }); continue; }
      const cost = num(r.cost);
      if (cost && cost > 0) {
        await q(`update shop.products set cost_price = $1, updated_at = now() where product_number = $2`, [cost, m.pn]);
        report.costUpdated++;
      }
      // add the barcode mapping when we matched by exact name and the barcode is unknown
      const e = digits(r.ean);
      if (m.how === "name" && e.length >= 8 && !byBarcode.has(e)) {
        await q(`insert into shop.product_barcodes (barcode, product_number) values ($1,$2) on conflict do nothing`, [e, m.pn]);
        byBarcode.set(e, m.pn);
        report.barcodesAdded++;
      }
      // retail deviation: file retail vs our price_gross (report only — no auto-change)
      const retail = num(r.retail);
      const ours = byNumber.get(m.pn)?.price_gross;
      if (retail && ours && Math.abs(retail - ours) / ours > 0.02) {
        report.retailDeviations.push({ product: m.pn, name: r.name, supplier: r.supplier, fileRetail: retail, ourPrice: ours });
      }
    }
  }

  // ── 2. templates + pars ────────────────────────────────────────────────────
  async function importTemplate(file, kind) {
    const rows = parseCsv(fs.readFileSync(file, "utf8"));
    if (!rows.length) return;
    const supplier = rows.find((r) => r.supplier)?.supplier || path.basename(file, ".csv");
    const tname = kind === "pars" ? "Lágmarksbirgðir" : "Pöntunarlisti";
    const t = (await q(
      `insert into acc.order_templates (supplier_name, name, source)
         values ($1,$2,$3)
       on conflict (supplier_name, name) do update set source = excluded.source
       returning id`, [supplier, tname, path.basename(file)])).rows[0];
    await q(`delete from acc.order_template_lines where template_id = $1`, [t.id]); // idempotent re-seed
    let n = 0;
    for (const r of rows) {
      if (!r.name) continue;
      const m = matchRow(r);
      await q(
        `insert into acc.order_template_lines
           (template_id, line_no, vnr, ean, product_number, name, default_qty, unit, min_qty, max_qty, daily_rate, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [t.id, ++n, r.vnr || null, digits(r.ean) || null, m?.pn ?? null, r.name,
         num(r.default_qty), r.unit || null, num(r.min_qty), num(r.max_qty), num(r.daily_rate), r.note || null]);
      report.templateLines++;
    }
    report.templates++;
  }
  for (const sub of ["templates", "pars"]) {
    const dir = path.join(SEED, sub);
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".csv")) : []) {
      await importTemplate(path.join(dir, f), sub);
    }
  }

  // ── 3. schedule ────────────────────────────────────────────────────────────
  const schedPath = path.join(SEED, "schedule.json");
  if (fs.existsSync(schedPath)) {
    const entries = JSON.parse(fs.readFileSync(schedPath, "utf8")).entries || [];
    for (const e of entries) {
      if (!e.supplier || !e.weekday) continue;
      await q(
        `insert into acc.order_schedule (weekday, supplier_name, deadline, note, source)
           values ($1,$2,$3::time,$4,$5)
         on conflict (weekday, supplier_name) do update
           set deadline = excluded.deadline, note = excluded.note, source = excluded.source`,
        [e.weekday, e.supplier, e.deadline || null, e.note || null, e.source || null]);
      report.schedule++;
    }
  }

  // ── 4. pricing rules ───────────────────────────────────────────────────────
  const prPath = path.join(SEED, "pricing-rules.json");
  if (fs.existsSync(prPath)) {
    const entries = JSON.parse(fs.readFileSync(prPath, "utf8")).entries || [];
    for (const e of entries) {
      if (!e.category || !e.rule) continue;
      await q(
        `insert into acc.pricing_rules (category, rule, multiplier_min, multiplier_max, rounding, source)
           values ($1,$2,$3,$4,$5,$6)
         on conflict (category) do update
           set rule = excluded.rule, multiplier_min = excluded.multiplier_min,
               multiplier_max = excluded.multiplier_max, rounding = excluded.rounding, source = excluded.source`,
        [e.category, e.rule, e.multiplier_min ?? null, e.multiplier_max ?? null, e.rounding || null, e.source || null]);
      report.pricingRules++;
    }
  }

  // ── 5. freight rules onto suppliers (by name, when registered) ────────────
  const frPath = path.join(SEED, "freight.json");
  if (fs.existsSync(frPath)) {
    const entries = JSON.parse(fs.readFileSync(frPath, "utf8")).entries || [];
    for (const e of entries) {
      if (!e.supplier || !e.rule) continue;
      const r = await q(`update acc.suppliers set freight_rule = $1 where lower(name) like lower($2) returning id`, [e.rule, "%" + e.supplier + "%"]);
      if (r.rowCount) report.freight++;
      else report.freightUnmatchedSuppliers.push(e.supplier);
    }
  }

  await client.end();
  fs.writeFileSync(path.join(SEED, "import-report.json"), JSON.stringify(report, null, 1), "utf8");
  console.log(JSON.stringify({
    costUpdated: report.costUpdated, barcodesAdded: report.barcodesAdded,
    unmatched: report.unmatched.length, retailDeviations: report.retailDeviations.length,
    templates: report.templates, templateLines: report.templateLines,
    schedule: report.schedule, pricingRules: report.pricingRules,
    freight: report.freight, freightUnmatched: report.freightUnmatchedSuppliers.length,
  }, null, 1));
  console.log("Full report: " + path.join(SEED, "import-report.json"));
}

main().catch((e) => { console.error(e); process.exit(1); });
