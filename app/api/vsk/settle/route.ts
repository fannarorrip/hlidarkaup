import { NextRequest, NextResponse } from "next/server";
import { settleVatPeriod } from "@/lib/vat-settlement";

// Book the VSK-uppgjör for a period (Dr útskattur / Cr innskattur → 9535). Deduped per period.
// Middleware-gated (stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const year = Number(body.year);
  const period = Number(body.period);
  if (!year || !period) return NextResponse.json({ ok: false, message: "Vantar ár/tímabil." });
  const res = await settleVatPeriod(year, period);
  return NextResponse.json(res);
}
