import { NextRequest, NextResponse } from "next/server";
import { getAccountStatement, accountsStatus } from "@/lib/arion-b2b-accounts";

// Hreyfingaryfirlit (account statement) from Arion/RB B2B via the Bridge.
// Gated stjórnandi via middleware (/api/bankatenging).
// POST { account (12 digits), dateFrom, dateTo, recordFrom?, recordTo? } → statement + transactions.
// This is the production statement path (PSD2 never goes live — see deploy/ARION_ONBOARDING.md).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, status: accountsStatus() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const st = accountsStatus();
  if (!st.configured) {
    return NextResponse.json({ ok: false, configured: false, message: "B2B yfirlitsþjónusta er ekki tengd (ARION_B2B_ACCOUNTS_URL — sjá deploy/ARION_B2B_BRIDGE.md)." });
  }
  const res = await getAccountStatement({
    account: String(body.account || ""),
    dateFrom: String(body.dateFrom || ""),
    dateTo: String(body.dateTo || ""),
    recordFrom: Number(body.recordFrom) || undefined,
    recordTo: Number(body.recordTo) || undefined,
  });
  if (!res.ok) return NextResponse.json({ ok: false, configured: true, message: res.error || "Sókn mistókst." });
  return NextResponse.json({ ok: true, configured: true, statement: res.statement });
}
