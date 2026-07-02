import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getTrialBalancePeriod } from "@/lib/accounting-queries";
import { buildTrialBalance } from "@/lib/trial-balance";

// Prófjöfnuður → Excel (.xlsx). Same period params as the PDF route. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const r = (n: number) => Math.round(Number(n) || 0);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = searchParams.get("to") || now.toISOString().slice(0, 10);

  const tb = buildTrialBalance(await getTrialBalancePeriod(from, to));

  const aoa: (string | number)[][] = [];
  aoa.push(["Prófjöfnuður", `${from} – ${to}`]);
  aoa.push([]);
  aoa.push(["Lykill", "Heiti", "RSK", "VSK", "Staða í upphafi", "Debet", "Kredit", "Hreyfing", "Staða í lok"]);

  for (const g of tb.groups) {
    aoa.push([g.label]);
    for (const a of g.accounts) {
      aoa.push([a.account_number, a.name, a.rsk_code ?? "", a.vatLabel ?? "",
        r(a.opening), r(a.period_debit), r(a.period_credit), r(a.movement), r(a.closing)]);
    }
    aoa.push(["", `Samtals ${g.label}`, "", "", r(g.opening), r(g.period_debit), r(g.period_credit), r(g.movement), r(g.closing)]);
    aoa.push([]);
  }

  aoa.push(["Samantekt"]);
  aoa.push(["", "Debet", "Kredit", "Mismunur"]);
  aoa.push(["Staða í upphafi", r(tb.opening.debet), r(tb.opening.kredit), r(tb.opening.diff)]);
  aoa.push(["Hreyfingar á tímabili", r(tb.period.debet), r(tb.period.kredit), r(tb.period.diff)]);
  aoa.push(["Staða í lok", r(tb.closing.debet), r(tb.closing.kredit), r(tb.closing.diff)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 10 }, { wch: 34 }, { wch: 8 }, { wch: 11 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prófjöfnuður");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="profjofnudur-${from}_${to}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
