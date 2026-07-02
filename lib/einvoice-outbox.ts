// Outgoing e-invoice queue: turns a posted sölureikningur into a UBL document and (when
// enabled) transmits it via inExchange. Enqueue is automatic on posting an account sale to a
// "rafræn viðskipti" customer; transmission is gated by INEXCHANGE_SEND_ENABLED.
import { query } from "@/lib/db";
import { getSaleReceipt } from "@/lib/accounting-queries";
import { buildInvoiceUbl } from "@/lib/einvoice-ubl";
import { sendInvoice, sendStatus } from "@/lib/inexchange-send";

export interface OutboxRow {
  voucher_id: string; customer_id: string | null; recipient_kt: string | null;
  invoice_number: string | null; filename: string | null; status: string;
  attempts: number; return_code: number | null; return_string: string | null;
  last_error: string | null; created_at: string; sent_at: string | null;
}

export const getOutbox = (voucherId: string) =>
  query<OutboxRow>(
    `select voucher_id, customer_id, recipient_kt, invoice_number, filename, status, attempts,
            return_code, return_string, last_error, created_at::text, sent_at::text
       from acc.einvoice_outbox where voucher_id = $1`, [voucherId]).then((r) => r[0] ?? null);

export interface EnqueueResult { enqueued: boolean; reason?: string; sent?: boolean; error?: string }

/** Build+queue an e-invoice for a sölureikningur, if its customer is flagged for rafræn viðskipti.
 *  Idempotent (one row per voucher). Auto-transmits when sending is enabled. Never throws. */
export async function enqueueEinvoice(voucherId: string): Promise<EnqueueResult> {
  try {
    const r = await getSaleReceipt(voucherId);
    if (!r) return { enqueued: false, reason: "not_found" };

    const cust = (await query<{
      id: string; name: string; kennitala: string | null;
      address: string | null; postal_code: string | null; city: string | null; rafraen_vidskipti: boolean;
    }>(`select c.id, c.name, c.kennitala, c.address, c.postal_code, c.city, c.rafraen_vidskipti
          from acc.vouchers v join shop.customers c on c.id = v.customer_id where v.id = $1`, [voucherId]))[0];
    if (!cust || !cust.rafraen_vidskipti) return { enqueued: false, reason: "not_flagged" };

    const invoiceNumber = `${r.voucher.series_code}-${String(r.voucher.voucher_number).padStart(6, "0")}`;
    const kt = (cust.kennitala || "").replace(/\D/g, "");
    if (kt.length !== 10) {
      await query(
        `insert into acc.einvoice_outbox (voucher_id, customer_id, invoice_number, status, last_error)
           values ($1,$2,$3,'failed','Kennitölu vantar fyrir rafræna sendingu')
         on conflict (voucher_id) do update set status = case when acc.einvoice_outbox.status='sent' then 'sent' else 'failed' end,
           last_error = 'Kennitölu vantar fyrir rafræna sendingu'`,
        [voucherId, cust.id, invoiceNumber]);
      return { enqueued: false, reason: "no_kennitala" };
    }

    const built = buildInvoiceUbl({
      invoiceNumber,
      issueDate: r.voucher.voucher_date,
      dueDate: r.voucher.voucher_date,
      customer: { name: cust.name, kennitala: kt, address: cust.address, postalCode: cust.postal_code, city: cust.city },
      lines: r.lines,
    });
    const filename = `reikningur-${invoiceNumber}.xml`;
    await query(
      `insert into acc.einvoice_outbox (voucher_id, customer_id, recipient_kt, invoice_number, filename, ubl_xml, status)
         values ($1,$2,$3,$4,$5,$6,'queued')
       on conflict (voucher_id) do update set
         recipient_kt = excluded.recipient_kt, invoice_number = excluded.invoice_number,
         filename = excluded.filename, ubl_xml = excluded.ubl_xml, last_error = null,
         status = case when acc.einvoice_outbox.status = 'sent' then 'sent' else 'queued' end`,
      [voucherId, cust.id, kt, invoiceNumber, filename, built.xml]);

    if (sendStatus().enabled) {
      const s = await sendOutbox(voucherId);
      return { enqueued: true, sent: s.sent, error: s.error };
    }
    return { enqueued: true };
  } catch (e) {
    return { enqueued: false, reason: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

export interface SendOutboxResult { ok: boolean; sent: boolean; status: string; error?: string; returnString?: string }

/** Transmit a queued outbox row (real, billable). Respects the INEXCHANGE_SEND_ENABLED gate
 *  (when off, leaves the row 'queued' rather than marking it failed). */
export async function sendOutbox(voucherId: string): Promise<SendOutboxResult> {
  const row = (await query<{ filename: string | null; ubl_xml: string | null; status: string }>(
    `select filename, ubl_xml, status from acc.einvoice_outbox where voucher_id = $1`, [voucherId]))[0];
  if (!row) return { ok: false, sent: false, status: "none", error: "Reikningurinn er ekki í rafrænu pósthólfi (ekki rafræn viðskipti?)." };
  if (row.status === "sent") return { ok: true, sent: true, status: "sent" };
  if (!row.ubl_xml) return { ok: false, sent: false, status: row.status, error: "UBL skjal vantar." };
  if (!sendStatus().enabled) return { ok: false, sent: false, status: "queued", error: "Rafræn sending er óvirk (stillið INEXCHANGE_SEND_ENABLED=true)." };

  const res = await sendInvoice(row.filename || `reikningur-${voucherId}.xml`, row.ubl_xml);
  const status = res.sent ? "sent" : "failed";
  await query(
    `update acc.einvoice_outbox set status = $2, attempts = attempts + 1, return_code = $3,
       return_string = $4, last_error = $5, sent_at = case when $6 then now() else sent_at end
     where voucher_id = $1`,
    [voucherId, status, res.returnCode ?? null, res.returnString ?? null, res.error ?? null, res.sent]);
  return { ok: res.ok, sent: res.sent, status, error: res.error, returnString: res.returnString };
}
