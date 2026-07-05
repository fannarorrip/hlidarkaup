import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaleReceipt } from "@/lib/accounting-queries";
import { dags, kr, vType, vatLetter, vNr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSaleReceipt(id);
  if (!data) notFound();
  const { voucher: v, lines } = data;

  const total = lines.reduce((s, l) => s + Number(l.line_total), 0);
  const vat = Math.round(lines.reduce((s, l) => { const r = Number(l.vat_rate); return s + (Number(l.line_total) * r) / (100 + r); }, 0));
  const paymentLabel = v.voucher_type === "account_sale" ? "Á reikning"
    : v.voucher_type === "web_sale" ? "Greitt með korti (vefverslun)" : "Greitt með korti";

  return (
    <div>
      <Link href="/bokhald/solukerfi/reikningar" className="text-sm text-gray-500 hover:underline">← Reikningar</Link>

      <div className="max-w-md mx-auto mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 text-center">
          <p className="font-bold">Hlíðarkaup</p>
          <p className="text-xs text-gray-400">Akurhlíð 1 · Sauðárkrókur</p>
        </div>
        <div className="px-6 py-5">
          <div className="flex justify-between text-sm text-gray-500 mb-1">
            <span>{vType(v.voucher_type)}</span>
            <span className="font-mono">{vNr(v.series_code, v.voucher_number)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500 mb-3">
            <span>{dags(v.voucher_date)}</span>
            {v.customer_name && <span>{v.customer_name}{v.customer_kennitala ? ` · ${v.customer_kennitala}` : ""}</span>}
          </div>

          <div className="border-t border-dashed border-gray-200 my-3" />
          {lines.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Engar vörulínur skráðar fyrir þessa sölu</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line_no}>
                    <td className="py-1">
                      {Number(l.quantity) > 1 && <span className="text-gray-400">{Math.round(Number(l.quantity))}× </span>}
                      {l.name}
                      <span className="text-gray-400 ml-1 font-mono text-xs" title={`VSK-flokkur ${vatLetter(l.vat_rate)}`}>{vatLetter(l.vat_rate)}</span>
                    </td>
                    <td className="py-1 text-right whitespace-nowrap">{kr(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="border-t border-dashed border-gray-200 my-3" />

          <div className="flex justify-between text-sm text-gray-500"><span>VSK innifalinn</span><span>{kr(vat)}</span></div>
          <div className="flex justify-between font-bold text-lg mt-1"><span>Samtals</span><span>{kr(total)}</span></div>
          <p className="text-center text-[11px] text-gray-400 mt-3">A = 24% VSK · B = 11% VSK · C = 0% VSK</p>
          <p className="text-center text-xs text-gray-400 mt-2">{paymentLabel}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-4">
        <a href={`/api/reikningur/${v.id}/pdf`} target="_blank" rel="noopener"
           className="text-sm px-3 py-1.5 rounded-lg bg-red-700 text-white hover:bg-red-800">Sækja PDF</a>
        <Link href={`/bokhald/fylgiskjol/${v.id}`} className="text-sm text-red-700 hover:underline">Sjá bókhaldsfærslu →</Link>
      </div>
    </div>
  );
}
