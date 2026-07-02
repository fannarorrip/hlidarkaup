import { NextRequest, NextResponse } from "next/server";
import { getSupplierReturn, markSupplierReturnSent } from "@/lib/supplier-returns";
import { renderSupplierReturnPdf } from "@/lib/pdf/supplier-return";

// Send a skilanóta to the supplier. via='email' → PDF attachment (Resend, gated);
// via='inexchange' → 501 (electronic credit-note channel not wired).
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { via } = await req.json().catch(() => ({}));
  const r = await getSupplierReturn(id);
  if (!r) return NextResponse.json({ error: "Skil fundust ekki" }, { status: 404 });

  if (via === "inexchange") return NextResponse.json({ ok: false, error: "Rafræn skilanóta gegnum inExchange er ekki tengd enn." }, { status: 501 });

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "Tölvupóstur ekki uppsettur (RESEND_API_KEY vantar)." }, { status: 503 });
  if (!r.supplier_email) return NextResponse.json({ ok: false, error: "Birgir er ekki með skráð netfang." }, { status: 400 });

  const pdf = await renderSupplierReturnPdf(r);
  const from = process.env.RECEIPT_FROM ?? "Hlíðarkaup <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [r.supplier_email], subject: `Skilanóta ${r.return_number} frá Hlíðarkaup`, html: `<p>Sælir,</p><p>Meðfylgjandi er skilanóta nr. <b>${r.return_number}</b> vegna vöruskila.</p>`, attachments: [{ filename: `${r.return_number}.pdf`, content: Buffer.from(pdf).toString("base64") }] }),
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: `Resend ${res.status}` }, { status: 502 });
  await markSupplierReturnSent(id, "email");
  return NextResponse.json({ ok: true });
}
