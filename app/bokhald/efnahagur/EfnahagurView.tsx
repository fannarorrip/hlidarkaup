"use client";
import { useRouter, usePathname } from "next/navigation";
import type { BalanceSheet, BSRow } from "@/lib/balance-sheet";

const kr = (n: number) => Math.round(Number(n)).toLocaleString("is-IS") + " kr.";
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };

export default function EfnahagurView({ bs, asOf }: { bs: BalanceSheet; asOf: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const Lines = ({ items }: { items: BSRow[] }) =>
    items.length === 0 ? <tr><td colSpan={2} className="px-4 py-1.5 text-gray-400">—</td></tr> : (
      <>{items.map((r) => (
        <tr key={r.account_number} className="border-t border-gray-100">
          <td className="px-4 py-1.5"><span className="font-mono text-gray-400 mr-2">{r.account_number}</span>{r.name}</td>
          <td className="px-4 py-1.5 text-right">{kr(r.val)}</td>
        </tr>
      ))}</>
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Efnahagsreikningur</h1>
          <p className="text-sm text-gray-500">Eignir = Skuldir + Eigið fé · staða þann {fmtD(asOf)}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <span className="text-gray-400">Staða þann</span>
            <input type="date" value={asOf} onChange={(e) => router.push(`${pathname}?asOf=${e.target.value}`)} className="outline-none bg-transparent" />
          </div>
          <a href={`/api/efnahagur/pdf?asOf=${asOf}`} target="_blank" rel="noopener"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">📄 PDF</a>
          <a href={`/api/efnahagur/xlsx?asOf=${asOf}`}
            className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800">📊 Excel</a>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50"><th colSpan={2} className="px-4 py-2 text-left font-semibold">Eignir</th></tr></thead>
            <tbody><Lines items={bs.assets} /></tbody>
            <tfoot><tr className="border-t-2 border-gray-300 font-bold"><td className="px-4 py-2">Eignir samtals</td><td className="px-4 py-2 text-right">{kr(bs.assetTotal)}</td></tr></tfoot>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50"><th colSpan={2} className="px-4 py-2 text-left font-semibold">Skuldir og eigið fé</th></tr></thead>
            <tbody>
              <tr><td colSpan={2} className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-400">Skuldir</td></tr>
              <Lines items={bs.liab} />
              <tr><td colSpan={2} className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-gray-400">Eigið fé</td></tr>
              <Lines items={bs.equity} />
              <tr className="border-t border-gray-100">
                <td className="px-4 py-1.5">Afkoma tímabilsins</td>
                <td className="px-4 py-1.5 text-right">{kr(bs.result)}</td>
              </tr>
            </tbody>
            <tfoot><tr className="border-t-2 border-gray-300 font-bold"><td className="px-4 py-2">Skuldir og eigið fé samtals</td><td className="px-4 py-2 text-right">{kr(bs.rightTotal)}</td></tr></tfoot>
          </table>
        </div>
      </div>

      <p className={`mt-4 text-sm font-medium ${bs.balanced ? "text-green-700" : "text-red-700"}`}>
        {bs.balanced ? "✓ Efnahagur stemmir" : "✗ Efnahagur stemmir ekki"}
      </p>
    </div>
  );
}
