import { NextRequest, NextResponse } from "next/server";
import { sendReminderEscalation } from "@/lib/reminders";

// Daily "EKKI GLEYMA" escalation email. OUTSIDE the middleware matcher — guarded by
// CLAIMS_CRON_SECRET (same server-cron secret). Sends at most once per day when critical
// items are outstanding. Example: 0 9 * * * curl -H "x-cron-secret: …" https://…/api/cron/reminders
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CLAIMS_CRON_SECRET || "";
  if (!secret) return false;
  const given = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret") || "";
  return given.length === secret.length && given === secret;
}

async function handle(req: NextRequest) {
  if (!process.env.CLAIMS_CRON_SECRET) return NextResponse.json({ ok: false, error: "CLAIMS_CRON_SECRET er ekki stillt." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Óheimilt" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const res = await sendReminderEscalation({ force });
  return NextResponse.json({ ok: true, ...res });
}

export const GET = handle;
export const POST = handle;
