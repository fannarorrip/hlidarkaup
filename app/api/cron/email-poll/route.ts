import { NextRequest, NextResponse } from "next/server";
import { runEmailPoll } from "@/lib/email-invoices";

// Unattended inbox poll for a scheduler (server cron). Intentionally OUTSIDE the
// middleware matcher — it carries its own shared-secret guard instead of a staff
// session. Example: */15 * * * * curl -fsS -H "x-cron-secret: …" https://…/api/cron/email-poll
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.EMAIL_POLL_SECRET || "";
  if (!secret) return false;
  const given = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret") || "";
  // length-guarded constant-ish compare
  return given.length === secret.length && given === secret;
}

async function handle(req: NextRequest) {
  if (!process.env.EMAIL_POLL_SECRET) {
    return NextResponse.json({ ok: false, error: "EMAIL_POLL_SECRET er ekki stillt." }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Óheimilt" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runEmailPoll());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Villa" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
