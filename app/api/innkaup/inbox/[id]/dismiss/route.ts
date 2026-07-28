import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// "Henda" úr móttöku-biðröðinni: felur pósthólfsröðina fyrir móttökunni (mottaka_hidden) —
// snertir hvorki stöðu hennar í pósthólfinu né bókun. Gated by middleware (/api/innkaup).
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db.query<{ id: string }>(
    `update acc.email_invoices set mottaka_hidden = true where id = $1 returning id`, [id]);
  if (!r.rows[0]) return NextResponse.json({ error: "Fannst ekki" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
