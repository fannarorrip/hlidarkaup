import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Reject an emailed invoice draft — removes it from the Pósthólf queue. The row is
// kept (status='rejected') so the same message isn't re-ingested on the next poll.
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db.query<{ id: string }>(
    `update acc.email_invoices set status='rejected', processed_at=now()
       where id = $1 and status <> 'approved' returning id`, [id]);
  if (!r.rows[0]) return NextResponse.json({ error: "Drög fundust ekki eða þegar bókuð" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
