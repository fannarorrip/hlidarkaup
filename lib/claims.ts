// Bank claims (kröfur / greiðsluseðlar) — one per invoice voucher. Creating the claim at the
// bank goes through Arion B2B Claims (REST), which is ON HOLD (no búnaðarskilríki yet), so this
// only QUEUES rows. When ARION_CLAIMS_ENABLED=true the queue can be flushed to the bank later.
import { query } from "@/lib/db";

export interface ClaimRow {
  id: string; voucher_id: string; customer_id: string | null; customer_name: string | null;
  kennitala: string | null; amount: string; due_date: string | null; status: string;
  arion_ref: string | null; last_error: string | null; created_at: string;
  series_code: string | null; voucher_number: string | null;
}

export function claimsEnabled(): boolean {
  return (process.env.ARION_CLAIMS_ENABLED || "").toLowerCase() === "true";
}

export interface EnqueueClaimResult { queued: boolean; reason?: string }

/** Create (queue) a bank claim for a posted sales-invoice voucher. Idempotent (one per voucher).
 *  Never throws — billing must not break a sale. */
export async function enqueueClaim(voucherId: string): Promise<EnqueueClaimResult> {
  try {
    const v = (await query<{ customer_id: string | null; kennitala: string | null; gross: string; due: string | null }>(`
      select v.customer_id, c.kennitala, coalesce(sum(le.debit),0) as gross,
             (v.voucher_date + (coalesce(c.payment_terms_days,0) || ' days')::interval)::date::text as due
      from acc.vouchers v
      join acc.ledger_entries le on le.voucher_id = v.id
      left join shop.customers c on c.id = v.customer_id
      where v.id = $1
      group by v.id, v.customer_id, c.kennitala, v.voucher_date, c.payment_terms_days`, [voucherId]))[0];
    if (!v || !v.customer_id) return { queued: false, reason: "no_customer" };
    const amount = Math.round(Number(v.gross) || 0);
    if (amount <= 0) return { queued: false, reason: "no_amount" };

    const ins = await query<{ id: string }>(
      `insert into acc.claims (voucher_id, customer_id, kennitala, amount, due_date, status)
       values ($1,$2,$3,$4,$5,'queued') on conflict (voucher_id) do nothing returning id`,
      [voucherId, v.customer_id, (v.kennitala || "").replace(/\D/g, "") || null, amount, v.due]);
    // Arion Claims creation is gated/on-hold — rows stay 'queued' until the cert + API are live.
    return { queued: ins.length > 0 };
  } catch (e) {
    return { queued: false, reason: e instanceof Error ? e.message : "error" };
  }
}

export const getClaims = (limit = 200) =>
  query<ClaimRow>(`
    select cl.id, cl.voucher_id, cl.customer_id, c.name as customer_name, cl.kennitala,
           cl.amount, cl.due_date::text as due_date, cl.status, cl.arion_ref, cl.last_error, cl.created_at::text as created_at,
           v.series_code, v.voucher_number
    from acc.claims cl
    left join shop.customers c on c.id = cl.customer_id
    left join acc.vouchers v on v.id = cl.voucher_id
    order by cl.created_at desc limit $1`, [limit]);
