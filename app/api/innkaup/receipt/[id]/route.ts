import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyDraftPrices } from "@/lib/goods-receipt";
import { SUPPLIER_EQV_JOIN } from "@/lib/supplier-eqv";

// Update a draft receipt: set the supplier, and per-line the matched product + received qty.
// When a line gets matched, the supplier-item → product mapping is learned for next time.
export const runtime = "nodejs";

interface LinePatch { id: string; matched_product_number?: string | null; received_qty?: number | null; markup?: number | null; pack_qty?: number | null; unit_cost_override?: number | null; reviewed?: boolean }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supplier_id, lines, apply_prices } = await req.json();
  const client = await db.connect();
  try {
    await client.query("begin");
    const rec = (await client.query<{ status: string; supplier_id: string | null }>(`select status, supplier_id from acc.goods_receipts where id = $1 for update`, [id])).rows[0];
    if (!rec) throw new Error("Móttaka fannst ekki");
    if (rec.status === "booked") return NextResponse.json({ error: "Þegar bókað" }, { status: 409 });

    // Birgir NÝR á móttökunni? Þá endurparast línurnar úr minninu Á EFTIR línuvistuninni
    // (annars myndu giskin úr vafranum yfirskrifa endurpörunina — og öfugt má endurpörunin
    // EKKI keyra á hverri vistun því hún myndi eyða viljandi handbreytingum).
    const supplierJustAssigned = supplier_id !== undefined && supplier_id && supplier_id !== rec.supplier_id;
    if (supplier_id !== undefined) {
      const sup = supplier_id ? (await client.query<{ name: string }>(`select name from acc.suppliers where id = $1`, [supplier_id])).rows[0] : null;
      await client.query(`update acc.goods_receipts set supplier_id = $1, supplier_name = coalesce($2, supplier_name) where id = $3`, [supplier_id || null, sup?.name ?? null, id]);
    }
    for (const l of (lines ?? []) as LinePatch[]) {
      await client.query(
        `update acc.goods_receipt_lines set
           matched_product_number = case when $2 then $3 else matched_product_number end,
           received_qty = case when $4 then $5 else received_qty end,
           pack_qty = case when $7 then $8 else pack_qty end,
           unit_cost_override = case when $9 then $10 else unit_cost_override end,
           reviewed = case when $11 then $12 else reviewed end
         where id = $1 and receipt_id = $6`,
        [l.id, l.matched_product_number !== undefined, l.matched_product_number ?? null,
         l.received_qty !== undefined, l.received_qty ?? null, id,
         l.pack_qty !== undefined, l.pack_qty && l.pack_qty > 0 ? l.pack_qty : null,
         l.unit_cost_override !== undefined, l.unit_cost_override && l.unit_cost_override > 0 ? l.unit_cost_override : null,
         l.reviewed !== undefined, l.reviewed ?? false]);
      // Álagning á VÖRUNA (festist): skráð í móttökunni, notuð sem sterkasta verðreglan framvegis.
      // Empty/null clears it; values outside (1,10) are ignored (check constraint would reject).
      if (l.markup !== undefined && l.matched_product_number) {
        const m = l.markup == null ? null : Number(l.markup);
        if (m == null || (m > 1 && m < 10)) {
          await client.query(`update shop.products set markup = $1 where product_number = $2`, [m, l.matched_product_number]);
        }
      }
    }

    // ENDURPARA ÚR MINNI þegar birgir er NÝVALINN: móttökur sem urðu til án þekkts birgis
    // (t.d. PDF án kennitölu) fengu nafnalíkinda-gisk — lærða tengingin er sannleikurinn og
    // yfirskrifar giskið (keyrir á eftir línuvistuninni svo giskin úr vafranum vinni ekki).
    if (supplierJustAssigned) {
      // Birgja-jafngildi (lib/supplier-eqv.ts): tvíteknar skráningar sama fyrirtækis teljast
      // sami birgir — annars fannst gamli lærdómurinn ekki þegar birgir var nývalinn.
      await client.query(
        `update acc.goods_receipt_lines l
            set matched_product_number = si.product_number,
                pack_qty = coalesce(l.pack_qty, si.pack_qty)
           from acc.supplier_items si
           join acc.suppliers s1 on s1.id = $2
           ${SUPPLIER_EQV_JOIN}
          where l.receipt_id = $1
            and si.match_key = any(array[nullif(btrim(coalesce(l.gtin,'')),''), nullif(btrim(coalesce(l.supplier_item_id,'')),'')])`,
        [id, supplier_id]);
    }

    // Learn supplier-item → product mappings (+ pack size) for matched lines that carry a key.
    // Pakkastærðin lærist með: næsti reikningur frá birginum fyllir hana sjálfkrafa á línuna.
    const sid = (await client.query<{ supplier_id: string | null }>(`select supplier_id from acc.goods_receipts where id = $1`, [id])).rows[0]?.supplier_id;
    if (sid) {
      // DISTINCT ON: sama varan getur verið á FLEIRI en einni línu reiknings (Innnes o.fl.) —
      // án dedup springur upsertið á "ON CONFLICT DO UPDATE cannot affect row a second time".
      // Síðasta línan (hæsta line_no) vinnur. BÁÐIR lyklar lærðir (strikamerki OG vörunúmer
      // birgja) — næsti reikningur sýnir stundum bara annan þeirra.
      await client.query(
        `insert into acc.supplier_items (supplier_id, match_key, product_number, pack_qty)
         select distinct on (key) $1, key, matched_product_number, pack_qty
         from (
           select k.key, l.matched_product_number, l.pack_qty, l.line_no
           from acc.goods_receipt_lines l
           cross join lateral (values (nullif(btrim(coalesce(l.gtin,'')),'')),
                                      (nullif(btrim(coalesce(l.supplier_item_id,'')),''))) as k(key)
           where l.receipt_id = $2 and l.matched_product_number is not null and k.key is not null
         ) x
         order by key, line_no desc
         on conflict (supplier_id, match_key) do update
           set product_number = excluded.product_number,
               pack_qty = coalesce(excluded.pack_qty, acc.supplier_items.pack_qty)`,
        [sid, id]);
    }
    await client.query("commit");
    // "Vista drög" með apply_prices: verðin keyrast inn STRAX af drögunum (ekki bara við bókun).
    // Sjálfvirka vistunin sendir ekki flaggið — hún geymir bara vinnuna.
    let priceChanges = 0;
    if (apply_prices === true) {
      try { priceChanges = await applyDraftPrices(id); } catch (e) { console.error("applyDraftPrices:", e); }
    }
    return NextResponse.json({ ok: true, priceChanges });
  } catch (e) {
    await client.query("rollback");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa" }, { status: 400 });
  } finally { client.release(); }
}

// "Henda móttöku": delete a DRAFT receipt (booked ones are immutable history). The linked
// pósthólf row stays hidden from the móttaka queue so it doesn't bounce straight back.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await db.connect();
  try {
    await client.query("begin");
    const rec = (await client.query<{ status: string }>(`select status from acc.goods_receipts where id = $1 for update`, [id])).rows[0];
    if (!rec) return NextResponse.json({ error: "Móttaka fannst ekki" }, { status: 404 });
    if (rec.status === "booked") return NextResponse.json({ error: "Bókaðri móttöku verður ekki hent" }, { status: 409 });
    await client.query(`update acc.email_invoices set receipt_id = null, mottaka_hidden = true where receipt_id = $1`, [id]);
    await client.query(`delete from acc.goods_receipt_lines where receipt_id = $1`, [id]);
    await client.query(`delete from acc.goods_receipts where id = $1`, [id]);
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("rollback");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa" }, { status: 400 });
  } finally { client.release(); }
}
