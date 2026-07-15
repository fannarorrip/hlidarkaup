import { NextRequest, NextResponse } from "next/server";
import { getBills, upsertBankBills, b2bStatus } from "@/lib/arion-b2b";

// Unattended refresh of "ógreiddar kröfur á okkur" (bank bills) via the Arion/RB B2B Bridge, so the
// list stays current without pressing "Sækja kröfur frá banka". Intentionally OUTSIDE the middleware
// matcher — guarded by BANK_BILLS_CRON_SECRET (falling back to the existing CLAIMS_CRON_SECRET).
// Example: 0 */3 * * * curl -fsS -H "x-cron-secret: …" http://127.0.0.1:3000/api/cron/bank-bills
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const secret = () => process.env.BANK_BILLS_CRON_SECRET || process.env.CLAIMS_CRON_SECRET || "";

function authorized(req: NextRequest): boolean {
  const s = secret();
  if (!s) return false;
  const given = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret") || "";
  return given.length === s.length && given === s;
}

async function handle(req: NextRequest) {
  if (!secret()) {
    return NextResponse.json({ ok: false, error: "BANK_BILLS_CRON_SECRET (eða CLAIMS_CRON_SECRET) er ekki stillt." }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Óheimilt" }, { status: 401 });
  }
  if (!b2bStatus().configured) {
    return NextResponse.json({ ok: false, error: "B2B Bridge er ekki stillt (ARION_B2B_BRIDGE_URL/USERNAME/PASSWORD)." }, { status: 503 });
  }
  try {
    const res = await getBills();
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
    return NextResponse.json({ ok: true, ...(await upsertBankBills(res.bills)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Villa" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
