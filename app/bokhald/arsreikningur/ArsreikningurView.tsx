"use client";
import { useRouter, usePathname } from "next/navigation";
import type { AnnualReport, CmpRow, Pair } from "@/lib/annual-report";

const kr = (n: number) => Math.round(Number(n)).toLocaleString("is-IS");

export default function ArsreikningurView({ report }: { report: AnnualReport }) {
  const router = useRouter();
  const pathname = usePathname();
  const { year, income: is, balance: bs } = report;
  const prev = year - 1;

  const Head = () => (
    <thead>
      <tr className="text-gray-400 text-xs">
        <th className="px-4 py-2 text-left font-medium"></th>
        <th className="px-4 py-2 text-right font-medium">{year}</th>
        <th className="px-4 py-2 text-right font-medium">{prev}</th>
      </tr>
    </thead>
  );
  const Lines = ({ rows, signed }: { rows: CmpRow[]; signed?: boolean }) =>
    rows.length === 0 ? <tr><td colSpan={3} className="px-4 py-1.5 text-gray-400">—</td></tr> : (
      <>{rows.map((r) => (
        <tr key={r.account_number} className="border-t border-gray-100">
          <td className="px-4 py-1.5"><span className="font-mono text-gray-400 mr-2">{r.account_number}</span>{r.name}</td>
          <td className={`px-4 py-1.5 text-right tabular-nums ${signed && r.amount < 0 ? "text-red-700" : ""}`}>{kr(r.amount)}</td>
          <td className={`px-4 py-1.5 text-right tabular-nums text-gray-400 ${signed && r.prev < 0 ? "text-red-400" : ""}`}>{kr(r.prev)}</td>
        </tr>
      ))}</>
    );
  const SectionHead = ({ title }: { title: string }) => (
    <tr className="bg-gray-50"><td colSpan={3} className="px-4 py-2 font-semibold">{title}</td></tr>
  );
  const Total = ({ label, p, strong }: { label: string; p: Pair; strong?: boolean }) => (
    <tr className={`border-t border-gray-200 ${strong ? "border-t-2 border-gray-300 text-base font-bold" : "font-medium"}`}>
      <td className="px-4 py-1.5 text-gray-600">{label}</td>
      <td className={`px-4 py-1.5 text-right tabular-nums ${p.cur < 0 ? "text-red-700" : ""}`}>{kr(p.cur)}</td>
      <td className={`px-4 py-1.5 text-right tabular-nums text-gray-400 ${p.prev < 0 ? "text-red-400" : ""}`}>{kr(p.prev)}</td>
    </tr>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ársreikningur {year}</h1>
          <p className="text-sm text-gray-500">Rekstrarreikningur og efnahagsreikningur · samanburður við {prev}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <span className="text-gray-400">Ár</span>
            <input type="number" value={year} onChange={(e) => router.push(`${pathname}?year=${e.target.value}`)} className="w-20 outline-none bg-transparent tabular-nums" />
          </div>
          <a href={`/api/arsreikningur/pdf?year=${year}`} target="_blank" rel="noopener"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">📄 PDF</a>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        {/* Rekstrarreikningur */}
        <div>
          <h2 className="text-lg font-bold mb-2">Rekstrarreikningur</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <Head />
              <tbody>
                <SectionHead title="Rekstrartekjur" />
                <Lines rows={is.revenue} />
                <Total label="Samtals tekjur" p={is.revTotal} />
                <tr><td colSpan={3} className="py-1" /></tr>
                <SectionHead title="Rekstrargjöld" />
                <Lines rows={is.expense} />
                <Total label="Samtals gjöld" p={is.expTotal} />
                <Total label="Rekstrarniðurstaða" p={is.operatingResult} />
                {is.financial.length > 0 && (
                  <>
                    <tr><td colSpan={3} className="py-1" /></tr>
                    <SectionHead title="Fjármunatekjur og (fjármagnsgjöld)" />
                    <Lines rows={is.financial} signed />
                    <Total label="Fjármagnsliðir, nettó" p={is.finNet} />
                  </>
                )}
                {is.tax.length > 0 && (
                  <>
                    <SectionHead title="Tekjuskattur og opinber gjöld" />
                    <Lines rows={is.tax} />
                    <Total label="Samtals skattur" p={is.taxTotal} />
                  </>
                )}
              </tbody>
              <tfoot>
                <Total label={is.result.cur >= 0 ? "Hagnaður ársins" : "Tap ársins"} p={is.result} strong />
              </tfoot>
            </table>
          </div>
        </div>

        {/* Efnahagsreikningur */}
        <div>
          <h2 className="text-lg font-bold mb-2">Efnahagsreikningur <span className="text-sm font-normal text-gray-400">31.12.{year}</span></h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <Head />
              <tbody>
                <SectionHead title="Eignir" />
                <Lines rows={bs.assets} />
                <Total label="Eignir samtals" p={bs.assetTotal} strong />
                <tr><td colSpan={3} className="py-1" /></tr>
                <SectionHead title="Skuldir" />
                <Lines rows={bs.liab} />
                <Total label="Skuldir samtals" p={bs.liabTotal} />
                <SectionHead title="Eigið fé" />
                <Lines rows={bs.equity} />
                <Total label="Afkoma tímabilsins" p={bs.result} />
              </tbody>
              <tfoot>
                <Total label="Skuldir og eigið fé samtals" p={bs.rightTotal} strong />
              </tfoot>
            </table>
          </div>
          <p className={`mt-2 text-sm font-medium ${bs.balanced ? "text-green-700" : "text-red-700"}`}>
            {bs.balanced ? "✓ Efnahagur stemmir" : "✗ Efnahagur stemmir ekki"}
          </p>
        </div>
      </div>
    </div>
  );
}
