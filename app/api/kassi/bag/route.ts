import { NextResponse } from "next/server";
import { getReglaToken, reglaPost, grossPrice, vatPct } from "@/lib/regla";

/** Returns the bag product (BURÐARPOKI) offered before payment. */
export async function GET() {
  const productNumber = process.env.KASSI_BAG_PRODUCT ?? "";
  if (!productNumber) return NextResponse.json({ error: "No bag product configured" }, { status: 404 });

  try {
    const token = await getReglaToken();
    const data = await reglaPost("GetProduct", { token, productNumber });
    const p = data?.Returned;
    if (!p) return NextResponse.json({ error: "Bag product not found" }, { status: 404 });

    return NextResponse.json({
      id: String(p.ProductNumber),
      name: p.Name ?? "Burðarpoki",
      price: grossPrice(p),
      vatPct: vatPct(p),
    });
  } catch (err) {
    console.error("[Kassi] bag error:", err);
    return NextResponse.json({ error: "Villa" }, { status: 500 });
  }
}
