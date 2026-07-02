import Link from "next/link";
import { listPayrollRuns, type PayrollRunRow } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

const MONTHS = ["", "jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

export default async function LaunPage() {
  const runs = await listPayrollRuns();
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Launakeyrslur</h1>
          <p className="text-sm text-gray-500">Reikna og bóka laun — staðgreiðsla, lífeyrir, tryggingagjald</p>
        </div>
        <Link href="/bokhald/laun/keyrsla/ny" className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">+ Ný launakeyrsla</Link>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-10 text-center">
          Engin launakeyrsla skráð. Byrjaðu á að <Link href="/bokhald/laun/launthegar" className="text-red-600">skrá launþega</Link>.
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Tímabil</th>
                <th className="px-4 py-2 font-semibold">Útborgað</th>
                <th className="px-4 py-2 font-semibold text-center">Launþegar</th>
                <th className="px-4 py-2 font-semibold text-right">Brúttó</th>
                <th className="px-4 py-2 font-semibold text-right">Nettó</th>
                <th className="px-4 py-2 font-semibold">Staða</th>
                <th className="px-4 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r: PayrollRunRow) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{MONTHS[r.month]} {r.year}</td>
                  <td className="px-4 py-2 text-gray-500">{r.pay_date}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{r.line_count}</td>
                  <td className="px-4 py-2 text-right">{kr(r.total_gross)}</td>
                  <td className="px-4 py-2 text-right">{kr(r.total_net)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.status === "posted" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                      {r.status === "posted" ? "Bókað" : "Drög"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/bokhald/laun/keyrsla/${r.id}`} className="text-red-600 hover:text-red-700 font-medium">Skoða →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
