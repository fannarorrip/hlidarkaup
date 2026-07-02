import { NextRequest, NextResponse } from "next/server";
import { previewMonthEnd, runMonthEnd } from "@/lib/month-end";

// Month-end consolidated billing: GET ?period=YYYY-MM → preview; POST {period} → run. Middleware-gated.
export const runtime = "nodejs";

const valid = (p: string | null): p is string => !!p && /^\d{4}-\d{2}$/.test(p);

export async function GET(req: NextRequest) {
  const period = new URL(req.url).searchParams.get("period");
  if (!valid(period)) return NextResponse.json({ error: "Ógilt tímabil (YYYY-MM)" }, { status: 400 });
  return NextResponse.json(await previewMonthEnd(period));
}

export async function POST(req: NextRequest) {
  const { period } = await req.json().catch(() => ({}));
  if (!valid(period)) return NextResponse.json({ error: "Ógilt tímabil (YYYY-MM)" }, { status: 400 });
  try {
    return NextResponse.json(await runMonthEnd(period));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa við uppgjör" }, { status: 500 });
  }
}
