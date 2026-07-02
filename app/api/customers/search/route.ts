import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const rows = await query<{ id: string; name: string; kennitala: string | null; is_account: boolean }>(
    `select id, name, kennitala, is_account
       from shop.customers
      where is_active and not is_generic
        and (unaccent(name) ilike unaccent('%' || $1 || '%') or coalesce(kennitala,'') like $1 || '%')
      order by name limit 15`,
    [q],
  );
  return NextResponse.json({ customers: rows });
}
