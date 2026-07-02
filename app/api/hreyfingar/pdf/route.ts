import { NextRequest, NextResponse } from "next/server";
import { getLedgerEntriesPeriod, getLedgerOpeningBalances } from "@/lib/accounting-queries";
import { buildLedger } from "@/lib/ledger-report";
import { renderLedgerPdf } from "@/lib/pdf/ledger-pdf";

// Hreyfingar / Aðalbók PDF — all accounts, fully expanded, for a period. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = searchParams.get("to") || now.toISOString().slice(0, 10);

  const [opening, entries] = await Promise.all([getLedgerOpeningBalances(from), getLedgerEntriesPeriod(from, to)]);
  const pdf = await renderLedgerPdf(buildLedger(opening, entries), from, to);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="hreyfingar-${from}_${to}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
