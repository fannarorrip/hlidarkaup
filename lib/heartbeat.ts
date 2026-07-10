// Innkaupa-hjartslátturinn: the old store's weekday ordering rhythm + per-supplier order
// templates (seeded from the old documents via deploy/import-store-data.js).
// "Í dag pantast: Arna (fyrir kl 9), MS (fyrir kl 11) …" + one-click PO from a template.
import { query } from "@/lib/db";
import { createPurchaseOrder } from "@/lib/purchase-orders";

export interface ScheduleEntry {
  id: string; weekday: number; supplier_name: string; deadline: string | null; note: string | null;
}

/** Full week's ordering schedule, ordered by weekday + deadline. */
export function getOrderSchedule() {
  return query<ScheduleEntry>(
    `select id, weekday, supplier_name, deadline::text as deadline, note
       from acc.order_schedule where is_active
      order by weekday, deadline nulls last, supplier_name`);
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

/** Create a draft purchase order from a template. Quantities: default_qty, else min_qty, else 1.
 *  unit_cost_est comes from the product's cost_price when the line is matched. */
export async function createPoFromTemplate(templateId: string): Promise<{ id: string; po_number: string } | { error: string }> {
  const t = (await query<{ supplier_name: string; name: string }>(
    `select supplier_name, name from acc.order_templates where id = $1 and is_active`, [templateId]))[0];
  if (!t) return { error: "Sniðmát fannst ekki." };
  const lines = await query<{
    product_number: string | null; name: string; default_qty: string | null;
    min_qty: string | null; cost_price: string | null; vnr: string | null;
  }>(
    `select l.product_number, l.name, l.default_qty::text, l.min_qty::text, p.cost_price::text, l.vnr
       from acc.order_template_lines l
       left join shop.products p on p.product_number = l.product_number
      where l.template_id = $1
      order by l.line_no`, [templateId]);
  if (!lines.length) return { error: "Sniðmátið er tómt." };

  const po = await createPurchaseOrder({
    supplierName: t.supplier_name,
    note: `Úr sniðmáti: ${t.name} (${t.supplier_name})`,
    lines: lines.map((l) => ({
      product_number: l.product_number,
      name: l.vnr ? `${l.name} [${l.vnr}]` : l.name,
      qty: Number(l.default_qty) || Number(l.min_qty) || 1,
      unit_cost_est: Number(l.cost_price) || undefined,
    })),
  });
  return po;
}
