import { NextRequest, NextResponse } from "next/server";
import { searchProducts, getProductsWithoutSupplier } from "@/lib/accounting-queries";

// Accent-insensitive product search over ALL products. Gated by middleware (/api/products).
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  if (sp.get("nosupplier") === "1") return NextResponse.json({ products: await getProductsWithoutSupplier(500) });
  const q = (sp.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ products: [] });
  return NextResponse.json({ products: await searchProducts(q, 500) });
}
