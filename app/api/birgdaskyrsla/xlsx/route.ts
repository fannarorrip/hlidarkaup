import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getStockFull } from "@/lib/stock-report";

// Full stock report → Excel (.xlsx). ?birgir=<uuid> síar á aðalbirgi vörunnar. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const r = (n: number | string) => Math.round(Number(n) || 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const birgir = new URL(req.url).searchParams.get("birgir") ?? "";
  const rows = await getStockFull(UUID.test(birgir) ? birgir : undefined);
  const aoa: (string | number)[][] = [["Vörunúmer", "Heiti", "Flokkur", "Birgir", "Birgðir", "Öryggisbirgðir", "Kostn.verð", "Birgðavirði", "Söluverð"]];
  let totalVal = 0;
  for (const p of rows) {
    const stock = Number(p.stock_quantity) || 0, cost = Number(p.cost_price) || 0, val = Math.round(stock * cost);
    totalVal += val;
    aoa.push([p.product_number, p.name, p.product_group ?? "", p.supplier_name ?? "", stock, p.reorder_point != null ? r(p.reorder_point) : "", r(cost), val, r(p.price_gross)]);
  }
  aoa.push([]);
  aoa.push(["", "", "", "", "", "", "Samtals birgðavirði:", r(totalVal)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Birgðir");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  // Birgjanafn í skráarheitinu þegar síað er — „birgdaskyrsla-innnes.xlsx"
  const supName = rows[0]?.supplier_name && UUID.test(birgir)
    ? "-" + rows[0].supplier_name.toLowerCase().replace(/[^a-z0-9æðöþáéíóúý]+/gi, "-").replace(/^-|-$/g, "").slice(0, 30)
    : "";

  return new NextResponse(new Uint8Array(buf), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="birgdaskyrsla${supName}.xlsx"`, "cache-control": "no-store" },
  });
}
