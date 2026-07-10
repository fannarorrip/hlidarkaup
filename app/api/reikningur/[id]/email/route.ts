import { NextRequest, NextResponse } from "next/server";
import { emailInvoicePdf } from "@/lib/invoice-email";

// Email a sölureikningur as a PDF to a given address. Gated stjornandi/bokari via
// middleware (/api/reikningur). Body: { email }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { email } = await req.json().catch(() => ({} as { email?: string }));
  const res = await emailInvoicePdf(id, String(email || ""));
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
