import { NextRequest, NextResponse } from "next/server";
import { postSupplierReturn, listSupplierReturns } from "@/lib/supplier-returns";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ returns: await listSupplierReturns(100) });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await postSupplierReturn({ supplierId: b.supplierId, supplierName: b.supplierName, note: b.note, lines: b.lines ?? [] }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Villa" }, { status: 400 });
  }
}
