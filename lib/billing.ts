// Per-sale billing router for account sales. Runs after an account-sale voucher is posted.
//   billing_mode 'consolidated' → do nothing now; the month-end run bills it (Batch 5).
//   billing_mode 'per_trip'     → bill immediately: deliver the invoice (e-invoice to rafræn
//                                 viðskipti customers, else PDF-by-email) + queue a bank claim.
// Best-effort: never throws (must not break the sale).
import { db } from "@/lib/db";
import { enqueueEinvoice } from "@/lib/einvoice-outbox";
import { emailInvoicePdf } from "@/lib/invoice-email";
import { enqueueClaim } from "@/lib/claims";

export async function handleAccountSaleBilling(voucherId: string, customerId: string): Promise<void> {
  try {
    const c = (await db.query<{ billing_mode: string; rafraen_vidskipti: boolean; email: string | null }>(
      `select billing_mode, rafraen_vidskipti, email from shop.customers where id = $1`, [customerId])).rows[0];
    if (!c || c.billing_mode !== "per_trip") return; // consolidated → handled by the month-end run

    // Deliver the invoice
    if (c.rafraen_vidskipti) {
      await enqueueEinvoice(voucherId);                 // inExchange (gated by INEXCHANGE_SEND_ENABLED)
    } else if (c.email) {
      try { await emailInvoicePdf(voucherId, c.email); } catch { /* email best-effort */ }
    }

    // Queue a bank claim (krafa) — gated/on-hold until Arion B2B Claims is live
    await enqueueClaim(voucherId);
  } catch { /* never break the sale */ }
}
