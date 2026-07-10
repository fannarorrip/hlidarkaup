// Verðbreytingatillögur — the margin-protection loop:
// móttaka confirms a receipt → unit cost differs from before → suggest a new retail price.
// Method priority: (1) SAMA ÁLAGNING — preserve the product's own current multiplier
// (price/old_cost), the most faithful to per-product reality; (2) REGLA — fuzzy-match the
// supplier + product name against acc.pricing_rules (the old store's álagning table).
// Suggestions are queued for HUMAN approval — prices never change silently.
import { query } from "@/lib/db";

export interface CostChange { product_number: string; old_cost: number | null; new_cost: number }

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ð/g, "d").replace(/þ/g, "th").replace(/æ/g, "ae").replace(/ö/g, "o");
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

interface Rule { id: string; category: string; multiplier_min: string | null; multiplier_max: string | null; rounding: string | null }

function matchRule(rules: Rule[], supplierName: string | null, productName: string): Rule | null {
  const st = tokens(supplierName || "");
  const pt = tokens(productName);
  let best: { rule: Rule; score: number } | null = null;
  for (const r of rules) {
    const rt = tokens(r.category);
    let score = 0;
    for (const a of rt) {
      for (const b of st) if (a === b || a.includes(b) || b.includes(a)) { score += 2; break; }
      for (const b of pt) if (a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)))) { score += 3; break; }
    }
    if (score > 0 && (!best || score > best.score)) best = { rule: r, score };
  }
  // require at least a supplier-level hit (score >= 2) to avoid nonsense matches
  return best && best.score >= 2 ? best.rule : null;
}

function applyRounding(price: number, rounding: string | null): number {
  let p = price;
  if (rounding) {
    const r = rounding.toLowerCase();
    if (r.includes("tug")) p = Math.ceil(p / 10) * 10;           // upp í næsta tug
    const plus = r.match(/\+\s*(\d+)\s*kr/);
    if (plus) p += Number(plus[1]);
  }
  return Math.round(p);
}

/** Compute + queue suggestions for cost changes from a confirmed receipt. Best-effort — never throws. */
export async function recordCostChanges(changes: CostChange[], meta: { receiptId: string; supplierName: string | null }): Promise<number> {
  try {
    const real = changes.filter((c) => c.new_cost > 0 && (c.old_cost == null || Math.abs(c.new_cost - c.old_cost) / c.old_cost > 0.001));
    if (!real.length) return 0;
    const rules = await query<Rule>(
      `select id, category, multiplier_min::text, multiplier_max::text, rounding from acc.pricing_rules where is_active`);
    let queued = 0;

    for (const c of real) {
      const p = (await query<{ name: string; price_gross: number | null; vat_rate: string | null }>(
        `select name, price_gross, vat_rate::text from shop.products where product_number = $1`, [c.product_number]))[0];
      if (!p) continue;
      const price = Number(p.price_gross) || 0;

      let suggested = 0, method = "", multiplier: number | null = null;

      // 1) sama álagning — keep the product's own multiplier
      if (c.old_cost && c.old_cost > 0 && price > 0) {
        const m = price / c.old_cost;
        if (m > 1.0 && m < 3.0) {
          suggested = Math.round(c.new_cost * m);
          multiplier = Math.round(m * 1000) / 1000;
          method = `sama álagning (×${multiplier.toLocaleString("is-IS")})`;
        }
      }
      // 2) regla — the old store's álagning table
      if (!suggested) {
        const rule = matchRule(rules, meta.supplierName, p.name);
        if (rule) {
          const m = Number(rule.multiplier_max) || Number(rule.multiplier_min) || 0;
          if (m > 0) {
            suggested = applyRounding(c.new_cost * m, rule.rounding);
            multiplier = m;
            method = `regla: ${rule.category}`;
          }
        }
      }
      if (!suggested || suggested <= 0) continue;
      // skip noise: suggestion within 1% of the current price
      if (price > 0 && Math.abs(suggested - price) / price <= 0.01) continue;

      await query(`delete from acc.price_suggestions where product_number = $1 and status = 'pending'`, [c.product_number]);
      await query(
        `insert into acc.price_suggestions
           (product_number, product_name, supplier_name, receipt_id, old_cost, new_cost, current_price, suggested_price, method, multiplier)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [c.product_number, p.name, meta.supplierName, meta.receiptId, c.old_cost, c.new_cost, price, suggested, method, multiplier]);
      queued++;
    }
    return queued;
  } catch (e) {
    console.error("recordCostChanges failed:", e);
    return 0;
  }
}

export interface SuggestionRow {
  id: string; product_number: string; product_name: string; supplier_name: string | null;
  old_cost: string | null; new_cost: string; current_price: number; suggested_price: number;
  method: string; created_at: string;
}

export function listPendingSuggestions() {
  return query<SuggestionRow>(
    `select id, product_number, product_name, supplier_name, old_cost::text, new_cost::text,
            current_price, suggested_price, method, created_at::text
       from acc.price_suggestions where status = 'pending' order by created_at desc`);
}

/** Apply: price_gross is a GENERATED column (round(unit_price_net * (1+vat))), so we set the
 *  net price derived from the suggested gross and let the gross regenerate. */
export async function applySuggestion(id: string): Promise<{ ok: boolean; message?: string }> {
  const s = (await query<{ product_number: string; suggested_price: number }>(
    `select product_number, suggested_price from acc.price_suggestions where id = $1 and status = 'pending'`, [id]))[0];
  if (!s) return { ok: false, message: "Tillaga fannst ekki (eða þegar afgreidd)." };
  await query(
    `update shop.products
        set unit_price_net = round($1::numeric / (1 + coalesce(vat_rate, 0) / 100.0), 4),
            updated_at = now()
      where product_number = $2`,
    [s.suggested_price, s.product_number]);
  await query(`update acc.price_suggestions set status = 'applied', decided_at = now() where id = $1`, [id]);
  return { ok: true };
}

export async function dismissSuggestion(id: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    `update acc.price_suggestions set status = 'dismissed', decided_at = now()
      where id = $1 and status = 'pending' returning id`, [id]);
  return r.length > 0;
}
