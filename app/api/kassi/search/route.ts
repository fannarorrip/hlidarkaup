import { NextRequest, NextResponse } from "next/server";
import { getReglaToken, reglaPost, grossPrice, vatPct, ReglaProduct } from "@/lib/regla";

/** Product search for the kiosk — honors KASSI_IGNORE_STOCK like the rest of /api/kassi. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  try {
    const token = await getReglaToken();
    const data = await reglaPost("SearchProducts", {
      token,
      search: q,
      indexFrom: 0,
      maxRecordCount: 24,
    });

    const ignoreStock = process.env.KASSI_IGNORE_STOCK === "true";
    const products = ((data.Returned ?? []) as ReglaProduct[])
      .map((p) => ({
        id: String(p.ProductNumber),
        name: p.Name ?? "",
        price: grossPrice(p),
        vatPct: vatPct(p),
        stock: !ignoreStock && p.IsInStockControl
          ? Math.max(0, Math.floor(p.StockQuantity ?? 0))
          : undefined,
      }))
      .filter((p) => p.price > 0);

    return NextResponse.json({ products });
  } catch (err) {
    console.error("[Kassi] search error:", err);
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}
