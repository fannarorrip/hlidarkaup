import Link from "next/link";
import { getEmailInvoices, type EmailInvoiceRow } from "@/lib/accounting-queries";
import { graphStatus } from "@/lib/graph";
import { hasAnthropicKey } from "@/lib/invoice-extract";
import { kr } from "@/lib/format";
import PostholfActions from "./PostholfActions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { pending: "Bíður", approved: "Bókað", rejected: "Hafnað", skipped: "Sleppt", error: "Villa" };
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800",
  rejected: "bg-gray-100 text-gray-600", skipped: "bg-gray-100 text-gray-500", error: "bg-red-100 text-red-700",
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const tz = "Atlantic/Reykjavik"; // Iceland time regardless of server TZ
  return d.toLocaleDateString("is-IS", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz }) + " " +
         d.toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

export default async function PostholfPage() {
  const [pending, recent] = await Promise.all([
    getEmailInvoices(["pending"], 100),
    getEmailInvoices(["approved", "rejected", "skipped", "error"], 25),
  ]);
  const gs = graphStatus();
  const aiReady = hasAnthropicKey();
  const missing = [
    !gs.have.tenantId && "MS_TENANT_ID", !gs.have.clientId && "MS_CLIENT_ID",
    !gs.have.clientSecret && "MS_CLIENT_SECRET", !gs.have.mailbox && "MS_MAILBOX",
  ].filter(Boolean);

  return (
    <div>
      <div className="flex items-start justify-between mb-1 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Pósthólf</h1>
          <p className="text-sm text-gray-500">Reikningar úr tölvupósti og inExchange — yfirfarðu og samþykktu til að bóka</p>
        </div>
        <PostholfActions />
      </div>

      {/* Connection status */}
      {!gs.ready ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Tölvupóstur ekki tengdur.</b> Stilltu Microsoft 365 tengingu til að sækja reikninga sjálfkrafa.
          {missing.length > 0 && <> Vantar: <span className="font-mono">{missing.join(", ")}</span>.</>}
          {" "}Sjá <span className="font-mono">deploy/EMAIL_ONBOARDING.md</span>.
        </div>
      ) : !aiReady ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tengt við <b>{gs.mailbox}</b>, en <span className="font-mono">ANTHROPIC_API_KEY</span> vantar — get ekki lesið skjöl.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          Tengt við <b>{gs.mailbox}</b>.
        </div>
      )}

      {/* Pending drafts */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Bíða samþykktar ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-8 text-center">Engin drög bíða.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Móttekið</th>
                <th className="px-4 py-2 font-semibold">Sendandi</th>
                <th className="px-4 py-2 font-semibold">Birgir / reikningur</th>
                <th className="px-4 py-2 font-semibold text-center">Línur</th>
                <th className="px-4 py-2 font-semibold text-right">Upphæð</th>
                <th className="px-4 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r: EmailInvoiceRow) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{fmtDate(r.received_at)}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.from_name || r.from_address || "—"}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[18rem]">{r.subject}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.supplier || "—"}</div>
                    {r.invoice_number && <div className="text-xs text-gray-400">nr. {r.invoice_number}</div>}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-600">{r.line_count}</td>
                  <td className="px-4 py-2 text-right font-medium whitespace-nowrap">
                    {r.is_credit && <span className="mr-2 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">KREDIT</span>}
                    <span className={r.is_credit ? "text-purple-700" : ""}>{kr(r.total)}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/bokhald/skraning/postholf/${r.id}`} className="text-red-600 hover:text-red-700 font-medium">Skoða →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recently handled */}
      {recent.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-sm font-semibold text-gray-700">Nýlega afgreitt</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <tbody>
                {recent.map((r: EmailInvoiceRow) => (
                  <tr key={r.id} className="border-t border-gray-100 first:border-t-0">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500 w-40">{fmtDate(r.received_at)}</td>
                    <td className="px-4 py-2">{r.supplier || r.from_name || r.from_address || r.subject || "—"}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{r.status === "skipped" || r.status === "error" ? (r.error || "") : kr(r.total)}</td>
                    <td className="px-4 py-2 w-28 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[r.status] || "bg-gray-100"}`}>{STATUS_LABEL[r.status] || r.status}</span>
                    </td>
                    <td className="px-4 py-2 w-24 text-right">
                      {r.voucher_id
                        ? <Link href={`/bokhald/fylgiskjol/${r.voucher_id}`} className="text-gray-500 hover:text-red-700 text-xs">Fylgiskjal →</Link>
                        : (r.status === "error" && r.has_attachment)
                          ? <Link href={`/bokhald/skraning/postholf/${r.id}`} className="text-red-600 hover:text-red-700 text-xs">Laga →</Link>
                          : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
