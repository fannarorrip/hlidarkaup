import { NextRequest, NextResponse } from "next/server";
import { postSale } from "@/lib/sales";
import { query } from "@/lib/db";

interface Item { title: string; price?: number; quantity?: number; vat_rate?: number }
interface Body {
  email?: string;
  ref?: string;
  plan?: "once" | "subscription";
  deliveryType?: "pickup" | "delivery";
  address?: string | null;
  time?: string;
  date?: string;
  items?: Item[];
  shipping?: number;
  total?: number;
}

/** Book an SVO GOTT (eldhús) online order to the accounting ledger.
 *  Best-effort: never throws, so a ledger hiccup can't block the customer's order.
 *  Itemises when per-item prices are sent; otherwise books the order total at 11% VSK (matur). */
async function bookEldhusSale(b: Body): Promise<void> {
  try {
    const items = b.items ?? [];
    const total = Math.round(Number(b.total ?? 0));
    if (!items.length || !(total > 0)) return;

    const havePrices = items.every((i) => typeof i.price === "number" && (i.price ?? 0) > 0);
    const extraLines = havePrices
      ? items.map((i) => ({ description: i.title, gross: Math.round((i.price ?? 0) * (i.quantity ?? 1)), vat_rate: i.vat_rate ?? 11 }))
      : [{ description: `SVO GOTT pöntun${b.ref ? ` #${b.ref}` : ""}${b.plan === "subscription" ? " (áskrift/viku)" : ""}`, gross: total, vat_rate: 11 }];
    // Delivery is a separate 24% service line, so the itemised total still matches grandTotal.
    const shipping = Math.round(Number(b.shipping ?? 0));
    if (havePrices && shipping > 0) extraLines.push({ description: "Heimsending", gross: shipping, vat_rate: 24 });

    let customerId: string | null = null;
    try { customerId = (await query<{ id: string }>(`select id from shop.customers where is_generic limit 1`))[0]?.id ?? null; } catch { /* ignore */ }

    await postSale([], {
      mode: "card", customerId, source: "eldhus", voucherType: "eldhus_sale",
      description: `Eldhússala${b.ref ? ` – #${b.ref}` : ""}`,
      reference: b.ref ? `ELDHUS-${b.ref}` : `ELDHUS-${Date.now()}`,
      extraLines, decrementStock: false,
    });
  } catch (err) {
    console.warn("[SVO GOTT] ledger post failed:", err instanceof Error ? err.message : err);
  }
}

/** Book the order to the ledger, then send the SVO GOTT confirmation email via Resend. */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ógild beiðni" }, { status: 400 });
  }

  // Record the sale in the books first (independent of email delivery).
  await bookEldhusSale(body);

  const email = (body.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Ógilt netfang" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Email not configured — don't fail the order, just report it wasn't sent.
    return NextResponse.json({ sent: false, reason: "not_configured" });
  }

  const from = process.env.RECEIPT_FROM ?? "Hlíðarkaup <onboarding@resend.dev>";
  const html = confirmHtml(body);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `SVO GOTT — pöntun staðfest${body.ref ? ` (#${body.ref})` : ""}`,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[SVO GOTT] confirm email failed:", res.status, txt.slice(0, 300));
      return NextResponse.json({ sent: false }, { status: 502 });
    }
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[SVO GOTT] confirm email error:", err);
    return NextResponse.json({ sent: false }, { status: 502 });
  }
}

function kr(n: number) {
  return `${Math.round(n).toLocaleString("is-IS")} kr.`;
}
function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function confirmHtml(b: Body) {
  const items = (b.items ?? []).map((i) => `<li style="padding:3px 0;color:#21323A">${esc(i.title)}</li>`).join("");
  const fulfilment = b.deliveryType === "delivery"
    ? `Heimsending${b.address ? ` — ${esc(b.address)}` : ""}`
    : "Sókn í Hlíðarkaup, Akurhlíð 1";
  return `<!doctype html><html><body style="margin:0;background:#FFF6F6;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #E4F1F0">
      <div style="background:#2C687B;padding:24px;text-align:center">
        <div style="color:#fff;font-weight:800;font-size:22px;letter-spacing:.5px">SVO <span style="color:#DB1A1A">GOTT</span></div>
      </div>
      <div style="padding:24px;color:#21323A">
        <h1 style="font-size:22px;margin:0 0 6px">Takk fyrir pöntunina!</h1>
        <p style="margin:0 0 16px;color:#5C6B72">
          ${b.plan === "subscription" ? "Áskriftin þín er virk." : "Pöntunin þín er staðfest."}
          ${b.ref ? ` Pöntunarnúmer <strong>#${esc(b.ref)}</strong>.` : ""}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
          <tr><td style="padding:4px 0;color:#5C6B72">Afhending</td><td style="padding:4px 0;text-align:right">${fulfilment}</td></tr>
          <tr><td style="padding:4px 0;color:#5C6B72">Dagur</td><td style="padding:4px 0;text-align:right">${esc(b.date ?? "")}</td></tr>
          <tr><td style="padding:4px 0;color:#5C6B72">Tími</td><td style="padding:4px 0;text-align:right">${esc(b.time ?? "")}</td></tr>
        </table>
        <p style="font-weight:700;margin:0 0 4px">Réttir</p>
        <ul style="margin:0 0 16px;padding-left:18px;font-size:14px">${items}</ul>
        <div style="border-top:2px dashed #E4F1F0;padding-top:12px;display:flex;justify-content:space-between">
          <span style="font-weight:700">Samtals${b.plan === "subscription" ? " á viku" : ""}</span>
          <span style="font-weight:800;color:#DB1A1A;font-size:20px">${kr(b.total ?? 0)}</span>
        </div>
        <p style="margin:18px 0 0;color:#5C6B72;font-size:13px">Hlíðarkaup · Akurhlíð 1, Sauðárkrókur · 455-4500</p>
      </div>
    </div>
  </div></body></html>`;
}
