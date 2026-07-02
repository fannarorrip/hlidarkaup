import { NextRequest, NextResponse } from "next/server";
import { searchProductsForPicker } from "@/lib/accounting-queries";

// Product search for the móttaka product-picker.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  return NextResponse.json({ products: await searchProductsForPicker(q, 25) });
}
