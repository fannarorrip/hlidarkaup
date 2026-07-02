import { NextResponse } from "next/server";
import { runEmailPoll } from "@/lib/email-invoices";

// Manual "Sækja núna" trigger from the Pósthólf page. Session-gated by middleware
// (/api/skraning/:path* → stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await runEmailPoll();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, error: e instanceof Error ? e.message : "Villa við sókn" }, { status: 500 });
  }
}
