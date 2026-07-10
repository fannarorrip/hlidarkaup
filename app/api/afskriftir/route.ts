import { NextRequest, NextResponse } from "next/server";
import { lookupProduct, addWriteOff, deleteWriteOff, listWriteOffs, supplierCreditSummary, markSupplierCredited } from "@/lib/afskriftir";

// Afskriftaskráning. Gated via middleware (/api/afskriftir — same staff gating as bókhald).
//   GET  ?q=…           -> product lookup (barcode exact, else name search)
//   GET                  -> recent write-offs + supplier credit summary
//   POST { productNumber, qty, reason, note }        -> record
//   POST { action:'credit', supplier }               -> mark supplier's items credited
//   DELETE { id }        -> undo (restores stock)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q");
  if (q && q.trim().length >= 2) {
    return NextResponse.json({ ok: true, hits: await lookupProduct(q) });
  }
  const [rows, summary] = await Promise.all([listWriteOffs(30), supplierCreditSummary()]);
  return NextResponse.json({ ok: true, rows, summary });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "credit") {
    const supplier = String(body.supplier || "").trim();
    if (!supplier) return NextResponse.json({ ok: false, message: "Vantar birgja." }, { status: 400 });
    const n = await markSupplierCredited(supplier);
    return NextResponse.json({ ok: true, credited: n });
  }
  const res = await addWriteOff({
    productNumber: String(body.productNumber || ""),
    qty: Number(body.qty) || 0,
    reason: String(body.reason || ""),
    note: String(body.note || "").trim() || undefined,
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ ok: false, message: "Vantar id." }, { status: 400 });
  const res = await deleteWriteOff(String(body.id));
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
