import { NextRequest, NextResponse } from "next/server";
import { postSale, SaleError, type ExtraLine } from "@/lib/sales";
import { enqueueClaim } from "@/lib/claims";
import { query } from "@/lib/db";

// Búa til reikning: manually build + book a sölureikningur (á reikning), then create a bank
// claim (krafa). Delivery (inExchange vs email PDF) is chosen afterwards by the caller via
// the existing /api/einvoice/{id}/send and /api/reikningur/{id}/email endpoints.
// Gated stjornandi/bokari via middleware (/api/reikningur).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InLine { description: string; quantity: number; unitPrice: number; vatRate: number; }

const VAT_ALLOWED = new Set([24, 11, 0]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as { customerId?: string; lines?: InLine[]; reference?: string; description?: string }));
  const customerId = String(body.customerId || "");
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!customerId) return NextResponse.json({ error: "Veldu viðskiptamann." }, { status: 400 });

  const lines: ExtraLine[] = [];
  for (const l of rawLines) {
    const desc = String(l.description || "").trim();
    const qty = Number(l.quantity) || 0;
    const unit = Math.round(Number(l.unitPrice) || 0);
    const vat = Number(l.vatRate);
    if (!desc || qty <= 0 || unit <= 0) continue;
    if (!VAT_ALLOWED.has(vat)) return NextResponse.json({ error: `Ógilt VSK-þrep: ${vat}` }, { status: 400 });
    lines.push({ description: desc, gross: Math.round(qty * unit), vat_rate: vat, quantity: qty, unitPrice: unit });
  }
  if (!lines.length) return NextResponse.json({ error: "Bættu við a.m.k. einni línu (lýsing, magn, verð)." }, { status: 400 });

  const cust = (await query<{ is_account: boolean; rafraen_vidskipti: boolean; email: string | null; name: string; kennitala: string | null }>(
    `select is_account, rafraen_vidskipti, email, name, kennitala from shop.customers where id = $1`, [customerId]))[0];
  if (!cust) return NextResponse.json({ error: "Viðskiptamaður fannst ekki." }, { status: 404 });
  if (!cust.is_account) return NextResponse.json({ error: "Þessi viðskiptamaður má ekki kaupa á reikning." }, { status: 400 });

  try {
    // Book the invoice (á reikning) as a real sölureikningur. skipBilling: we drive claim + delivery.
    const res = await postSale([], {
      mode: "account", series: "SALES", voucherType: "sölureikningur",
      customerId, extraLines: lines, decrementStock: false, ignoreStock: true,
      description: (body.description || `Reikningur – ${cust.name}`).slice(0, 140),
      reference: (body.reference || "").trim() || undefined,
      source: "handvirkur", skipBilling: true,
    });

    // Krafa (bank claim) on booking, as requested. Idempotent per voucher; never blocks the invoice.
    const claim = await enqueueClaim(res.voucherId).catch(() => ({ queued: false, reason: "error" }));

    return NextResponse.json({
      ok: true,
      voucherId: res.voucherId,
      invoiceNumber: res.invoiceNumber,
      claimQueued: claim.queued,
      claimReason: claim.queued ? undefined : ("reason" in claim ? claim.reason : undefined),
      customer: { rafraen: cust.rafraen_vidskipti, email: cust.email, hasKennitala: !!cust.kennitala, name: cust.name },
    });
  } catch (e) {
    if (e instanceof SaleError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("reikningur/create failed:", e);
    return NextResponse.json({ error: "Bókun mistókst." }, { status: 500 });
  }
}
