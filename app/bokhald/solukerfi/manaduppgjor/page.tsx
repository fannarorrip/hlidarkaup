import { getBillingInvoices } from "@/lib/month-end";
import { kr, MANUDIR } from "@/lib/format";
import MonthEndRunner from "./MonthEndRunner";

export const dynamic = "force-dynamic";

// "2026-06" → "júní 2026"; malformed values fall back to the raw string.
const periodLabel = (p: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(p || "");
  return m && MANUDIR[+m[2] - 1] ? `${MANUDIR[+m[2] - 1]} ${m[1]}` : p;
};

const DLV: Record<string, string> = { einvoice: "Rafrænt", pdf: "PDF í pósti", none: "—" };
const STATUS: Record<string, string> = { queued: "Í biðröð", sent: "Sent", failed: "Mistókst", created: "Stofnuð", paid: "Greidd" };

export default async function ManadUppgjorPage() {
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const invoices = await getBillingInvoices(100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Mánaðaruppgjör</h1>
      <p className="text-sm text-gray-500 mb-6">Reikningsfærir í lok mánaðar þá viðskiptamenn sem eru á „Safna saman" — einn samansafnaður reikningur (sundurliðaður eftir úttektum) + ein krafa á hvern.</p>

      <MonthEndRunner defaultPeriod={defaultPeriod} />

      <h2 className="mt-8 mb-2 text-sm font-semibold text-gray-700">Gerðir mánaðarreikningar</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Viðskiptamaður</th>
              <th className="px-4 py-2 font-medium">Tímabil</th>
              <th className="px-4 py-2 font-medium text-center">Úttektir</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
              <th className="px-4 py-2 font-medium">Afhending</th>
              <th className="px-4 py-2 font-medium">Krafa</th>
              <th className="px-4 py-2 font-medium text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Engir mánaðarreikningar enn</td></tr>
            ) : invoices.map((b) => (
              <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">{b.invoice_number}</td>
                <td className="px-4 py-2">{b.customer_name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-600">{periodLabel(b.period)}</td>
                <td className="px-4 py-2 text-center text-gray-600">{b.trip_count}</td>
                <td className="px-4 py-2 text-right font-medium">{kr(b.total)}</td>
                <td className="px-4 py-2 text-gray-500">{DLV[b.delivery ?? "none"] ?? b.delivery} <span className="text-xs text-gray-400">({STATUS[b.delivery_status] ?? b.delivery_status})</span></td>
                <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">{STATUS[b.claim_status] ?? b.claim_status}</span></td>
                <td className="px-4 py-2 text-right"><a href={`/api/manadarreikningur/${b.id}/pdf`} target="_blank" rel="noopener" className="text-red-700 hover:underline">PDF</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
