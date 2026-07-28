import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Reikningar úr pósthólfinu (inExchange + tölvupóstur) sem eiga eftir að fara í móttöku:
// have a stored attachment, not yet linked to a goods receipt, and not already booked
// through the pósthólf approve flow. Gated by middleware (/api/innkaup → stjornandi/bokari).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface InboxRow {
  id: string; received_at: string; supplier: string; subject: string | null;
  attachment_name: string | null; is_xml: boolean; total: number | null; source: "inexchange" | "email";
  status: string;
}

export async function GET() {
  const rows = await query<InboxRow>(`
    select e.id, e.received_at::text as received_at,
           coalesce(nullif(e.from_name, ''), e.from_address, 'Óþekktur') as supplier,
           e.subject, e.attachment_name,
           (coalesce(e.attachment_mime,'') ilike '%xml%') as is_xml,
           nullif((e.extracted->>'totalGross'), '')::numeric as total,
           case when e.message_id like 'inexchange:%' then 'inexchange' else 'email' end as source,
           e.status
    from acc.email_invoices e
    where e.attachment_bytes is not null
      and e.receipt_id is null
      and e.status in ('pending', 'error')
    order by e.received_at desc
    limit 50`);
  return NextResponse.json({ rows });
}
