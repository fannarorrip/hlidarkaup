import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const FIELDS = ["supplier_number", "kennitala", "name", "address", "postal_code", "city", "phone", "email", "payment_terms_days", "ap_account", "is_active"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const cols = FIELDS.filter((f) => body[f] !== undefined);
  if (!cols.length) return NextResponse.json({ error: "Ekkert til að uppfæra" }, { status: 400 });
  const set = cols.map((f, i) => `${f} = $${i + 2}`).join(", ");
  const vals = cols.map((f) => (body[f] === "" ? null : body[f]));
  try {
    const r = await db.query<{ id: string }>(`update acc.suppliers set ${set} where id = $1 returning id`, [id, ...vals]);
    if (!r.rows[0]) return NextResponse.json({ error: "Birgir fannst ekki" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: msg.includes("unique") || msg.includes("kennitala") ? "Kennitala er þegar skráð" : "Villa við uppfærslu" }, { status: 400 });
  }
}
