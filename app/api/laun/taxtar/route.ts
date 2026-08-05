import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { resolveWageRates, totalWorkedHours, WAGE_CATEGORIES } from "@/lib/wage-scale";

// Leystir kjarasamningstaxtar allra virkra launþega með wage_category, á launatímabili
// keyrslunnar (taxtadagur = 24. í uppgjörsmánuðinum). Fyrir Ný launakeyrsla-viðmótið —
// sýnir þrep + taxta; útreikningurinn sjálfur leysir þá AFTUR server-megin við keyrslu.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year")) || new Date().getFullYear();
  const month = Math.min(12, Math.max(1, Number(sp.get("month")) || (new Date().getMonth() + 1)));
  const at = new Date(Date.UTC(year, month - 1, 24));
  const emps = await query<{ id: string; kennitala: string; wage_category: string; start_date: string | null; trade_start: string | null }>(`
    select id, kennitala, wage_category, start_date::text as start_date, trade_start::text as trade_start
    from acc.employees where is_active and wage_category is not null`);
  const rates = [];
  for (const e of emps) {
    const w = await resolveWageRates({ kennitala: e.kennitala, category: e.wage_category, startDate: e.start_date, tradeStart: e.trade_start, at, workedHours: await totalWorkedHours(e.id) });
    if (w) rates.push({ employee_id: e.id, categoryLabel: WAGE_CATEGORIES[e.wage_category] ?? e.wage_category, ...w });
  }
  return NextResponse.json({ at: at.toISOString().slice(0, 10), rates });
}
