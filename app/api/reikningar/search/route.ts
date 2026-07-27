import { NextRequest, NextResponse } from "next/server";
import { searchSalesInvoices } from "@/lib/accounting-queries";

// Invoice/sales search for the reikningar list: viðskiptamaður (name/kt), number, lýsing.
// Gated stjornandi/bokari via middleware (/api/reikningar).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ rows: [] });
  return NextResponse.json({ rows: await searchSalesInvoices(q, 300) });
}
