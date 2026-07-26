import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Next free product number (6-digit running sequence) — prefill for "Búa til nýja vöru".
// Gated stjornandi/bokari via middleware (/api/products).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await query<{ mx: number | null }>(
    `select max(product_number::int) mx from shop.products where product_number ~ '^[0-9]{6}$'`);
  return NextResponse.json({ next: String((r[0]?.mx ?? 100000) + 1).padStart(6, "0") });
}
