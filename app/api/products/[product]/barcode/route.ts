import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Add a barcode to a product.
export async function POST(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const { barcode } = await req.json();
  const bc = String(barcode ?? "").trim();
  if (!bc) return NextResponse.json({ error: "Tómt strikamerki" }, { status: 400 });

  const exists = await query(`select 1 from shop.products where product_number = $1`, [product]);
  if (!exists.length) return NextResponse.json({ error: "Vara fannst ekki" }, { status: 404 });

  try {
    await query(`insert into shop.product_barcodes (barcode, product_number) values ($1, $2)`, [bc, product]);
  } catch {
    return NextResponse.json({ error: "Strikamerki er þegar skráð (á þessa eða aðra vöru)" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, barcode: bc });
}

// Remove a barcode: DELETE /api/products/<n>/barcode?barcode=...
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const bc = new URL(req.url).searchParams.get("barcode");
  if (!bc) return NextResponse.json({ error: "Vantar strikamerki" }, { status: 400 });
  await query(`delete from shop.product_barcodes where product_number = $1 and barcode = $2`, [product, bc]);
  return NextResponse.json({ ok: true });
}
