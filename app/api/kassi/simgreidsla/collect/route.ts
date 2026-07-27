import { NextRequest, NextResponse } from "next/server";
import { collectSimgreidslur, CollectError } from "@/lib/simgreidsla-collect";
import { resolveRegister } from "@/lib/registers";

// Collect selected old símgreiðslur: the card was just charged on the posi (MOTO) client-side; this
// posts the Dr 7716 / Cr 7830 receipt journal and marks them collected. No new sale is created.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const voucherIds: string[] = Array.isArray(b.voucherIds) ? b.voucherIds.map(String) : [];
  if (!voucherIds.length) return NextResponse.json({ error: "Engin kvittun valin" }, { status: 400 });
  const poiTx = b.poiTx ? String(b.poiTx).slice(0, 64) : null;
  const registerId = resolveRegister(b.reg, "sjalfsafgreidsla").id;
  try {
    const r = await collectSimgreidslur(voucherIds, { poiTx, user: "kassi", registerId });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof CollectError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[símgreiðsla/collect] error:", err);
    return NextResponse.json({ error: "Villa við innheimtu símgreiðslu" }, { status: 500 });
  }
}
