import Link from "next/link";
import { listPayrollRuns } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

const MONTHS = ["", "jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

export default async function SkilagreinPage() {
  const runs = (await listPayrollRuns()).filter((r) => r.status === "posted");
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Skilagrein staðgreiðslu</h1>
      <p className="text-sm text-gray-500 mb-6">Mánaðarleg skil til Skattsins: staðgreiðsla launþega + tryggingagjald. Skráðu þessar tölur í þjónustugátt RSK.</p>

      {runs.length === 0 ? (
        <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-10 text-center">Engar bókaðar launakeyrslur.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Tímabil</th>
                <th className="px-4 py-2 font-semibold text-right">Staðgreiðsla</th>
                <th className="px-4 py-2 font-semibold text-right">Tryggingagjald</th>
                <th className="px-4 py-2 font-semibold text-right">Samtals til skila</th>
                <th className="px-4 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{MONTHS[r.month]} {r.year}</td>
                  <td className="px-4 py-2 text-right">{kr(r.total_tax)}</td>
                  <td className="px-4 py-2 text-right">{kr(r.total_tryggingagjald)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{kr(Number(r.total_tax) + Number(r.total_tryggingagjald))}</td>
                  <td className="px-4 py-2 text-right"><Link href={`/bokhald/laun/keyrsla/${r.id}`} className="text-red-600 hover:text-red-700 text-xs">Keyrsla →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
