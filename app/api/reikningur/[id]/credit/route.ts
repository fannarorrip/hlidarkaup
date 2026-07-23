import { NextRequest, NextResponse } from "next/server";
import { creditSalesInvoice } from "@/lib/credit-note";

// Kreditera sölureikning: create an offsetting kreditreikningur (keeps the original) and cancel
// any open bank claim. Gated stjornandi/bokari via middleware (/api/reikningur).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await creditSalesInvoice(id);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
