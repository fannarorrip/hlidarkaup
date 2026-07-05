import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccountLedger } from "@/lib/accounting-queries";
import { dags, kr, vType, ACCOUNT_TYPE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountLedger({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  const data = await getAccountLedger(account);
  if (!data) notFound();
  const { account: acct, entries } = data;

  let run = 0;
  const rows = entries.map((e) => {
    run += Number(e.debit) - Number(e.credit);
    return { ...e, run };
  });

  return (
    <div>
      <Link href="/bokhald/adalbok" className="text-sm text-gray-500 hover:underline">← Aðalbók</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">
        <span className="font-mono">{acct.account_number}</span> {acct.name}
      </h1>
      <p className="text-sm text-gray-500 mb-6">{ACCOUNT_TYPE_LABEL[acct.account_type]} · {rows.length} hreyfingar</p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Fylgiskjal</th>
              <th className="px-4 py-2 font-medium">Lýsing</th>
              <th className="px-4 py-2 font-medium text-right">Debet</th>
              <th className="px-4 py-2 font-medium text-right">Kredit</th>
              <th className="px-4 py-2 font-medium text-right">Staða</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-600">{dags(e.voucher_date)}</td>
                <td className="px-4 py-2">
                  <Link href={`/bokhald/fylgiskjol/${e.voucher_id}`} className="font-mono text-red-700 hover:underline">
                    {e.series_code}-{e.voucher_number}
                  </Link>
                  <span className="text-gray-400 text-xs ml-2">{vType(e.voucher_type)}</span>
                </td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{e.description}</td>
                <td className="px-4 py-2 text-right">{Number(e.debit) ? kr(e.debit) : ""}</td>
                <td className="px-4 py-2 text-right">{Number(e.credit) ? kr(e.credit) : ""}</td>
                <td className="px-4 py-2 text-right font-medium">{kr(e.run)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
