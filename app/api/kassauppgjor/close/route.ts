import { NextRequest, NextResponse } from "next/server";
import { closeZReport } from "@/lib/z-report";

// Close a day's till into an immutable Z-report. Middleware-gated (stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const date = String(body.date || "");
  const counted = body.counted == null || body.counted === "" ? null : Number(body.counted);
  const res = await closeZReport(date, Number.isFinite(counted as number) ? counted : null);
  return NextResponse.json(res);
}
