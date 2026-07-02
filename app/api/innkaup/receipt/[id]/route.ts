import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Update a draft receipt: set the supplier, and per-line the matched product + received qty.
// When a line gets matched, the supplier-item → product mapping is learned for next time.
export const runtime = "nodejs";

interface LinePatch { id: string; matched_product_number?: string | null; received_qty?: number | null }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supplier_id, lines } = await req.json();
  const client = await db.connect();
  try {
    await client.query("begin");
    const rec = (await client.query<{ status: string }>(`select status from acc.goods_receipts where id = $1 for update`, [id])).rows[0];
    if (!rec) throw new Error("Móttaka fannst ekki");
    if (rec.status === "booked") return NextResponse.json({ error: "Þegar bókað" }, { status: 409 });

    if (supplier_id !== undefined) {
      const sup = supplier_id ? (await client.query<{ name: string }>(`select name from acc.suppliers where id = $1`, [supplier_id])).rows[0] : null;
      await client.query(`update acc.goods_receipts set supplier_id = $1, supplier_name = coalesce($2, supplier_name) where id = $3`, [supplier_id || null, sup?.name ?? null, id]);
    }
    for (const l of (lines ?? []) as LinePatch[]) {
      await client.query(
        `update acc.goods_receipt_lines set
           matched_product_number = case when $2 then $3 else matched_product_number end,
           received_qty = case when $4 then $5 else received_qty end
         where id = $1 and receipt_id = $6`,
        [l.id, l.matched_product_number !== undefined, l.matched_product_number ?? null,
         l.received_qty !== undefined, l.received_qty ?? null, id]);
    }

    // Learn supplier-item → product mappings for matched lines that carry a key.
    const sid = (await client.query<{ supplier_id: string | null }>(`select supplier_id from acc.goods_receipts where id = $1`, [id])).rows[0]?.supplier_id;
    if (sid) {
      await client.query(
        `insert into acc.supplier_items (supplier_id, match_key, product_number)
         select $1, coalesce(nullif(l.gtin,''), l.supplier_item_id), l.matched_product_number
         from acc.goods_receipt_lines l
         where l.receipt_id = $2 and l.matched_product_number is not null
           and coalesce(nullif(l.gtin,''), l.supplier_item_id) is not null
         on conflict (supplier_id, match_key) do update set product_number = excluded.product_number`,
        [sid, id]);
    }
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("rollback");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa" }, { status: 400 });
  } finally { client.release(); }
}
