import { NextRequest, NextResponse } from "next/server";
import { netDrawer } from "@/lib/printer-net";

// Open the cash drawer. Preferred path: the network receipt printer kicks it
// (ESC p over TCP — see lib/printer-net.ts), per-register via body {reg}.
// Legacy fallback: DRAWER_KICK_URL (a local print agent endpoint).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as { reg?: string }));

  const viaPrinter = await netDrawer(b?.reg ?? null);
  if (viaPrinter.configured) {
    return NextResponse.json(viaPrinter, { status: viaPrinter.ok ? 200 : 502 });
  }

  const url = process.env.DRAWER_KICK_URL;
  if (!url) {
    return NextResponse.json({
      ok: false, configured: false,
      message: "Skúffan er ekki tengd — settu PRINTER_IP (skúffan opnast gegnum prentarann).",
    });
  }
  try {
    await fetch(url, { method: "POST" });
    return NextResponse.json({ ok: true, configured: true });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, error: e instanceof Error ? e.message : "Villa" }, { status: 502 });
  }
}
