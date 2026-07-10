import { NextRequest, NextResponse } from "next/server";
import { calendarOccurrences } from "@/lib/reminders";

// Calendar events for a month range. Gated stjórnandi/bókari via middleware (/api/dagatal).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ ok: false, message: "Vantar from/to (YYYY-MM-DD)." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, events: await calendarOccurrences(from, to).catch(() => []) });
}
