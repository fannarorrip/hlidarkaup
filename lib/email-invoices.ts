// Inbox poller: pull invoice attachments from the Microsoft 365 mailbox, read
// them with the shared AI engine, and store balanced drafts in acc.email_invoices
// for human approval. Dedupe is by Graph message_id; a watermark bounds the query.
import { db } from "@/lib/db";
import { listInboxMessages, getMessageAttachments, graphStatus, type GraphAttachment } from "@/lib/graph";
import { extractInvoice, hasAnthropicKey } from "@/lib/invoice-extract";
import { invoiceAlreadyKnown } from "@/lib/invoice-dedup";

const MAX_PER_RUN = 30;                 // bound cost/time; the rest roll to the next run
const MAX_BYTES = 10 * 1024 * 1024;     // 10 MB per attachment

const isCandidate = (a: GraphAttachment) =>
  a.size <= MAX_BYTES &&
  (/pdf|image\/(jpeg|jpg|png|webp)|sheet|excel|csv/i.test(a.contentType || "") ||
   /\.(pdf|jpe?g|png|webp|xlsx?|csv)$/i.test(a.name || ""));

export interface PollSummary {
  ok: boolean;
  configured: boolean;
  checked: number;     // new messages examined
  pending: number;     // invoice drafts created
  skipped: number;     // not an invoice / no usable attachment
  errors: number;      // extraction failed (still stored for manual handling)
  message?: string;
}

interface InsertRow {
  message_id: string; received_at: string; from_address: string | null; from_name: string | null;
  subject: string | null; status: string; extracted: unknown; error: string | null;
  attachment?: { name: string; mime: string; size: number; bytes: Buffer } | null;
}

async function insertRow(r: InsertRow) {
  const a = r.attachment ?? null;
  await db.query(
    `insert into acc.email_invoices
       (message_id, received_at, from_address, from_name, subject, status, extracted,
        attachment_name, attachment_mime, attachment_size, attachment_bytes, error, processed_at)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12, now())
     on conflict (message_id) do nothing`,
    [r.message_id, r.received_at, r.from_address, r.from_name, r.subject, r.status,
     r.extracted == null ? null : JSON.stringify(r.extracted),
     a?.name ?? null, a?.mime ?? null, a?.size ?? null, a?.bytes ?? null, r.error]);
}

export async function runEmailPoll(): Promise<PollSummary> {
  const empty: PollSummary = { ok: false, configured: false, checked: 0, pending: 0, skipped: 0, errors: 0 };
  if (!graphStatus().ready) return { ...empty, message: "Microsoft 365 tenging er ekki fullstillt." };
  if (!hasAnthropicKey()) return { ...empty, message: "ANTHROPIC_API_KEY vantar — get ekki lesið skjöl." };

  // Watermark: ask Graph for messages on/after (last_received − 1 day), or last 7 days on first run.
  const sync = (await db.query<{ last_received_at: Date | null }>(`select last_received_at from acc.email_sync where id = 1`)).rows[0];
  const base = sync?.last_received_at ? sync.last_received_at.getTime() - 24 * 3600_000 : Date.now() - 7 * 24 * 3600_000;
  const sinceISO = new Date(base).toISOString();

  const desc = await listInboxMessages(sinceISO);            // newest first
  const messages = desc.slice().reverse();                   // process oldest → newest so the watermark advances safely
  const ids = messages.map((m) => m.id);

  // Skip anything already recorded (dedupe across runs).
  const seen = ids.length
    ? new Set((await db.query<{ message_id: string }>(
        `select message_id from acc.email_invoices where message_id = any($1)`, [ids])).rows.map((r: { message_id: string }) => r.message_id))
    : new Set<string>();
  const fresh = messages.filter((m) => !seen.has(m.id)).slice(0, MAX_PER_RUN);

  const out: PollSummary = { ok: true, configured: true, checked: 0, pending: 0, skipped: 0, errors: 0 };
  let watermark = sync?.last_received_at ? sync.last_received_at.getTime() : 0;

  for (const m of fresh) {
    out.checked++;
    const meta = {
      message_id: m.id, received_at: m.receivedDateTime,
      from_address: m.from?.emailAddress?.address ?? null, from_name: m.from?.emailAddress?.name ?? null,
      subject: m.subject ?? null,
    };
    watermark = Math.max(watermark, new Date(m.receivedDateTime).getTime());

    try {
      const attachments = (await getMessageAttachments(m.id)).filter(isCandidate);
      if (!attachments.length) { await insertRow({ ...meta, status: "skipped", extracted: null, error: "Engin nothæf viðhengi" }); out.skipped++; continue; }

      // The STORED attachment becomes the permanent frumrit (7 ára fylgiskjal) — pick the
      // most invoice-like one, not just whatever came first in the MIME order: PDF fyrst,
      // svo töflur, myndir síðast (undirskriftarmyndir smeygja sér fram fyrir PDF annars);
      // innan flokks vinnur stærsta skjalið.
      const docRank = (a: GraphAttachment) =>
        /pdf/i.test(a.contentType || "") || /\.pdf$/i.test(a.name || "") ? 0 :
        /sheet|excel|csv/i.test(a.contentType || "") || /\.(xlsx?|csv)$/i.test(a.name || "") ? 1 : 2;
      const first = attachments.slice().sort((a, b) => docRank(a) - docRank(b) || b.size - a.size)[0];
      const att = { name: first.name, mime: first.contentType || "application/octet-stream", size: first.size, bytes: Buffer.from(first.contentBytes, "base64") };
      const data = await extractInvoice({
        classify: true,
        instructions: `Tölvupóstur — efni: "${m.subject ?? ""}", frá: ${meta.from_name ?? meta.from_address ?? "óþekkt"}.`,
        files: attachments.map((a) => ({ name: a.name, mime: a.contentType, data: a.contentBytes })),
      });

      if (data.isInvoice === false) { await insertRow({ ...meta, status: "skipped", extracted: data, error: "Ekki reikningur" }); out.skipped++; continue; }
      if (!data.lines.length) { await insertRow({ ...meta, status: "error", extracted: data, error: "Engar línur lesnar", attachment: att }); out.errors++; continue; }

      // Duplicate hard block: don't queue an invoice already booked or already in the pósthólf.
      const dup = await invoiceAlreadyKnown(data.supplierKennitala, data.invoiceNumber);
      if (dup) { await insertRow({ ...meta, status: "skipped", extracted: data, error: dup === "booked" ? "Þegar bókaður reikningur (tvíbókun varin)" : "Reikningur þegar í pósthólfi" }); out.skipped++; continue; }

      await insertRow({ ...meta, status: "pending", extracted: data, error: null, attachment: att });
      out.pending++;
    } catch (e) {
      await insertRow({ ...meta, status: "error", extracted: null, error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      out.errors++;
    }
  }

  await db.query(
    `update acc.email_sync set last_checked_at = now(),
        last_received_at = greatest(coalesce(last_received_at, to_timestamp(0)), $1) where id = 1`,
    [watermark ? new Date(watermark).toISOString() : sinceISO]);

  return out;
}
