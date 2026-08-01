import { NextRequest, NextResponse } from "next/server";
import { previewMonthEnd, runMonthEnd, emailBillingInvoices } from "@/lib/month-end";

// Month-end consolidated billing: GET ?period=YYYY-MM → preview; POST {period} → run;
// POST {action:"email"} → senda ósenda mánaðarreikninga sem PDF í tölvupósti. Middleware-gated.
export const runtime = "nodejs";

const valid = (p: string | null): p is string => !!p && /^\d{4}-\d{2}$/.test(p);

export async function GET(req: NextRequest) {
  const period = new URL(req.url).searchParams.get("period");
  if (!valid(period)) return NextResponse.json({ error: "Ógilt tímabil (YYYY-MM)" }, { status: 400 });
  return NextResponse.json(await previewMonthEnd(period));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "email") {
    try {
      return NextResponse.json(await emailBillingInvoices());
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Villa við sendingu" }, { status: 500 });
    }
  }
  const { period } = body;
  if (!valid(period)) return NextResponse.json({ error: "Ógilt tímabil (YYYY-MM)" }, { status: 400 });
  try {
    return NextResponse.json(await runMonthEnd(period));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa við uppgjör" }, { status: 500 });
  }
}
