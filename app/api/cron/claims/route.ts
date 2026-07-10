import { NextRequest, NextResponse } from "next/server";
import { sendQueuedClaims, syncClaimPayments } from "@/lib/claims-bank";
import { getBills, upsertBankBills, b2bStatus } from "@/lib/arion-b2b";

// Unattended claims flush for a scheduler (server cron). Sends queued kröfur to
// Arion, pulls settlements back into the ledger, and refreshes the incoming
// bank-bills list (kröfur á okkur) when the B2B Bridge is configured.
// Intentionally OUTSIDE the middleware matcher — guarded by CLAIMS_CRON_SECRET.
// Example: 0 8 * * * curl -fsS -H "x-cron-secret: …" https://…/api/cron/claims
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CLAIMS_CRON_SECRET || "";
  if (!secret) return false;
  const given = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret") || "";
  return given.length === secret.length && given === secret;
}

async function handle(req: NextRequest) {
  if (!process.env.CLAIMS_CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CLAIMS_CRON_SECRET er ekki stillt." }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Óheimilt" }, { status: 401 });
  }
  try {
    const sent = await sendQueuedClaims();   // no-op unless ARION_CLAIMS_ENABLED
    const synced = await syncClaimPayments();
    // Morning refresh of kröfur á okkur (best-effort — the B2B list is empty during
    // RB's overnight window; the empty-fetch guard keeps local state untouched then).
    let bankBills: unknown = { skipped: "bridge_not_configured" };
    if (b2bStatus().configured) {
      try {
        const res = await getBills();
        bankBills = res.ok ? await upsertBankBills(res.bills) : { error: res.error };
      } catch (e) {
        bankBills = { error: e instanceof Error ? e.message : "villa" };
      }
    }
    return NextResponse.json({ ok: true, sent, synced, bankBills });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Villa" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
