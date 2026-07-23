import { NextRequest, NextResponse } from "next/server";
import { enqueueEinvoice, sendOutbox, getOutbox } from "@/lib/einvoice-outbox";

// Manually (re)send a sölureikningur as a rafrænn reikningur via inExchange.
// Rebuilds the UBL from current data, then transmits (honours the INEXCHANGE_SEND_ENABLED gate).
// Middleware-gated: stjornandi/bokari.
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ voucherId: string }> }) {
  const { voucherId } = await params;
  // force: manual "Búa til reikning" sends electronically as a per-invoice choice, regardless
  // of the customer's saved rafræn-viðskipti setting (kennitala still required).
  const body = await req.json().catch(() => ({} as { force?: boolean }));
  const enq = await enqueueEinvoice(voucherId, { force: body?.force === true });
  if (!enq.enqueued) {
    const msg =
      enq.reason === "not_flagged" ? "Viðskiptamaður er ekki skráður í rafræn viðskipti." :
      enq.reason === "no_kennitala" ? "Kennitölu vantar fyrir rafræna sendingu (þarf 10 stafa kt.)." :
      enq.reason === "not_found" ? "Reikningur fannst ekki." :
      (enq.error || "Ekki tókst að undirbúa rafrænan reikning.");
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
  const res = await sendOutbox(voucherId);
  const outbox = await getOutbox(voucherId);
  return NextResponse.json(
    { ok: res.ok, sent: res.sent, status: res.status, error: res.error, returnString: res.returnString, outbox },
    { status: res.ok ? 200 : 400 },
  );
}
