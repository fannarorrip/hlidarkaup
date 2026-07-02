import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getVatVeltaByRate, getVatAccountsPeriod } from "@/lib/accounting-queries";
import { buildVatReport } from "@/lib/vat-report";
import { vatPeriods, currentVatPeriod } from "@/lib/vat-periods";

// Virðisaukaskattsskýrsla → Excel (.xlsx). Same year/period params. Middleware-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const r = (n: number) => Math.round(Number(n) || 0);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = Number(searchParams.get("year")) || now.getFullYear();
  const period = Number(searchParams.get("period")) || currentVatPeriod(year, now.getMonth() + 1);
  const periods = vatPeriods(year);
  const p = periods.find((x) => x.key === period) ?? periods[0];

  const [velta, accts] = await Promise.all([getVatVeltaByRate(p.from, p.to), getVatAccountsPeriod(p.from, p.to)]);
  const rep = buildVatReport(velta, accts);

  const aoa: (string | number)[][] = [];
  aoa.push(["Virðisaukaskattsskýrsla", p.label, `${p.from} – ${p.to}`]);
  aoa.push([]);
  aoa.push(["Skattskyld velta (án VSK)"]);
  aoa.push(["24% þrep", r(rep.v24)]);
  aoa.push(["11% þrep", r(rep.v11)]);
  aoa.push(["0% / undanþegin", r(rep.v0)]);
  aoa.push(["Heildar skattskyld velta", r(rep.veltaTotal)]);
  aoa.push([]);
  aoa.push(["Útskattur (sala)"]);
  for (const l of rep.out) aoa.push([l.account, l.name, r(l.amount)]);
  aoa.push(["", "Útskattur samtals", r(rep.output)]);
  aoa.push([]);
  aoa.push(["Innskattur (kaup)"]);
  for (const l of rep.inn) aoa.push([l.account, l.name, r(l.amount)]);
  aoa.push(["", "Innskattur samtals", r(rep.input)]);
  aoa.push([]);
  aoa.push([rep.net >= 0 ? "Skuld við ríkissjóð" : "Inneign", r(Math.abs(rep.net))]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "VSK");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="vsk-${year}-${period}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
