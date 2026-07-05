import Link from "next/link";
import { notFound } from "next/navigation";
import { getVoucher } from "@/lib/accounting-queries";
import { dags, kr, vType, STATUS_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VoucherDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getVoucher(id);
  if (!data) notFound();
  const { voucher: v, lines } = data;

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  const balanced = Math.round(totalDebit) === Math.round(totalCredit);
  const skjalanr = v.document_skjalanumer ? String(v.document_skjalanumer).padStart(6, "0") : null;

  return (
    <div>
      <Link href="/bokhald/fylgiskjol" className="text-sm text-gray-500 hover:underline">← Fylgiskjöl</Link>

      <div className="flex items-center gap-3 mt-2 mb-1">
        <h1 className="text-2xl font-bold font-mono">{v.series_code}-{v.voucher_number}</h1>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{STATUS_LABEL[v.status] ?? v.status}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">{vType(v.voucher_type)} · {dags(v.voucher_date)}</p>

      {v.has_document && (
        <a href={`/api/skraning/document/${id}`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
          📄 Sækja reikning{skjalanr ? ` #${skjalanr}` : ""}
        </a>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
        <Field label="Lýsing" value={v.description ?? "—"} />
        <Field label="Tilvísun" value={v.external_reference ?? "—"} />
        <Field label="Bókað af" value={v.posted_by ?? "—"} />
        <Field label="Bókað" value={v.posted_at ? v.posted_at.slice(0, 16).replace("T", " ") : "—"} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium w-12">#</th>
              <th className="px-4 py-2 font-medium">Skjalanúmer</th>
              <th className="px-4 py-2 font-medium">Lykill</th>
              <th className="px-4 py-2 font-medium">Heiti</th>
              <th className="px-4 py-2 font-medium">Lýsing</th>
              <th className="px-4 py-2 font-medium">VSK</th>
              <th className="px-4 py-2 font-medium text-right">Debet</th>
              <th className="px-4 py-2 font-medium text-right">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line_no} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-400">{l.line_no}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {skjalanr ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-xs text-green-700">{skjalanr}</span>
                      <a href={`/api/skraning/document/${id}`} target="_blank" rel="noopener" title="Sjá skjal" className="text-red-600 hover:text-red-700">📄</a>
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 font-mono text-gray-700">{l.account_number}</td>
                <td className="px-4 py-2">{l.account_name}</td>
                <td className="px-4 py-2 text-gray-600">{l.description ?? ""}</td>
                <td className="px-4 py-2 text-gray-500">{l.vat_code ?? ""}</td>
                <td className="px-4 py-2 text-right">{Number(l.debit) ? kr(l.debit) : ""}</td>
                <td className="px-4 py-2 text-right">{Number(l.credit) ? kr(l.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="px-4 py-2" colSpan={6}>
                {balanced
                  ? <span className="text-green-700">✓ Í jafnvægi</span>
                  : <span className="text-red-700">✗ Ekki í jafnvægi</span>}
              </td>
              <td className="px-4 py-2 text-right">{kr(totalDebit)}</td>
              <td className="px-4 py-2 text-right">{kr(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-gray-800 truncate">{value}</p>
    </div>
  );
}
