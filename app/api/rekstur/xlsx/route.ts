import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getIncomeStatementPeriod } from "@/lib/accounting-queries";
import { buildIncomeStatement, type ISRow } from "@/lib/income-statement";
import { dags } from "@/lib/format";

// Rekstrarreikningur → Excel (.xlsx). Same period params as the PDF route. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const r = (n: number) => Math.round(Number(n) || 0);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = searchParams.get("to") || now.toISOString().slice(0, 10);

  const is = buildIncomeStatement(await getIncomeStatementPeriod(from, to));

  const aoa: (string | number)[][] = [];
  aoa.push(["Rekstrarreikningur", `${dags(from)} – ${dags(to)}`]);
  aoa.push([]);
  aoa.push(["Lykill", "Heiti", "Upphæð"]);
  const section = (title: string, rows: ISRow[], total: number) => {
    aoa.push([title]);
    for (const l of rows) aoa.push([l.account_number, l.name, r(l.amount)]);
    aoa.push(["", `Samtals ${title.toLowerCase()}`, r(total)]);
    aoa.push([]);
  };
  section("Rekstrartekjur", is.revenue, is.revTotal);
  section("Rekstrargjöld", is.expense, is.expTotal);
  aoa.push(["", "Rekstrarniðurstaða", r(is.operatingResult)]);
  aoa.push([]);
  if (is.financial.length) {
    section("Fjármunatekjur og (fjármagnsgjöld)", is.financial, is.finNet);
    aoa.push(["", "Hagnaður fyrir skatt", r(is.profitBeforeTax)]);
    aoa.push([]);
  }
  if (is.tax.length) section("Tekjuskattur og opinber gjöld", is.tax, is.taxTotal);
  aoa.push(["", is.result >= 0 ? "Hagnaður" : "Tap", r(is.result)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rekstrarreikningur");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="rekstrarreikningur-${from}_${to}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
