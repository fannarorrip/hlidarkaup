import { NextRequest, NextResponse } from "next/server";
import { saveBankSettings, SettingsValidationError } from "@/lib/bank-settings";

// Samstillingar: save the bankatenging default lyklar. Gated stjornandi via middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    await saveBankSettings(body.settings || {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SettingsValidationError) return NextResponse.json({ ok: false, message: e.message });
    console.error("bankatenging/settings failed:", e);
    return NextResponse.json({ ok: false, message: "Villa við vistun." });
  }
}
