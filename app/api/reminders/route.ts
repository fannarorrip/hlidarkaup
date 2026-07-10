import { NextRequest, NextResponse } from "next/server";
import { getReminders, markReminderDone, listReminderDefs, upsertReminder, deleteReminder } from "@/lib/reminders";

// Áminningar. Gated stjórnandi/bókari via middleware (/api/reminders).
//   GET                          -> widget items + reminder defs
//   POST { action:'done', key }  -> mark an occurrence done
//   PUT  { ...def }              -> create/update a scheduled reminder
//   DELETE { id }                -> deactivate a reminder
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [items, defs] = await Promise.all([getReminders(21).catch(() => []), listReminderDefs().catch(() => [])]);
  return NextResponse.json({ ok: true, items, defs });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "done") {
    if (!body.key) return NextResponse.json({ ok: false, message: "Vantar key." }, { status: 400 });
    return NextResponse.json(await markReminderDone(String(body.key)));
  }
  return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." }, { status: 400 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const kind = String(body.schedule_kind || "");
  if (!title || !["weekly", "monthly", "yearly", "oneoff"].includes(kind)) {
    return NextResponse.json({ ok: false, message: "Vantar titil eða gilda tíðni." }, { status: 400 });
  }
  const r = await upsertReminder({
    id: body.id ? String(body.id) : undefined,
    title, description: body.description ? String(body.description) : null,
    category: String(body.category || "annað"), schedule_kind: kind,
    weekday: body.weekday ? Number(body.weekday) : null,
    day_of_month: body.day_of_month ? Number(body.day_of_month) : null,
    month: body.month ? Number(body.month) : null,
    due_date: body.due_date ? String(body.due_date) : null,
    lead_days: body.lead_days != null ? Number(body.lead_days) : 2,
    email_escalate: !!body.email_escalate,
  });
  return NextResponse.json({ ok: !!r, reminder: r });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ ok: false, message: "Vantar id." }, { status: 400 });
  const ok = await deleteReminder(String(body.id));
  return NextResponse.json({ ok });
}
