import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/accounting-queries";

// Accent-insensitive product search over ALL products. Gated by middleware (/api/products).
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ products: [] });
  return NextResponse.json({ products: await searchProducts(q, 500) });
}
