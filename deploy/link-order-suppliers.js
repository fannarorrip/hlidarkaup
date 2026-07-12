#!/usr/bin/env node
// Connect innkaupapantanir birgjar → lánadrottnar.
// For every distinct supplier_name on acc.order_templates / acc.order_schedule, resolve a
// lánadrottinn (acc.suppliers): reuse an existing supplier, MOVE a matching viðskiptamaður
// (shop.customers) into lánadrottnar carrying its kennitala/contacts, or create a new bare
// supplier — then set order_templates.supplier_id + order_schedule.supplier_id.
//
// DRY RUN by default — prints the full plan and mutates NOTHING. Pass --apply to write.
// Idempotent: re-running only fills gaps. Run on dev first, then Rocky.
//   node deploy/link-order-suppliers.js            # dry run (the plan)
//   node deploy/link-order-suppliers.js --apply    # execute
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const digits = (s) => (s || "").replace(/\D/g, "");

// Load DATABASE_URL from .env.local without printing it.
const env = {};
for (const ln of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = ln.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
const { Pool } = require("pg");
const pool = new Pool({ connectionString: env.DATABASE_URL });

// Phones + freight rules from the store-data seed (to enrich newly-created suppliers).
let schedulePhones = {}, freightRules = {};
try {
  const sched = require("./seed-store-data/schedule.json");
  const arr = Array.isArray(sched) ? sched : (sched.entries || sched.schedule || []);
  for (const e of arr) {
    const ph = (e.note || "").match(/s[íi]mi\s*([\d\- ]{6,})/i);
    if (ph && e.supplier) schedulePhones[e.supplier] = ph[1].trim();
  }
} catch {}
try {
  const fr = require("./seed-store-data/freight.json");
  const arr = Array.isArray(fr) ? fr : Object.values(fr);
  for (const e of arr) if (e && e.supplier && e.rule) freightRules[e.supplier] = e.rule;
} catch {}

// Explicit resolutions for names trigram can't get right on its own.
const SKIP = new Set(["Banki (skiptimynt)", "Bakarí (innanhúss)"]);
// order-list name → kennitala of the customer it really is (abbreviations / weak trigram).
const TO_CUSTOMER_KT = {
  "CCEP": "4701691419", "CCEP (Kók)": "4701691419", "Gos (CCEP/Coca-Cola)": "4701691419",
  "SS": "6002692089", "Lýsi": "4402695089", "Mata/Stjörnusalat": "6205973099",
  "Hlíð Ólafsfirði (Betri vörur, lax)": "4505082250", "Laugarmýri": "5701080420",
  "Nesbúegg (Lífland)": "7112032140", "FitFood": "6411080140", "Gunnars majónes": "4303140410",
  "Vilko": "4108002170", "Grænmeti (Búrfell/Bananar)": "5303901289",
  "Kjarnafæði/Norðlenska": "5812891899",
};
// order-list name → an existing acc.suppliers name (already registered creditors).
const TO_SUPPLIER = { "MS": "Mjólkursamsalan", "Mjólkursamlagið (MS)": "Mjólkursamsalan", "Mjólkursamsalan(MS)": "Mjólkursamsalan" };
// order-list names with no real counterpart → create a fresh bare supplier.
const FORCE_CREATE = new Set(["Ali", "Alí", "Tóbak", "Kartöflur", "Harðfiskur", "Eysteinseyri Tálknafirði", "Hnoðmör (Marinó Bjarnason)", "Hreinsegg"]);
const CUST_MATCH_MIN = 0.5; // auto-move a customer only at/above this trigram similarity

async function main() {
  const q = async (s, p) => (await pool.query(s, p)).rows;
  try { await q("create extension if not exists pg_trgm"); } catch {}

  const names = (await q(
    `select supplier_name from acc.order_templates where is_active and supplier_name is not null
     union select supplier_name from acc.order_schedule where is_active and supplier_name is not null
     order by 1`)).map((r) => r.supplier_name);

  const supIdByKt = new Map(), supIdByName = new Map();
  const plan = { existing: [], move: [], create: [], skip: [], review: [] };
  let linkedTpl = 0, linkedSch = 0;

  const linkName = async (name, supplierId) => {
    if (!APPLY || !supplierId) return;
    linkedTpl += (await q(`update acc.order_templates set supplier_id=$1 where supplier_name=$2 and (supplier_id is null or supplier_id<>$1) returning id`, [supplierId, name])).length;
    linkedSch += (await q(`update acc.order_schedule set supplier_id=$1 where supplier_name=$2 and (supplier_id is null or supplier_id<>$1) returning id`, [supplierId, name])).length;
  };

  const existingSupplierByName = async (name) =>
    (await q(`select id, name from acc.suppliers where is_active and not coalesce(is_generic,false)
              and (unaccent(lower(name))=unaccent(lower($1)) or similarity(name,$1)>0.5)
              order by similarity(name,$1) desc limit 1`, [name]))[0] || null;

  const findCustomer = async (name, kt) => {
    if (kt) return (await q(`select * from shop.customers where regexp_replace(coalesce(kennitala,''),'\\D','','g')=$1 and not coalesce(is_generic,false) limit 1`, [digits(kt)]))[0] || null;
    return (await q(`select *, round(similarity(name,$1)::numeric,2) sim from shop.customers
                     where coalesce(is_active,true) and not coalesce(is_generic,false) and similarity(name,$1)>=$2
                     order by similarity(name,$1) desc limit 1`, [name, CUST_MATCH_MIN]))[0] || null;
  };

  // AR exposure of a customer we're about to move (so the plan warns about deactivate-vs-delete).
  const custExposure = async (id) => {
    try {
      const vc = Number((await q(`select count(*) c from acc.vouchers where customer_id=$1`, [id]))[0]?.c || 0);
      return { balance: 0, vouchers: vc };
    } catch { return { balance: 0, vouchers: 0 }; }
  };

  const createSupplierFromCustomer = async (c, srcName) => {
    let sid = null;
    if (c.kennitala) sid = (await q(`select id from acc.suppliers where regexp_replace(kennitala,'\\D','','g')=$1 limit 1`, [digits(c.kennitala)]))[0]?.id || null;
    if (sid) { await q(`update acc.suppliers set is_active=true where id=$1`, [sid]); }
    else sid = (await q(
      `insert into acc.suppliers (name, kennitala, address, postal_code, city, phone, email, payment_terms_days, ap_account, freight_rule, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'9300',$9,true) returning id`,
      [c.name, c.kennitala, c.address, c.postal_code, c.city, c.phone || schedulePhones[srcName] || null, c.email, c.payment_terms_days ?? 0, freightRules[srcName] || null]))[0].id;
    // remove from customer register (delete if no FK history, else deactivate)
    let removed = "deleted";
    try { await q(`delete from shop.customers where id=$1`, [c.id]); }
    catch { await q(`update shop.customers set is_active=false where id=$1`, [c.id]); removed = "deactivated"; }
    return { sid, removed };
  };

  const createBareSupplier = async (name) => {
    // find-or-create by exact name so re-runs never duplicate a bare supplier
    const ex = (await q(`select id from acc.suppliers where unaccent(lower(name))=unaccent(lower($1)) and coalesce(is_active,true) limit 1`, [name]))[0];
    if (ex) return ex.id;
    return (await q(`insert into acc.suppliers (name, phone, payment_terms_days, ap_account, freight_rule, is_active)
              values ($1,$2,0,'9300',$3,true) returning id`, [name, schedulePhones[name] || null, freightRules[name] || null]))[0].id;
  };

  const existingSupplierByKt = async (kt) =>
    (await q(`select id, name from acc.suppliers where regexp_replace(coalesce(kennitala,''),'\\D','','g')=$1 and coalesce(is_active,true) limit 1`, [digits(kt)]))[0] || null;

  for (const name of names) {
    if (SKIP.has(name)) { plan.skip.push(name); continue; }
    let sid = null;

    // (a) explicit → an existing supplier by name (e.g. MS → Mjólkursamsalan)
    if (TO_SUPPLIER[name]) {
      const s = await existingSupplierByName(TO_SUPPLIER[name]);
      if (s) { await linkName(name, s.id); plan.existing.push(`${name} → ${s.name}`); continue; }
    }

    // (b) explicit customer kennitala → REUSE the supplier for that kt if it already exists
    //     (a sibling variant moved the customer), else move the customer now.
    const okt = TO_CUSTOMER_KT[name];
    if (okt) {
      const dk = digits(okt);
      sid = supIdByKt.get(dk) || (APPLY ? (await existingSupplierByKt(dk))?.id : null);
      if (sid) { supIdByKt.set(dk, sid); await linkName(name, sid); plan.existing.push(`${name} → (reuse)`); continue; }
      const cust = await findCustomer(name, okt);
      if (cust) {
        if (APPLY) { const r = await createSupplierFromCustomer(cust, name); sid = r.sid; supIdByKt.set(dk, sid); }
        await linkName(name, sid); plan.move.push(`${name} → ${cust.name}${cust.kennitala ? " [" + cust.kennitala + "]" : ""}`); continue;
      }
      if (APPLY) sid = await createBareSupplier(name);
      await linkName(name, sid); plan.review.push(`${name} (kt fannst ekki → nýr tómur; skoða)`); continue;
    }

    // (c) forced bare create (no counterpart in either register)
    if (FORCE_CREATE.has(name)) {
      sid = supIdByName.get("__c__" + name);
      if (APPLY && !sid) { sid = await createBareSupplier(name); supIdByName.set("__c__" + name, sid); }
      await linkName(name, sid); plan.create.push(`${name} (nýr, tómur)`); continue;
    }

    // (d) an existing supplier by this name (catches name-variants after a sibling was moved)
    const self = await existingSupplierByName(name);
    if (self) { await linkName(name, self.id); plan.existing.push(`${name} → ${self.name}`); continue; }

    // (e) move a matching customer (trigram) — reuse if a sibling already created the supplier
    const cust = await findCustomer(name, null);
    if (cust) {
      const dk = cust.kennitala ? digits(cust.kennitala) : null;
      sid = dk ? supIdByKt.get(dk) : null;
      if (!sid && APPLY) { const r = await createSupplierFromCustomer(cust, name); sid = r.sid; if (dk) supIdByKt.set(dk, sid); }
      await linkName(name, sid);
      plan.move.push(`${name} → ${cust.name}${cust.kennitala ? " [" + cust.kennitala + "]" : ""}${cust.sim ? " (" + cust.sim + ")" : ""}`);
      continue;
    }

    // (f) nothing confident → bare, flag for review
    sid = supIdByName.get("__c__" + name);
    if (APPLY && !sid) { sid = await createBareSupplier(name); supIdByName.set("__c__" + name, sid); }
    await linkName(name, sid); plan.review.push(`${name} (enginn viðskiptam. fannst → nýr tómur; skoða)`);
  }

  const pr = (title, arr) => { if (arr.length) { console.log(`\n== ${title} (${arr.length}) ==`); arr.forEach((x) => console.log("  " + x)); } };
  console.log(`\n${APPLY ? "✅ APPLIED" : "🔎 DRY RUN (nothing written)"} — ${names.length} order-list birgjar\n`);
  pr("MOVE viðskiptamaður → lánadrottinn", plan.move);
  pr("Reuse existing lánadrottinn", plan.existing);
  pr("Create NEW (matched a supplier list, no viðskiptam.)", plan.create);
  pr("REVIEW — created bare, please check", plan.review);
  pr("Skipped (not a real birgir)", plan.skip);
  if (APPLY) console.log(`\nLinked: ${linkedTpl} templates + ${linkedSch} schedule rows to their lánadrottinn.`);
  else console.log(`\nRun again with --apply to execute. (Templates/schedule supplier_id will be linked.)`);
  await pool.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
