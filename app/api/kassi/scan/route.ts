import { NextRequest, NextResponse } from "next/server";
import { getReglaToken, reglaPost, grossPrice } from "@/lib/regla";

/** Look up a product by barcode (primary) or product number (fallback). */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "Vantar strikamerki" }, { status: 400 });

  try {
    const token = await getReglaToken();

    let product = (await reglaPost("GetProductByBarcode", { token, barcode: code }))?.Returned;
    if (!product) {
      product = (await reglaPost("GetProduct", { token, productNumber: code }))?.Returned;
    }
    if (!product) {
      return NextResponse.json({ error: `Vara fannst ekki (${code})` }, { status: 404 });
    }

    // KASSI_IGNORE_STOCK=true disables stock limits while testing
    const ignoreStock = process.env.KASSI_IGNORE_STOCK === "true";
    const stock = !ignoreStock && product.IsInStockControl
      ? Math.max(0, Math.floor(product.StockQuantity ?? 0))
      : undefined;

    return NextResponse.json({
      id: String(product.ProductNumber),
      name: product.Name ?? "",
      price: grossPrice(product),
      stock,
    });
  } catch (err) {
    console.error("[Kassi] scan error:", err);
    return NextResponse.json({ error: "Villa við að sækja vöru" }, { status: 500 });
  }
}
