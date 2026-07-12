"use client";
import { useRouter, usePathname } from "next/navigation";
import type { IncomeStatement, ISRow } from "@/lib/income-statement";

const kr = (n: number) => Math.round(Number(n)).toLocaleString("is-IS") + " kr.";
const fmtD = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };

export default function ReksturView({ is, from, to }: { is: IncomeStatement; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const setRange = (f: string, t: string) => router.push(`${pathname}?from=${f}&to=${t}`);

  const Section = ({ title, items, total, signed }: { title: string; items: ISRow[]; total: number; signed?: boolean }) => (
    <>
      <tr className="bg-gray-50"><td colSpan={2} className="px-4 py-2 font-semibold">{title}</td></tr>
      {items.length === 0
        ? <tr><td colSpan={2} className="px-4 py-2 text-gray-400">—</td></tr>
        : items.map((r) => (
          <tr key={r.account_number} className="border-t border-gray-100">
            <td className="px-4 py-1.5"><span className="font-mono text-gray-400 mr-2">{r.account_number}</span>{r.name}</td>
            <td className={`px-4 py-1.5 text-right ${signed && r.amount < 0 ? "text-red-700" : ""}`}>{kr(r.amount)}</td>
          </tr>
        ))}
      <tr className="border-t border-gray-200 font-medium">
        <td className="px-4 py-1.5 text-gray-500">Samtals {title.toLowerCase()}</td>
        <td className="px-4 py-1.5 text-right">{kr(total)}</td>
      </tr>
    </>
  );
  const Subtotal = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <tr className={`border-t-2 border-gray-300 ${strong ? "text-base font-bold" : "font-semibold"}`}>
      <td className="px-4 py-2">{label}</td>
      <td className={`px-4 py-2 text-right ${value >= 0 ? "" : "text-red-700"}`}>{kr(value)}</td>
    </tr>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Rekstrarreikningur</h1>
          <p className="text-sm text-gray-500">Tekjur og gjöld tímabilsins · {fmtD(from)} – {fmtD(to)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <input type="date" value={from} onChange={(e) => setRange(e.target.value, to)} className="outline-none bg-transparent" />
            <span className="text-gray-400">→</span>
            <input type="date" value={to} onChange={(e) => setRange(from, e.target.value)} className="outline-none bg-transparent" />
          </div>
          <a href={`/api/rekstur/pdf?from=${from}&to=${to}`} target="_blank" rel="noopener"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">📄 PDF</a>
          <a href={`/api/rekstur/xlsx?from=${from}&to=${to}`}
            className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800">📊 Excel</a>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-2xl">
        <table className="w-full text-sm">
          <tbody>
            <Section title="Rekstrartekjur" items={is.revenue} total={is.revTotal} />
            <tr><td colSpan={2} className="py-1" /></tr>
            <Section title="Rekstrargjöld" items={is.expense} total={is.expTotal} />
            <Subtotal label="Rekstrarniðurstaða" value={is.operatingResult} />

            {is.financial.length > 0 && (
              <>
                <tr><td colSpan={2} className="py-1" /></tr>
                <Section title="Fjármunatekjur og (fjármagnsgjöld)" items={is.financial} total={is.finNet} signed />
                <Subtotal label="Hagnaður fyrir skatt" value={is.profitBeforeTax} />
              </>
            )}

            {is.tax.length > 0 && <Section title="Tekjuskattur og opinber gjöld" items={is.tax} total={is.taxTotal} />}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-400 text-lg font-bold">
              <td className="px-4 py-3">{is.result >= 0 ? "Hagnaður" : "Tap"}</td>
              <td className={`px-4 py-3 text-right ${is.result >= 0 ? "text-green-700" : "text-red-700"}`}>{kr(is.result)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
