import { NextResponse } from "next/server";
import { arionStatus, arionAccessToken } from "@/lib/arion";

// Verify the Arion connection: attempt an OAuth token over mTLS with the certificate.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const st = arionStatus();
  if (!st.ready) return NextResponse.json({ ok: false, reason: "not_configured", message: "Tenging ekki fullstillt — vantar skilríki eða aðgangsupplýsingar.", status: st });
  try {
    const tok = await arionAccessToken(true);
    return NextResponse.json({ ok: true, message: "Tenging tókst — aðgangslykill fékkst frá Arion.", tokenPreview: tok.slice(0, 6) + "…" });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
