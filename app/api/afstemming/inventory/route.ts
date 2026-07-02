import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Birgðaafstemming — set recorded stock to the counted quantities and log the count.
export async function POST(req: NextRequest) {
  const { counts } = await req.json();
  if (!Array.isArray(counts) || !counts.length) return NextResponse.json({ error: "Engin talning" }, { status: 400 });

  const client = await db.connect();
  try {
    await client.query("begin");
    let updated = 0;
    for (const c of counts) {
      if (!c.product_number) continue;
      const r = await client.query(`update shop.products set stock_quantity = $1 where product_number = $2`,
        [Number(c.counted) || 0, String(c.product_number)]);
      updated += r.rowCount ?? 0;
    }
    await client.query(
      `insert into acc.reconciliations (recon_type, as_of_date, status, note, created_by)
       values ('inventory', current_date, 'done', $1, 'bokhald')`,
      [`Birgðatalning — ${updated} vörur uppfærðar`]);
    await client.query("commit");
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    await client.query("rollback");
    console.error("[afstemming inventory]", err);
    return NextResponse.json({ error: "Villa við vistun" }, { status: 500 });
  } finally {
    client.release();
  }
}
