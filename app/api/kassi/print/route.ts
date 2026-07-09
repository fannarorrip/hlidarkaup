import { NextRequest, NextResponse } from "next/server";
import { netPrint, registerPrinter } from "@/lib/printer-net";

// Network receipt printing (Volcora ESC/POS over TCP). The till page posts the
// formatted receipt text here when no local kassabrú bridge is present.
// GET reports whether a printer is configured for the register (?reg=).
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const reg = req.nextUrl.searchParams.get("reg");
  return NextResponse.json({ configured: !!registerPrinter(reg) });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as { reg?: string; text?: string; drawer?: boolean }));
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "Enginn texti" }, { status: 400 });
  }
  const res = await netPrint(b.reg ?? null, text, { drawer: !!b.drawer });
  if (!res.configured) {
    return NextResponse.json({
      ok: false, configured: false,
      message: "Enginn prentari stilltur — settu PRINTER_IP (eða PRINTER_IP_<KASSI>) í umhverfið.",
    });
  }
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
