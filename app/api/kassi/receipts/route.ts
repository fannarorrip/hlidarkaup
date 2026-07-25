import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SERIES_PREFIX } from "@/lib/format";

// Recent sales for the till, for reprinting a receipt/nóta. Kiosk-allowed (/api/kassi/*).
// Returns each sale reconstructed for formatReceipt (lines with unit price + derived discount).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reg = req.nextUrl.searchParams.get("reg");
  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 25);

  const vouchers = await query<{
    id: string; series_code: string; voucher_number: string; voucher_type: string; created_at: string;
    customer_name: string | null; customer_kt: string | null; total: number;
  }>(
    `select v.id, v.series_code, v.voucher_number::text as voucher_number, v.voucher_type, v.created_at::text,
            c.name as customer_name, c.kennitala as customer_kt,
            coalesce(sum(sl.line_total),0)::int as total
       from acc.vouchers v
       left join shop.sale_lines sl on sl.voucher_id = v.id
       left join shop.customers c on c.id = v.customer_id
      where v.status <> 'reversed'
        and v.voucher_type in ('kassi_sale','account_sale','web_sale','eldhus_sale')
        ${reg ? "and v.register_id = $2" : ""}
      group by v.id, c.name, c.kennitala
      order by v.created_at desc
      limit $1`,
    reg ? [limit, reg] : [limit],
  );

  const ids = vouchers.map((v) => v.id);
  const lines = ids.length
    ? await query<{ voucher_id: string; name: string; quantity: string; unit_price_gross: string; line_total: string; vat_rate: string }>(
        `select voucher_id, name, quantity, unit_price_gross, line_total, vat_rate
           from shop.sale_lines where voucher_id = any($1::uuid[]) order by line_no`, [ids])
    : [];
  const byV = new Map<string, typeof lines>();
  for (const l of lines) { const a = byV.get(l.voucher_id) ?? []; a.push(l); byV.set(l.voucher_id, a); }

  const sales = vouchers.map((v) => ({
    id: v.id,
    invoiceNumber: `${SERIES_PREFIX[v.series_code] ?? v.series_code}-${String(v.voucher_number).padStart(6, "0")}`,
    time: v.created_at,
    total: v.total,
    mode: v.voucher_type === "account_sale" ? "account" : "card",
    buyer: v.customer_name ? { name: v.customer_name, kennitala: v.customer_kt } : undefined,
    lines: (byV.get(v.id) ?? []).map((l) => ({
      name: l.name,
      quantity: Number(l.quantity),
      price: Math.round(Number(l.unit_price_gross)),
      vatPct: Number(l.vat_rate),
      discount: Math.max(0, Math.round(Number(l.unit_price_gross) * Number(l.quantity) - Number(l.line_total))),
    })),
  }));

  return NextResponse.json({ sales });
}
