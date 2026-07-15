import { NextRequest, NextResponse } from "next/server";
import { inexchangePoll } from "@/lib/inexchange";

// Unattended inExchange poll for a scheduler (server cron), so received e-invoices land in the
// Pósthólf by themselves. Intentionally OUTSIDE the middleware matcher — it carries its own
// shared-secret guard (INEXCHANGE_POLL_SECRET, falling back to the existing EMAIL_POLL_SECRET)
// instead of a staff session.
// Example: */15 * * * * curl -fsS -H "x-cron-secret: …" http://127.0.0.1:3000/api/cron/inexchange-poll
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const secret = () => process.env.INEXCHANGE_POLL_SECRET || process.env.EMAIL_POLL_SECRET || "";

function authorized(req: NextRequest): boolean {
  const s = secret();
  if (!s) return false;
  const given = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret") || "";
  return given.length === s.length && given === s;   // length-guarded constant-ish compare
}

async function handle(req: NextRequest) {
  if (!secret()) {
    return NextResponse.json({ ok: false, error: "INEXCHANGE_POLL_SECRET (eða EMAIL_POLL_SECRET) er ekki stillt." }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Óheimilt" }, { status: 401 });
  }
  try {
    return NextResponse.json(await inexchangePoll());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Villa" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
