import { NextRequest, NextResponse } from "next/server";
import { searchVouchers } from "@/lib/accounting-queries";

// Voucher search for the fylgiskjöl list: number, description, lánadrottinn, tilvísun.
// Gated stjornandi/bokari via middleware (/api/fylgiskjol).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ vouchers: [] });
  return NextResponse.json({ vouchers: await searchVouchers(q, 300) });
}
