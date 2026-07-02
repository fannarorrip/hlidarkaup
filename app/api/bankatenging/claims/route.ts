import { NextRequest, NextResponse } from "next/server";
import { arionStatus } from "@/lib/arion";
import { sendQueuedClaims, syncClaimPayments } from "@/lib/claims-bank";
import { claimsEnabled } from "@/lib/claims";

// Bank claims: flush queued claims to Arion (send) and pull settlements into the ledger (sync).
// Gated stjornandi via middleware (/api/bankatenging). No-op unless ARION_CLAIMS_ENABLED=true.
// Pasted credentials are a sandbox-only affordance; production runs on server env.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const st = arionStatus();
  const auth = st.sandbox ? {
    bearerToken: typeof body.token === "string" && body.token.trim() ? body.token.trim() : undefined,
    subscriptionKey: typeof body.subscriptionKey === "string" && body.subscriptionKey.trim() ? body.subscriptionKey.trim() : undefined,
  } : {};
  if (!claimsEnabled()) return NextResponse.json({ ok: false, message: "Kröfusending er óvirk. Kveiktu á ARION_CLAIMS_ENABLED þegar innheimtusamningur og skilríki eru komin." });

  try {
    if (action === "send") {
      const res = await sendQueuedClaims(auth);
      if (res.reason === "no_profile") return NextResponse.json({ ok: false, message: "Ekkert sjálfgefið kröfusnið. Stilltu það í Innheimtuþjónustur." });
      if (res.reason === "no_key") return NextResponse.json({ ok: false, message: "Vantar Claims áskriftarlykil (ARION_CLAIMS_SUBSCRIPTION_KEY) — engin krafa var send." });
      return NextResponse.json({ ok: true, ...res });
    }
    if (action === "sync") {
      const res = await syncClaimPayments(auth);
      return NextResponse.json({ ok: true, ...res });
    }
    return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." });
  } catch (e) {
    console.error("bankatenging/claims failed:", e);
    return NextResponse.json({ ok: false, message: "Aðgerð mistókst. Athugaðu tengingu og reyndu aftur." });
  }
}
