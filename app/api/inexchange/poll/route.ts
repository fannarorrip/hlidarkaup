import { NextResponse } from "next/server";
import { inexchangePoll } from "@/lib/inexchange";

// Pull new invoices from inExchange → goods-receipt drafts (móttaka). Session-gated.
// Backs the "Sækja frá inExchange" button and (later) a server cron.
export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json(await inexchangePoll());
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, error: e instanceof Error ? e.message : "Villa" }, { status: 500 });
  }
}
