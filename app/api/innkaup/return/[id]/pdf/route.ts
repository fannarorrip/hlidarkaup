import { NextRequest, NextResponse } from "next/server";
import { getSupplierReturn } from "@/lib/supplier-returns";
import { renderSupplierReturnPdf } from "@/lib/pdf/supplier-return";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getSupplierReturn(id);
  if (!r) return NextResponse.json({ error: "Skil fundust ekki" }, { status: 404 });
  const pdf = await renderSupplierReturnPdf(r);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.return_number}.pdf"`, "cache-control": "no-store" },
  });
}
