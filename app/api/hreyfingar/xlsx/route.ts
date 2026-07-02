import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getLedgerEntriesPeriod, getLedgerOpeningBalances } from "@/lib/accounting-queries";
import { buildLedger } from "@/lib/ledger-report";

// Hreyfingar / Aðalbók → Excel (.xlsx): all accounts, fully expanded, for a period. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const r = (n: number) => Math.round(Number(n) || 0);
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = searchParams.get("to") || now.toISOString().slice(0, 10);

  const [opening, entries] = await Promise.all([getLedgerOpeningBalances(from), getLedgerEntriesPeriod(from, to)]);
  const accounts = buildLedger(opening, entries);

  const aoa: (string | number)[][] = [];
  aoa.push(["Hreyfingar — Aðalbók", `${from} – ${to}`]);
  aoa.push([]);

  for (const a of accounts) {
    aoa.push([`${a.account_number}  ${a.name}`]);
    aoa.push(["Dags.", "Fylgiskjal", "Skýring", "Debet", "Kredit", "Staða"]);
    aoa.push(["", "", "Staða í upphafi", "", "", r(a.opening)]);
    for (const l of a.lines) {
      aoa.push([fmtD(l.voucher_date), `${l.series_code}-${l.voucher_number}`, l.description ?? "",
        l.debit ? r(l.debit) : "", l.credit ? r(l.credit) : "", r(l.running)]);
    }
    aoa.push(["", "", "Samtals", r(a.total_debit), r(a.total_credit), r(a.closing)]);
    aoa.push([]);
  }
  if (accounts.length === 0) aoa.push(["Engar hreyfingar á tímabilinu"]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hreyfingar");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="hreyfingar-${from}_${to}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
