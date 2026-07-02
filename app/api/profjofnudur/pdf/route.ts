import { NextRequest, NextResponse } from "next/server";
import { getTrialBalancePeriod } from "@/lib/accounting-queries";
import { buildTrialBalance } from "@/lib/trial-balance";
import { renderTrialBalancePdf } from "@/lib/pdf/trial-balance-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = searchParams.get("to") || now.toISOString().slice(0, 10);

  const rows = await getTrialBalancePeriod(from, to);
  const tb = buildTrialBalance(rows);
  const pdf = await renderTrialBalancePdf(tb, from, to);

  return new NextResponse(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="profjofnudur-${from}_${to}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
