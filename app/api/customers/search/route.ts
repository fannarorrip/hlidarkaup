import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Leitar á nafn, kennitölu EÐA viðskiptamannanúmer (frjálst númer sem búðin skráir sjálf —
// stóru fyrirtækin nota það; aðskilið frá kennitölu).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const rows = await query<{ id: string; name: string; kennitala: string | null; customer_number: string | null; is_account: boolean; discount_pct: number }>(
    `select id, name, kennitala, customer_number, is_account, discount_pct
       from shop.customers
      where is_active and not is_generic
        and (unaccent(name) ilike unaccent('%' || $1 || '%')
             or coalesce(kennitala,'') like $1 || '%'
             or coalesce(customer_number,'') ilike $1 || '%')
      order by name limit 15`,
    [q],
  );
  return NextResponse.json({ customers: rows });
}
