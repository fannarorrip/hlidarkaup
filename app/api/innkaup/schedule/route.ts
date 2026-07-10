import { NextRequest, NextResponse } from "next/server";
import { upsertScheduleEntry, deleteScheduleEntry } from "@/lib/heartbeat";

// Edit the ordering heartbeat itself. Gated via middleware (/api/innkaup).
//   POST   { id?, weekday, supplier_name, deadline?, note? } -> create/update
//   DELETE { id }                                            -> remove
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const weekday = Number(body.weekday);
  const supplier = String(body.supplier_name || "").trim();
  if (!supplier || weekday < 1 || weekday > 7) {
    return NextResponse.json({ ok: false, message: "Vantar birgja eða gildan vikudag." }, { status: 400 });
  }
  const deadline = String(body.deadline || "").trim();
  if (deadline && !/^\d{2}:\d{2}$/.test(deadline)) {
    return NextResponse.json({ ok: false, message: "Skilafrestur á að vera HH:MM." }, { status: 400 });
  }
  const res = await upsertScheduleEntry({
    id: body.id ? String(body.id) : undefined,
    weekday, supplier_name: supplier,
    deadline: deadline || null,
    note: String(body.note || "").trim() || null,
  });
  return NextResponse.json({ ok: !!res, entry: res });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ ok: false, message: "Vantar id." }, { status: 400 });
  const ok = await deleteScheduleEntry(String(body.id));
  return NextResponse.json({ ok });
}
