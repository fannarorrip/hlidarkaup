// Innkaupa-hjartslátturinn: the old store's weekday ordering rhythm + per-supplier order
// templates (seeded from the old documents via deploy/import-store-data.js).
// "Í dag pantast: Arna (fyrir kl 9), MS (fyrir kl 11) …" + one-click PO from a template.
import { query } from "@/lib/db";
import { createPurchaseOrder } from "@/lib/purchase-orders";

export interface ScheduleEntry {
  id: string; weekday: number; supplier_name: string; deadline: string | null; note: string | null;
  template_id: string | null;   // matched order template → chip becomes clickable
}

// Fuzzy match schedule supplier names to templates ("Mjólkursamlagið (MS)" ↔ "MS",
// "Grænmeti (Búrfell/Bananar)" ↔ "Bananar/Búr"): normalized token overlap or containment.
const normTok = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ð/g, "d").replace(/þ/g, "th").replace(/æ/g, "ae").replace(/ö/g, "o");
const tokens = (s: string) => normTok(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
function matchTemplate(scheduleName: string, templates: { id: string; supplier_name: string }[]): string | null {
  const st = tokens(scheduleName);
  let best: { id: string; score: number } | null = null;
  for (const t of templates) {
    const tt = tokens(t.supplier_name);
    let score = 0;
    for (const a of st) for (const b of tt) {
      if (a === b) score += a.length >= 4 ? 2 : 1;
      else if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { id: t.id, score };
  }
  return best?.id ?? null;
}

/** Full week's ordering schedule, ordered by weekday + deadline, with matched templates. */
export async function getOrderSchedule(): Promise<ScheduleEntry[]> {
  const [rows, templates] = await Promise.all([
    query<Omit<ScheduleEntry, "template_id">>(
      `select id, weekday, supplier_name, deadline::text as deadline, note
         from acc.order_schedule where is_active
        order by weekday, deadline nulls last, supplier_name`),
    query<{ id: string; supplier_name: string }>(
      `select id, supplier_name from acc.order_templates where is_active and name = 'Pöntunarlisti'`),
  ]);
  return rows.map((r) => ({ ...r, template_id: matchTemplate(r.supplier_name, templates) }));
}

export interface TemplateLineRow {
  line_no: number; vnr: string | null; ean: string | null; product_number: string | null;
  name: string; default_qty: string | null; unit: string | null; min_qty: string | null;
  cost_price: string | null; stock: string | null;
}

/** Template lines for the order editor (with current cost + stock when matched). */
export async function getTemplateLines(templateId: string) {
  const t = (await query<{ id: string; supplier_name: string; name: string }>(
    `select id, supplier_name, name from acc.order_templates where id = $1 and is_active`, [templateId]))[0];
  if (!t) return null;
  const lines = await query<TemplateLineRow>(
    `select l.line_no, l.vnr, l.ean, l.product_number, l.name, l.default_qty::text, l.unit,
            l.min_qty::text, p.cost_price::text as cost_price, p.stock_quantity::text as stock
       from acc.order_template_lines l
       left join shop.products p on p.product_number = l.product_number
      where l.template_id = $1
      order by l.line_no`, [templateId]);
  return { template: t, lines };
}

export interface TemplateRow {
  id: string; supplier_name: string; name: string; note: string | null;
  line_count: number; matched_count: number;
}

/** Order templates with line counts (matched = lines linked to our products). */
export function listOrderTemplates() {
  return query<TemplateRow>(
    `select t.id, t.supplier_name, t.name, t.note,
            count(l.id)::int as line_count,
            count(l.product_number)::int as matched_count
       from acc.order_templates t
       left join acc.order_template_lines l on l.template_id = t.id
      where t.is_active
      group by t.id
      order by t.supplier_name, t.name`);
}

/** Create a draft purchase order from a template.
 *  With `quantities` (line_no → qty from the order editor): only lines with qty > 0 are ordered.
 *  Without: falls back to default_qty/min_qty/1 for every line (one-click mode).
 *  unit_cost_est comes from the product's cost_price when the line is matched. */
export async function createPoFromTemplate(
  templateId: string,
  quantities?: Record<number, number>,
): Promise<{ id: string; po_number: string } | { error: string }> {
  const t = (await query<{ supplier_name: string; name: string }>(
    `select supplier_name, name from acc.order_templates where id = $1 and is_active`, [templateId]))[0];
  if (!t) return { error: "Sniðmát fannst ekki." };
  const lines = await query<{
    line_no: number; product_number: string | null; name: string; default_qty: string | null;
    min_qty: string | null; cost_price: string | null; vnr: string | null;
  }>(
    `select l.line_no, l.product_number, l.name, l.default_qty::text, l.min_qty::text, p.cost_price::text, l.vnr
       from acc.order_template_lines l
       left join shop.products p on p.product_number = l.product_number
      where l.template_id = $1
      order by l.line_no`, [templateId]);
  if (!lines.length) return { error: "Sniðmátið er tómt." };

  const poLines = lines
    .map((l) => ({
      product_number: l.product_number,
      name: l.vnr ? `${l.name} [${l.vnr}]` : l.name,
      qty: quantities
        ? Math.max(0, Number(quantities[l.line_no]) || 0)
        : Number(l.default_qty) || Number(l.min_qty) || 1,
      unit_cost_est: Number(l.cost_price) || undefined,
    }))
    .filter((l) => l.qty > 0);
  if (!poLines.length) return { error: "Ekkert magn slegið inn — pöntunin væri tóm." };

  const po = await createPurchaseOrder({
    supplierName: t.supplier_name,
    note: `Úr sniðmáti: ${t.name} (${t.supplier_name})`,
    lines: poLines,
  });
  return po;
}
