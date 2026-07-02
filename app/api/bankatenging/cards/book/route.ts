import { NextRequest, NextResponse } from "next/server";
import { bookArionCardTransactions } from "@/lib/arion-book";

// Book fetched Arion card transactions to the ledger (Dr expense / Cr card liability).
// Gated stjornandi via middleware (/api/bankatenging).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const debitAccount = String(body.debitAccount || "").trim();
  const liabilityAccount = String(body.liabilityAccount || "9310").trim() || "9310";
  const txns = Array.isArray(body.transactions) ? body.transactions : [];
  if (!debitAccount) return NextResponse.json({ ok: false, message: "Veldu gjaldalykil (debet)." });
  if (!txns.length) return NextResponse.json({ ok: false, message: "Engar færslur til að bóka." });
  try {
    const res = await bookArionCardTransactions(txns, debitAccount, liabilityAccount, typeof body.maskedPan === "string" ? body.maskedPan : undefined);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error("cards/book failed:", e);
    return NextResponse.json({ ok: false, message: "Bókun mistókst. Reyndu aftur." });
  }
}
