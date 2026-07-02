import { getLaunamidar } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LaunamidarPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const rows = await getLaunamidar(year);
  const total = (f: (r: typeof rows[number]) => string) => rows.reduce((a, r) => a + Number(f(r)), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Launamiðar {year}</h1>
      <p className="text-sm text-gray-500 mb-4">Ársyfirlit launa á hvern launþega (bókaðar keyrslur). Notað í launaframtal til RSK.</p>

      <form className="mb-5 flex items-end gap-2">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Ár</label>
          <input type="number" name="year" defaultValue={year} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28" /></div>
        <button className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Sýna</button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-10 text-center">Engar bókaðar launakeyrslur fyrir {year}.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2 font-semibold">Launþegi</th>
                <th className="px-4 py-2 font-semibold">Kennitala</th>
                <th className="px-4 py-2 font-semibold text-right">Brúttólaun</th>
                <th className="px-4 py-2 font-semibold text-right">Staðgreiðsla</th>
                <th className="px-4 py-2 font-semibold text-right">Lífeyrir (launþegi)</th>
                <th className="px-4 py-2 font-semibold text-right">Nettó</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{r.employee_name}</td>
                  <td className="px-4 py-2 text-gray-500">{r.kennitala}</td>
                  <td className="px-4 py-2 text-right">{kr(r.gross)}</td>
                  <td className="px-4 py-2 text-right">{kr(r.income_tax)}</td>
                  <td className="px-4 py-2 text-right">{kr(r.pension_employee)}</td>
                  <td className="px-4 py-2 text-right">{kr(r.net_pay)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 font-semibold bg-gray-50">
                <td className="px-4 py-2" colSpan={2}>Samtals</td>
                <td className="px-4 py-2 text-right">{kr(total((r) => r.gross))}</td>
                <td className="px-4 py-2 text-right">{kr(total((r) => r.income_tax))}</td>
                <td className="px-4 py-2 text-right">{kr(total((r) => r.pension_employee))}</td>
                <td className="px-4 py-2 text-right">{kr(total((r) => r.net_pay))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
