import { NextRequest, NextResponse } from "next/server";
import { matchBankTransaction, unmatchBankTransaction } from "@/lib/bank-statement";

// Para bankayfirlitslínu við ÞEGAR bókað fylgiskjal (afstemming án nýrrar bókunar) — eða
// aftengja pörun. Sannreynt í lib-inu (upphæð/lykill/átt + hvorugt þegar tengt).
// Gated stjórnandi via middleware (/api/bankatenging).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) ?? {};
  const bankTxId = String(body.bankTxId || "");
  if (!/^[0-9a-f-]{36}$/i.test(bankTxId)) return NextResponse.json({ ok: false, message: "Vantar bankTxId." }, { status: 400 });
  if (body.undo === true) return NextResponse.json(await unmatchBankTransaction(bankTxId));
  const voucherId = String(body.voucherId || "");
  if (!/^[0-9a-f-]{36}$/i.test(voucherId)) return NextResponse.json({ ok: false, message: "Vantar voucherId." }, { status: 400 });
  return NextResponse.json(await matchBankTransaction(bankTxId, voucherId));
}
