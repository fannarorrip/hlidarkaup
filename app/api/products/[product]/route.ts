import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Update a product. Price is edited as GROSS (shelf/till price); net is derived.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json();

  const vat = Number(b.vat_rate);
  const gross = Number(b.price_gross);
  const net = Number.isFinite(vat) && Number.isFinite(gross) ? gross / (1 + vat / 100) : null;

  const rows = await query<{ product_number: string; price_gross: number }>(
    `update shop.products set
       name                = coalesce($2, name),
       product_group       = $3,
       unit_code           = $4,
       vat_rate            = coalesce($5, vat_rate),
       unit_price_net      = coalesce($6, unit_price_net),
       is_stock_controlled = coalesce($7, is_stock_controlled),
       stock_quantity      = coalesce($8, stock_quantity),
       use_scale           = coalesce($9, use_scale),
       allow_discount      = coalesce($10, allow_discount),
       is_active           = coalesce($11, is_active),
       description         = $12,
       reorder_point       = $13,
       reorder_qty         = $14,
       innihald            = $15,
       ofnaemisvaldar      = $16,
       naeringargildi      = $17::jsonb,
       netto_magn          = $18,
       uppruni             = $19,
       info_source         = case when coalesce($15,'') <> '' or $17 is not null then coalesce($20, info_source, 'manual') else info_source end,
       info_updated_at     = case when coalesce($15,'') <> '' or $17 is not null then now() else info_updated_at end,
       preferred_supplier_id = case when $21 then $22::uuid else preferred_supplier_id end,
       supplier_item_no      = case when $23 then $24 else supplier_item_no end
     where product_number = $1
     returning product_number, price_gross`,
    [
      product,
      b.name ?? null,
      b.product_group ? String(b.product_group) : null,
      b.unit_code ? String(b.unit_code) : null,
      Number.isFinite(vat) ? vat : null,
      net !== null ? net : null,
      typeof b.is_stock_controlled === "boolean" ? b.is_stock_controlled : null,
      b.stock_quantity !== undefined && b.stock_quantity !== "" ? Number(b.stock_quantity) : null,
      typeof b.use_scale === "boolean" ? b.use_scale : null,
      typeof b.allow_discount === "boolean" ? b.allow_discount : null,
      typeof b.is_active === "boolean" ? b.is_active : null,
      b.description !== undefined ? String(b.description) : null,
      b.reorder_point !== undefined && b.reorder_point !== "" ? Number(b.reorder_point) : null,
      b.reorder_qty !== undefined && b.reorder_qty !== "" ? Number(b.reorder_qty) : null,
      b.innihald !== undefined ? String(b.innihald).trim() || null : null,
      b.ofnaemisvaldar !== undefined ? String(b.ofnaemisvaldar).trim() || null : null,
      b.naeringargildi && typeof b.naeringargildi === "object" ? JSON.stringify(b.naeringargildi) : null,
      b.netto_magn !== undefined ? String(b.netto_magn).trim() || null : null,
      b.uppruni !== undefined ? String(b.uppruni).trim() || null : null,
      b.info_source ? String(b.info_source) : null,
      "preferred_supplier_id" in b,                                                       // $21 set birgi?
      "preferred_supplier_id" in b ? (b.preferred_supplier_id || null) : null,            // $22 birgi id
      "supplier_item_no" in b,                                                            // $23 set vnr?
      "supplier_item_no" in b ? (String(b.supplier_item_no ?? "").trim() || null) : null, // $24 vörunúmer birgja
    ],
  );
  if (!rows.length) return NextResponse.json({ error: "Vara fannst ekki" }, { status: 404 });
  return NextResponse.json({ ok: true, price_gross: rows[0].price_gross });
}
