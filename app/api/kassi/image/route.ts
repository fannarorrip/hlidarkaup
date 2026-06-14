import { NextRequest, NextResponse } from "next/server";

/**
 * Product image lookup by EAN barcode.
 *
 * PROTOTYPE: a tiny hand-seeded map of MS (Mjólkursamsalan) products, matched
 * by barcode, using image URLs from MS's public product pages. For production,
 * replace this with MS's official retailer image feed (or our own photos) —
 * same shape: barcode -> image URL.
 */
const IMAGES: Record<string, string> = {
  "5690527141000": "https://ik.imagekit.io/8yp5biery/0141.png", // Súrmjólk 1 l
  "5690527151016": "https://ik.imagekit.io/8yp5biery/0151.png", // Undanrenna 1 l
  "5690527198004": "https://ik.imagekit.io/8yp5biery/0198.png", // Súkkulaðimjólk 1 l
  "5690527185004": "https://ik.imagekit.io/8yp5biery/0185.png", // Stoðmjólk 500 ml
  "5690516059156": "https://ik.imagekit.io/8yp5biery/5915.png", // Villisveppaostur 150 g
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("barcode")?.trim() ?? "";
  return NextResponse.json({ image: IMAGES[code] ?? null });
}
