import { NextResponse } from "next/server";

// Open the cash drawer. A browser can't kick an ESC/POS drawer directly — it's opened either by
// the receipt printer (printer setting "open drawer on print") or by a small local print agent.
// If DRAWER_KICK_URL is set (the agent's endpoint) we POST to it; otherwise this is a no-op that
// explains the setup. Gated like the other hardware integrations.
export const runtime = "nodejs";

export async function POST() {
  const url = process.env.DRAWER_KICK_URL;
  if (!url) {
    return NextResponse.json({
      ok: false, configured: false,
      message: "Skúffan er ekki tengd. Stilltu kvittanaprentarann á að opna skúffuna við prentun, eða settu DRAWER_KICK_URL á staðbundinn prentþjón.",
    });
  }
  try {
    await fetch(url, { method: "POST" });
    return NextResponse.json({ ok: true, configured: true });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, error: e instanceof Error ? e.message : "Villa" }, { status: 502 });
  }
}
