import { NextRequest, NextResponse } from "next/server";
import { inexchangeBrokerList, inexchangeFetchOne } from "@/lib/inexchange";

// Skeytamiðlara-yfirlitið: GET = allir reikningar sem liggja hjá inExchange + staða okkar megin;
// POST {uuid} = sækja einn (líka endurreyna villuröð); POST {all:true} = sækja alla sem vantar.
// Gated stjórnandi/bókari via middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await inexchangeBrokerList());
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) ?? {};
  if (b.all === true) {
    const list = await inexchangeBrokerList();
    if (!list.ok) return NextResponse.json({ ok: false, error: list.error });
    const targets = list.rows.filter((r) => r.local === "vantar" || r.local === "error").slice(0, 100);
    let created = 0, failed = 0;
    for (const t of targets) {
      const r = await inexchangeFetchOne(t.uuid);
      if (r.created) created++; else if (!r.ok) failed++;
    }
    return NextResponse.json({ ok: true, created, failed, checked: targets.length });
  }
  const uuid = String(b.uuid || "").trim();
  if (!uuid || uuid.length > 100) return NextResponse.json({ ok: false, error: "Vantar uuid" }, { status: 400 });
  return NextResponse.json(await inexchangeFetchOne(uuid));
}
