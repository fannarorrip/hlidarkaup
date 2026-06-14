import { NextRequest, NextResponse } from "next/server";

/**
 * Product image lookup by EAN barcode via Open Food Facts.
 * Regla has no product images, so this fills them in for scanned branded
 * items. Results (including misses) are cached in-process to avoid repeat calls.
 */
const cache = new Map<string, string | null>();

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("barcode")?.trim() ?? "";
  // Only real EAN/UPC barcodes — skip Regla's internal/PLU codes (e.g. "15-026003")
  if (!/^\d{8,14}$/.test(code)) return NextResponse.json({ image: null });
  if (cache.has(code)) return NextResponse.json({ image: cache.get(code) });

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=image_front_small_url,image_small_url,image_front_url`,
      { headers: { "User-Agent": "Hlidarkaup-Kassi/1.0 (kassi@hlidarkaup.is)" } },
    );
    const data = await res.json();
    const p = data?.status === 1 ? data.product : null;
    const image: string | null =
      p?.image_front_small_url || p?.image_small_url || p?.image_front_url || null;
    cache.set(code, image);
    return NextResponse.json({ image });
  } catch {
    return NextResponse.json({ image: null });
  }
}
