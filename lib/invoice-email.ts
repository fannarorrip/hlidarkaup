// Email a sölureikningur as a PDF attachment (for account customers NOT on rafræn viðskipti).
// Uses Resend (same as the kassi e-receipt). Gated on RESEND_API_KEY — a no-op if unset.
import { getSaleReceipt } from "@/lib/accounting-queries";
import { renderInvoicePdf } from "@/lib/pdf/invoice";

export async function emailInvoicePdf(voucherId: string, toEmail: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY vantar" };
  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return { ok: false, error: "Ógilt netfang" };

  const data = await getSaleReceipt(voucherId);
  if (!data) return { ok: false, error: "Reikningur fannst ekki" };
  const pdf = await renderInvoicePdf(data);
  const number = `${data.voucher.series_code}-${String(data.voucher.voucher_number).padStart(6, "0")}`;
  const from = process.env.RECEIPT_FROM ?? "Hlíðarkaup <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [toEmail],
      subject: `Reikningur frá Hlíðarkaup nr. ${number}`,
      html: `<p>Sæl/l,</p><p>Meðfylgjandi er reikningur nr. <b>${number}</b> frá Hlíðarkaup.</p><p>Kær kveðja,<br/>Hlíðarkaup</p>`,
      attachments: [{ filename: `reikningur-${number}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    }),
  });
  if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
  return { ok: true };
}
