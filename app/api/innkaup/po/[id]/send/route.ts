import { NextRequest, NextResponse } from "next/server";
import { getPurchaseOrder, markPurchaseOrderSent } from "@/lib/purchase-orders";
import { renderPurchaseOrderPdf } from "@/lib/pdf/purchase-order";

// Send a purchase order to the supplier. via='email' → PDF attachment (Resend, gated);
// via='inexchange' → electronic PEPPOL order — NOT wired yet (inExchange outbound order channel
// unconfirmed), returns 501 so the UI can fall back to email.
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { via } = await req.json().catch(() => ({}));
  const po = await getPurchaseOrder(id);
  if (!po) return NextResponse.json({ error: "Pöntun fannst ekki" }, { status: 404 });

  if (via === "inexchange") {
    return NextResponse.json({ ok: false, error: "Rafræn pöntun gegnum inExchange er ekki tengd enn (þarf pöntunarrás staðfesta hjá inExchange)." }, { status: 501 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "Tölvupóstur ekki uppsettur (RESEND_API_KEY vantar)." }, { status: 503 });
  if (!po.supplier_email) return NextResponse.json({ ok: false, error: "Birgir er ekki með skráð netfang." }, { status: 400 });

  const pdf = await renderPurchaseOrderPdf(po);
  const from = process.env.RECEIPT_FROM ?? "Hlíðarkaup <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [po.supplier_email], subject: `Innkaupapöntun ${po.po_number} frá Hlíðarkaup`, html: `<p>Sælir,</p><p>Meðfylgjandi er innkaupapöntun nr. <b>${po.po_number}</b> frá Hlíðarkaup.</p>`, attachments: [{ filename: `${po.po_number}.pdf`, content: Buffer.from(pdf).toString("base64") }] }),
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: `Resend ${res.status}` }, { status: 502 });
  await markPurchaseOrderSent(id, "email");
  return NextResponse.json({ ok: true });
}
