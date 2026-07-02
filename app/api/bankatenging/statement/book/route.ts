import { NextRequest, NextResponse } from "next/server";
import { bookBankTransaction } from "@/lib/bank-statement";

// Book one fetched bank-statement line to the ledger (Dr/Cr by direction).
// Gated stjornandi via middleware (/api/bankatenging).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const bankTxId = String(body.bankTxId || "").trim();
  const bankAccount = String(body.bankAccount || "").trim();
  const contraAccount = String(body.contraAccount || "").trim();
  if (!UUID_RE.test(bankTxId)) return NextResponse.json({ ok: false, message: "Ógild færsla." });
  if (!bankAccount) return NextResponse.json({ ok: false, message: "Veldu bankalykil." });
  if (!contraAccount) return NextResponse.json({ ok: false, message: "Veldu mótlykil." });
  const res = await bookBankTransaction(bankTxId, bankAccount, contraAccount);
  return NextResponse.json(res);
}
