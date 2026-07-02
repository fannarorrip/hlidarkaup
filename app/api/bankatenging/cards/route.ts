import { NextRequest, NextResponse } from "next/server";
import { arionStatus, getArionCards, getArionCardTransactions } from "@/lib/arion";

// Pull the company's cards + transactions from Arion for reconciliation against the card
// account (7716). Accepts a pasted sandbox token in the body (on-page tester) or falls back
// to the env config. Gated stjornandi via middleware (/api/bankatenging).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const st = arionStatus();

  if (!st.have.subscriptionKey) return NextResponse.json({ ok: false, reason: "not_configured", message: "Vantar áskriftarlykil (ARION_SUBSCRIPTION_KEY)." });
  if (!token && !st.have.accessToken && !st.ready) return NextResponse.json({ ok: false, reason: "no_token", message: "Límdu Arion aðgangslykil (Generate Token) í reitinn." });

  const bearer = token || undefined;
  try {
    const cards = await getArionCards(bearer);
    const cardId = (typeof body.cardId === "string" && body.cardId) || cards[0]?.id || "";
    let transactions: unknown[] = [];
    let txError: string | null = null;
    if (cardId) {
      try { transactions = await getArionCardTransactions(cardId, undefined, undefined, bearer); }
      catch (e) { txError = e instanceof Error ? e.message : String(e); } // best-effort — cards still show
    }
    return NextResponse.json({ ok: true, cards, cardId, transactions, txError });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
