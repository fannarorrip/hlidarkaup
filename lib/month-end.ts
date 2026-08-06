// Month-end consolidated billing run for 'consolidated' and 'staff' account customers. Gathers
// each customer's UNBILLED account sales in the period into ONE invoice (grouped by shopping trip),
// and marks those sales billed. Does NOT post new ledger vouchers (AR already booked).
// 'consolidated' fær að auki EINA bankakröfu; 'staff' (starfsmenn) fær ENGA kröfu — úttektin
// dregst af launum: M-reikningurinn er frádráttarseðillinn og bókarinn jafnar viðskiptakröfuna
// á móti launum þegar þau eru greidd.
import { db, query } from "@/lib/db";
import { enqueueMonthlyClaim } from "@/lib/claims";

const pad = (n: number) => String(n).padStart(2, "0");
export function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` };
}

interface UnbilledRow {
  voucher_id: string; customer_id: string; customer_name: string; kennitala: string | null;
  rafraen_vidskipti: boolean; email: string | null; billing_mode: string;
  voucher_date: string; series_code: string; voucher_number: string; gross: string;
}

function unbilledSales(from: string, to: string) {
  return query<UnbilledRow>(`
    select v.id as voucher_id, v.customer_id, c.name as customer_name, c.kennitala, c.rafraen_vidskipti, c.email, c.billing_mode,
           v.voucher_date::text as voucher_date, v.series_code, v.voucher_number, coalesce(sum(le.debit),0) as gross
    from acc.vouchers v
    join acc.ledger_entries le on le.voucher_id = v.id
    join shop.customers c on c.id = v.customer_id
    where v.voucher_type = 'account_sale' and v.status = 'posted'
      and c.billing_mode in ('consolidated','staff','instore') and c.is_generic = false
      and v.voucher_date between $1::date and $2::date
      and not exists (select 1 from acc.billing_invoice_vouchers biv where biv.voucher_id = v.id)
    group by v.id, v.customer_id, c.name, c.kennitala, c.rafraen_vidskipti, c.email, c.billing_mode, v.voucher_date, v.series_code, v.voucher_number
    order by c.name, v.voucher_date, v.voucher_number`, [from, to]);
}

export interface PreviewCustomer { customerId: string; name: string; kennitala: string | null; rafraen: boolean; hasEmail: boolean; staff: boolean; instore: boolean; tripCount: number; total: number }
export async function previewMonthEnd(period: string): Promise<{ from: string; to: string; customers: PreviewCustomer[] }> {
  const { from, to } = periodRange(period);
  const rows = await unbilledSales(from, to);
  const byCust = new Map<string, PreviewCustomer>();
  for (const r of rows) {
    let g = byCust.get(r.customer_id);
    if (!g) { g = { customerId: r.customer_id, name: r.customer_name, kennitala: r.kennitala, rafraen: r.rafraen_vidskipti, hasEmail: !!r.email, staff: r.billing_mode === "staff", instore: r.billing_mode === "instore", tripCount: 0, total: 0 }; byCust.set(r.customer_id, g); }
    g.tripCount++; g.total += Math.round(Number(r.gross));
  }
  return { from, to, customers: [...byCust.values()] };
}

export async function runMonthEnd(period: string, createdBy = "bokhald"): Promise<{ runId: string; invoiceCount: number; total: number }> {
  const { from, to } = periodRange(period);
  const rows = await unbilledSales(from, to);

  const byCust = new Map<string, UnbilledRow[]>();
  for (const r of rows) { if (!byCust.has(r.customer_id)) byCust.set(r.customer_id, []); byCust.get(r.customer_id)!.push(r); }

  // sale_lines for all involved vouchers (for the grouped-by-trip detail)
  const allVoucherIds = rows.map((r) => r.voucher_id);
  const linesByV = new Map<string, { name: string; quantity: string; line_total: string; vat_rate: string }[]>();
  if (allVoucherIds.length) {
    const lines = await query<{ voucher_id: string; name: string; quantity: string; line_total: string; vat_rate: string }>(
      `select voucher_id, name, quantity, line_total, vat_rate from shop.sale_lines where voucher_id = any($1::uuid[]) order by voucher_id, line_no`, [allVoucherIds]);
    for (const l of lines) { if (!linesByV.has(l.voucher_id)) linesByV.set(l.voucher_id, []); linesByV.get(l.voucher_id)!.push(l); }
  }

  const client = await db.connect();
  let invoiceCount = 0, total = 0;
  const createdInvoiceIds: string[] = [];
  try {
    await client.query("begin");
    const run = (await client.query<{ id: string }>(`insert into acc.billing_runs (period, from_date, to_date, created_by) values ($1,$2,$3,$4) returning id`, [period, from, to, createdBy])).rows[0];

    for (const [customerId, trips] of byCust) {
      const c = trips[0];
      const detail = trips.map((t) => ({
        voucherId: t.voucher_id, date: t.voucher_date, series_code: t.series_code, voucher_number: t.voucher_number,
        total: Math.round(Number(t.gross)),
        lines: (linesByV.get(t.voucher_id) || []).map((l) => ({ name: l.name, quantity: Number(l.quantity), line_total: Math.round(Number(l.line_total)), vat_rate: Number(l.vat_rate) })),
      }));
      const custTotal = trips.reduce((a, t) => a + Math.round(Number(t.gross)), 0);
      const seq = (await client.query<{ n: string }>(`select nextval('acc.billing_invoice_seq') as n`)).rows[0].n;
      const invNo = `M-${String(seq).padStart(6, "0")}`;
      const delivery = c.rafraen_vidskipti ? "einvoice" : c.email ? "pdf" : "none";
      // Starfsmenn: engin bankakrafa — claim_status 'staff' merkir reikninginn sem launafrádrátt
      // (M-reikningurinn er frádráttarseðillinn) og hann fer ALDREI í kröfubiðröðina.
      // 'instore' fær heldur ENGA kröfu — viðskiptamaðurinn kemur í verslunina um mánaðamót
      // og borgar summuna á posanum (Innborgun á reikning á kassanum jafnar viðskiptakröfuna).
      const noClaim = c.billing_mode === "staff" || c.billing_mode === "instore";
      const claimStatus = c.billing_mode === "staff" ? "staff" : c.billing_mode === "instore" ? "instore" : "queued";

      const bi = (await client.query<{ id: string }>(
        `insert into acc.billing_invoices (run_id, invoice_number, customer_id, kennitala, customer_name, period, trip_count, total, detail, delivery, claim_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) returning id`,
        [run.id, invNo, customerId, (c.kennitala || "").replace(/\D/g, "") || null, c.customer_name, period, trips.length, custTotal, JSON.stringify(detail), delivery, claimStatus])).rows[0];
      for (const t of trips) await client.query(`insert into acc.billing_invoice_vouchers (billing_invoice_id, voucher_id) values ($1,$2) on conflict do nothing`, [bi.id, t.voucher_id]);
      if (!noClaim) createdInvoiceIds.push(bi.id);
      invoiceCount++; total += custTotal;
    }

    await client.query(`update acc.billing_runs set invoice_count=$1, total=$2 where id=$3`, [invoiceCount, total, run.id]);
    await client.query("commit");

    // Queue ONE bank claim (krafa) per consolidated invoice — after commit, best-effort
    // (the invoice exists regardless; enqueue is idempotent and retriable). AR was already
    // booked per sale, so the claim just collects the month's total.
    for (const id of createdInvoiceIds) {
      try { await enqueueMonthlyClaim(id); } catch { /* never fail the run over a claim */ }
    }

    return { runId: run.id, invoiceCount, total };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// Sendir ósenda mánaðarreikninga (delivery_status queued/failed) sem PDF-viðhengi í tölvupósti
// gegnum Resend — sama leið og e-kvittanir kassans. Netfangið er lesið af viðskiptamanninum NÚNA
// (ekki eins og það var við keyrsluna) svo nýskráð netfang dugi. Rafræn-viðskipti-fólk fær líka
// PDF-póst á meðan inExchange-sendingin er í lamasessi — betra að reikningurinn BERIST.
// Starfsmannareikningar (claim_status 'staff') fá "dregst af launum"-texta í stað kröfutexta.
export interface EmailInvoicesResult { sent: number; skipped: number; failed: number; errors: string[] }
export async function emailBillingInvoices(): Promise<EmailInvoicesResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: 0, skipped: 0, failed: 0, errors: ["RESEND_API_KEY vantar — enginn póstur sendur."] };
  const { renderStatementInvoicePdf } = await import("@/lib/pdf/statement-invoice");
  const from = process.env.RECEIPT_FROM ?? "Hlíðarkaup <onboarding@resend.dev>";
  const rows = await query<{ id: string; invoice_number: string; customer_name: string | null; kennitala: string | null;
    period: string; total: string; detail: unknown; claim_status: string; email: string | null }>(`
    select b.id, b.invoice_number, b.customer_name, b.kennitala, b.period, b.total::text as total, b.detail, b.claim_status, c.email
    from acc.billing_invoices b
    left join shop.customers c on c.id = b.customer_id
    where b.delivery_status in ('queued','failed')
    order by b.created_at asc limit 200`);
  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];
  const MAN = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
  for (const b of rows) {
    const email = (b.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; continue; }
    try {
      const m = /^(\d{4})-(\d{2})$/.exec(b.period);
      const tímabil = m && MAN[+m[2] - 1] ? `${MAN[+m[2] - 1]} ${m[1]}` : b.period;
      const pdf = await renderStatementInvoicePdf({
        invoice_number: b.invoice_number, customer_name: b.customer_name, kennitala: b.kennitala,
        period: b.period, total: Math.round(Number(b.total)),
        trips: (Array.isArray(b.detail) ? b.detail : []) as import("@/lib/pdf/statement-invoice").StatementTrip[],
      });
      const krTxt = Math.round(Number(b.total)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const payLine = b.claim_status === "staff"
        ? "Upphæðin dregst af launum — engin krafa er send."
        : b.claim_status === "instore"
        ? "Upphæðin greiðist í versluninni — engin krafa er send."
        : "Krafa (greiðsluseðill) fylgir í heimabanka.";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          from, to: [email],
          subject: `Mánaðarreikningur ${b.invoice_number} — ${tímabil} — Hlíðarkaup`,
          html: `<p>Sæl/l,</p><p>Meðfylgjandi er mánaðarreikningur nr. <b>${b.invoice_number}</b> fyrir úttektir í ${tímabil}, samtals <b>${krTxt} kr.</b>, sundurliðaður eftir úttektum.</p><p>${payLine}</p><p>Kær kveðja,<br/>Hlíðarkaup</p>`,
          attachments: [{ filename: `${b.invoice_number}.pdf`, content: Buffer.from(pdf).toString("base64") }],
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
      await query(`update acc.billing_invoices set delivery_status = 'sent' where id = $1`, [b.id]);
      sent++;
    } catch (e) {
      await query(`update acc.billing_invoices set delivery_status = 'failed' where id = $1`, [b.id]).catch(() => {});
      failed++;
      errors.push(`${b.invoice_number}: ${e instanceof Error ? e.message : "villa"}`.slice(0, 120));
    }
  }
  return { sent, skipped, failed, errors };
}

// Fjöldi ósendra reikninga sem HÆGT er að senda (viðskiptamaðurinn hefur netfang) — fyrir takkann.
export const countUnsentBillingInvoices = () =>
  query<{ n: string }>(`
    select count(*) as n from acc.billing_invoices b
    join shop.customers c on c.id = b.customer_id
    where b.delivery_status in ('queued','failed') and coalesce(c.email,'') <> ''`)
    .then((r) => Number(r[0]?.n || 0));

export interface BillingInvoiceRow {
  id: string; invoice_number: string; customer_name: string | null; kennitala: string | null;
  period: string; trip_count: number; total: string; delivery: string | null;
  delivery_status: string; claim_status: string; created_at: string;
}
export const getBillingInvoices = (limit = 200) =>
  query<BillingInvoiceRow>(`
    select id, invoice_number, customer_name, kennitala, period, trip_count, total, delivery, delivery_status, claim_status, created_at::text as created_at
    from acc.billing_invoices order by created_at desc limit $1`, [limit]);

export const getBillingInvoice = (id: string) =>
  query<{ id: string; invoice_number: string; customer_name: string | null; kennitala: string | null; period: string; total: string; detail: unknown }>(
    `select id, invoice_number, customer_name, kennitala, period, total, detail from acc.billing_invoices where id = $1`, [id]).then((r) => r[0] ?? null);
