import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchSuppliers } from "@/lib/accounting-queries";

// Birgjar (suppliers) register. Gated by middleware (/api/suppliers → stjornandi/bokari).
export const runtime = "nodejs";

const FIELDS = ["supplier_number", "kennitala", "name", "address", "postal_code", "city", "phone", "email", "payment_terms_days", "ap_account", "is_active"];

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  return NextResponse.json({ suppliers: await searchSuppliers(q, 25) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Vantar nafn birgis" }, { status: 400 });
  const cols = FIELDS.filter((f) => body[f] !== undefined && body[f] !== "");
  const vals = cols.map((f) => body[f]);
  const ph = cols.map((_, i) => `$${i + 1}`);
  try {
    const r = await db.query<{ id: string; name: string; kennitala: string | null }>(
      `insert into acc.suppliers (${cols.join(",")}) values (${ph.join(",")}) returning id, name, kennitala`, vals);
    return NextResponse.json({ ok: true, supplier: r.rows[0] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: msg.includes("kennitala") || msg.includes("unique") ? "Kennitala eða númer birgis er þegar skráð" : "Villa við skráningu birgis" }, { status: 400 });
  }
}
