import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getBalanceSheetAsOf, getRetainedThroughAsOf } from "@/lib/accounting-queries";
import { buildBalanceSheet, type BSRow } from "@/lib/balance-sheet";

// Efnahagsreikningur → Excel (.xlsx). Same asOf param as the PDF route. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const r = (n: number) => Math.round(Number(n) || 0);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get("asOf") || new Date().toISOString().slice(0, 10);

  const [bs, is] = await Promise.all([getBalanceSheetAsOf(asOf), getRetainedThroughAsOf(asOf)]);
  const sheet = buildBalanceSheet(bs, is);

  const aoa: (string | number)[][] = [];
  aoa.push(["Efnahagsreikningur", `Staða þann ${asOf}`]);
  aoa.push([]);
  aoa.push(["Lykill", "Heiti", "Upphæð"]);
  const lines = (title: string, items: BSRow[]) => { aoa.push([title]); for (const l of items) aoa.push([l.account_number, l.name, r(l.val)]); };
  lines("Eignir", sheet.assets);
  aoa.push(["", "Eignir samtals", r(sheet.assetTotal)]);
  aoa.push([]);
  lines("Skuldir", sheet.liab);
  lines("Eigið fé", sheet.equity);
  aoa.push(["", "Afkoma tímabilsins", r(sheet.result)]);
  aoa.push(["", "Skuldir og eigið fé samtals", r(sheet.rightTotal)]);
  aoa.push([]);
  aoa.push(["", sheet.balanced ? "Efnahagur stemmir" : "Efnahagur stemmir EKKI"]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Efnahagsreikningur");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="efnahagsreikningur-${asOf}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
