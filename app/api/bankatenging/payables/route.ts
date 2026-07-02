import { NextRequest, NextResponse } from "next/server";
import { listOpenPayables, settlePayable, backfillPayables } from "@/lib/payables";

// Ógreiddir reikningar (AP open items): list, backfill from the ledger, and manual settle
// (post Dr 9300 / Cr bank). Gated stjornandi via middleware (/api/bankatenging).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const payables = await listOpenPayables();
  return NextResponse.json({ ok: true, payables });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "backfill") {
    const res = await backfillPayables();
    return NextResponse.json({ ok: true, ...res });
  }

  if (action === "settle") {
    const payableId = String(body.payableId || "").trim();
    const bankAccount = String(body.bankAccount || "").trim();
    if (!UUID_RE.test(payableId)) return NextResponse.json({ ok: false, message: "Ógildur reikningur." });
    if (!bankAccount) return NextResponse.json({ ok: false, message: "Veldu bankalykil." });
    const res = await settlePayable(payableId, bankAccount);
    return NextResponse.json(res);
  }

  return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." });
}
