import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { extractInvoice, hasAnthropicKey } from "@/lib/invoice-extract";
import { invoiceAlreadyKnown } from "@/lib/invoice-dedup";

// HANDVIRK innsetning í pósthólfið: reikningur sem barst ALDREI (pappír myndaður, PDF af
// heimasvæði birgis, áframsendur á annað netfang...) fer hér inn og eltir svo NÁKVÆMLEGA
// sömu braut og tölvupóst-reikningar — AI-lestur, tvíbókunarvörn, samþykkt, fylgiskjal.
// Ein skrá = einn reikningur (mörgum skrám má hlaða upp í einu).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY vantar — get ekki lesið skjöl." }, { status: 501 });
  const form = await req.formData().catch(() => null);
  const files = form ? form.getAll("files").filter((f): f is File => f instanceof File) : [];
  if (!files.length) return NextResponse.json({ ok: false, error: "Engin skrá fylgdi." }, { status: 400 });

  let pending = 0, errors = 0, skipped = 0;
  const messages: string[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) { skipped++; messages.push(`${f.name}: of stór (>10 MB)`); continue; }
    const bytes = Buffer.from(await f.arrayBuffer());
    const meta = {
      message_id: `manual:${randomUUID()}`,
      received_at: new Date().toISOString(),
      from_address: null, from_name: "Handvirk innsetning", subject: f.name,
    };
    const att = { name: f.name, mime: f.type || "application/octet-stream", size: bytes.length, bytes };
    try {
      const data = await extractInvoice({
        instructions: `Handvirkt innsett skjal: "${f.name}". Þetta Á að vera reikningur frá birgi.`,
        files: [{ name: f.name, mime: att.mime, data: bytes.toString("base64") }],
      });
      if (!data.lines.length) throw new Error("Engar línur lesnar úr skjalinu");
      const dup = await invoiceAlreadyKnown(data.supplierKennitala, data.invoiceNumber);
      if (dup) { skipped++; messages.push(`${f.name}: ${dup === "booked" ? "þegar BÓKAÐUR reikningur" : "þegar í pósthólfinu"} — sleppt`); continue; }
      await db.query(
        `insert into acc.email_invoices
           (message_id, received_at, from_address, from_name, subject, status, extracted,
            attachment_name, attachment_mime, attachment_size, attachment_bytes, error, processed_at)
         values ($1,$2,$3,$4,$5,'pending',$6::jsonb,$7,$8,$9,$10,null, now())`,
        [meta.message_id, meta.received_at, meta.from_address, meta.from_name, meta.subject,
         JSON.stringify(data), att.name, att.mime, att.size, att.bytes]);
      pending++;
    } catch (e) {
      // Frumritið er samt geymt — röðin fær 'error' og „Laga"-leiðin í pósthólfinu tekur við.
      await db.query(
        `insert into acc.email_invoices
           (message_id, received_at, from_address, from_name, subject, status, extracted,
            attachment_name, attachment_mime, attachment_size, attachment_bytes, error, processed_at)
         values ($1,$2,$3,$4,$5,'error',null,$6,$7,$8,$9,$10, now())`,
        [meta.message_id, meta.received_at, meta.from_address, meta.from_name, meta.subject,
         att.name, att.mime, att.size, att.bytes, (e instanceof Error ? e.message : String(e)).slice(0, 500)]).catch(() => {});
      errors++;
      messages.push(`${f.name}: lestur mistókst — röðin er í pósthólfinu undir Villa (Laga →)`);
    }
  }
  return NextResponse.json({ ok: true, pending, errors, skipped, messages });
}
