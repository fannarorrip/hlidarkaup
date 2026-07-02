import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUnions, getUnionFundsAll } from "@/lib/accounting-queries";

// Stéttarfélög register. Gated by middleware (/api/laun → stjornandi/bokari).
export const runtime = "nodejs";

export async function GET() {
  const [unions, funds] = await Promise.all([getUnions(), getUnionFundsAll()]);
  return NextResponse.json({ unions, funds });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.name) return NextResponse.json({ error: "Vantar heiti stéttarfélags" }, { status: 400 });
  const r = await db.query<{ id: string }>(
    `insert into acc.unions (code, name, orlof_period_start, orlof_period_end)
     values ($1,$2,$3,$4) returning id`,
    [b.code || null, b.name, b.orlof_period_start || null, b.orlof_period_end || null]);
  return NextResponse.json({ ok: true, id: r.rows[0].id });
}
