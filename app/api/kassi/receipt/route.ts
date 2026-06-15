import { NextRequest, NextResponse } from "next/server";

interface Line { name: string; quantity: number; price: number }

/** Email an e-receipt (rafræn kvittun) via Resend. */
export async function POST(req: NextRequest) {
  let body: { email?: string; items?: Line[]; total?: number; vat?: number; invoiceNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ógild beiðni" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Ógilt netfang" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Tölvupóstur er ekki uppsettur" }, { status: 503 });
  }

  const from = process.env.RECEIPT_FROM ?? "Hlíðarkaup <onboarding@resend.dev>";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const items = Array.isArray(body.items) ? body.items : [];
  const html = receiptHtml({ items, total: body.total ?? 0, vat: body.vat ?? 0, invoiceNumber: body.invoiceNumber ?? "", site });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Kvittun frá Hlíðarkaup${body.invoiceNumber ? ` nr. ${body.invoiceNumber}` : ""}`,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[Kassi] receipt email failed:", res.status, txt.slice(0, 300));
      return NextResponse.json({ error: "Tókst ekki að senda kvittun" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Kassi] receipt email error:", err);
    return NextResponse.json({ error: "Tókst ekki að senda kvittun" }, { status: 502 });
  }
}

function kr(n: number) {
  return `${Math.round(n).toLocaleString("is-IS")} kr.`;
}

function receiptHtml({ items, total, vat, invoiceNumber, site }: {
  items: Line[]; total: number; vat: number; invoiceNumber: string; site: string;
}) {
  const rows = items
    .map(
      (l) => `<tr>
        <td style="padding:6px 0;color:#2B2B2B;font-size:14px">${l.quantity > 1 ? `<span style="color:#9ca3af">${l.quantity}× </span>` : ""}${escapeHtml(l.name)}</td>
        <td style="padding:6px 0;text-align:right;font-weight:700;color:#2B2B2B;font-size:14px;white-space:nowrap">${kr(l.price * l.quantity)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f7f5ef;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #eee">
      <div style="background:#eb1515;padding:22px;text-align:center">
        ${site ? `<img src="${site}/logo.png" alt="Hlíðarkaup" style="height:26px;filter:brightness(0) invert(1)" />` : `<div style="color:#fff;font-weight:800;font-size:20px;letter-spacing:1px">HLÍÐARKAUP</div>`}
        <div style="color:#ffffff;font-size:13px;margin-top:6px;opacity:.9">Akurhlíð 1 · Sauðárkrókur</div>
      </div>
      <div style="padding:24px">
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <div style="border-top:2px dashed #e5e7eb;margin:14px 0"></div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#6b7280;font-size:13px">VSK</td><td style="text-align:right;color:#6b7280;font-size:13px">${kr(vat)}</td></tr>
          <tr><td style="font-weight:700;color:#2B2B2B;padding-top:4px">Samtals</td><td style="text-align:right;font-weight:800;color:#eb1515;font-size:22px;padding-top:4px">${kr(total)}</td></tr>
        </table>
        <p style="text-align:center;color:#9ca3af;font-size:12px;margin:16px 0 2px">Greitt með korti</p>
        ${invoiceNumber ? `<p style="text-align:center;color:#9ca3af;font-size:12px;margin:0;font-family:monospace">Kvittun nr. ${escapeHtml(invoiceNumber)}</p>` : ""}
        <p style="text-align:center;color:#2B2B2B;font-weight:700;margin-top:18px">Takk fyrir viðskiptin!</p>
      </div>
    </div>
  </div></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
