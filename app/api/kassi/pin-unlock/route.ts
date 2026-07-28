import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Opna kassa með PERSÓNULEGUM PIN starfsmanns (kemur í stað sameiginlega 2026-kóðans).
// Skilar hver starfsmaðurinn er svo kassinn merki sölur honum. LAN-only kiosk surface
// (like /api/kassi/scan) — PINs are till-floor secrets, not system credentials.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const pin = String(b.pin ?? "").replace(/\D/g, "");
  if (pin.length !== 4) return NextResponse.json({ error: "PIN er 4 tölustafir" }, { status: 400 });
  const emp = (await query<{ id: string; name: string }>(
    `select id, name from acc.employees where pin = $1 and is_active limit 1`, [pin]))[0];
  if (emp) return NextResponse.json({ ok: true, employeeId: emp.id, name: emp.name });

  // Ræsivörn: MEÐAN enginn starfsmaður hefur fengið PIN gildir gamli sameiginlegi kóðinn
  // (annars læstist búðin úti við uppfærsluna). Um leið og fyrsti PIN er skráður deyr hann.
  const anyPins = (await query<{ n: string }>(`select count(*)::text as n from acc.employees where pin is not null and is_active`))[0];
  const master = process.env.NEXT_PUBLIC_TILL_LOCK_PIN || "2026";
  if (Number(anyPins?.n) === 0 && pin === master) {
    return NextResponse.json({ ok: true, employeeId: null, name: "Kassi" });
  }
  return NextResponse.json({ error: "Rangur kóði" }, { status: 401 });
}
