import { NextRequest, NextResponse } from "next/server";
import { listUnitsWithToday, addReading, history, upsertUnit, deactivateUnit } from "@/lib/kaelar";

// Kælaaflestur (HACCP). Gated via middleware.
//   GET                                    -> units + today's readings + 14-day history
//   POST { unitId, reading, note }         -> record a reading
//   PUT  { id?, name, kind, min, max }     -> create/update a unit
//   DELETE { id }                          -> deactivate a unit
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [units, hist] = await Promise.all([listUnitsWithToday(), history(14)]);
  return NextResponse.json({ ok: true, units, history: hist });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const unitId = String(body.unitId || "");
  const reading = Number(body.reading);
  if (!unitId || !Number.isFinite(reading)) {
    return NextResponse.json({ ok: false, message: "Vantar kæli eða gilt hitastig." }, { status: 400 });
  }
  const res = await addReading(unitId, reading, String(body.note || "").trim() || undefined);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const min = Number(body.min), max = Number(body.max);
  if (!name || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return NextResponse.json({ ok: false, message: "Vantar nafn eða gilt hitastigsbil (lágmark < hámark)." }, { status: 400 });
  }
  const res = await upsertUnit({ id: body.id ? String(body.id) : undefined, name, kind: String(body.kind || "kælir"), min_temp: min, max_temp: max });
  return NextResponse.json({ ok: !!res, unit: res });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ ok: false, message: "Vantar id." }, { status: 400 });
  const ok = await deactivateUnit(String(body.id));
  return NextResponse.json({ ok });
}
