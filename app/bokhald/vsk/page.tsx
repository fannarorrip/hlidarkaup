import { getVatVeltaByRate, getVatAccountsPeriod } from "@/lib/accounting-queries";
import { vatPeriods, currentVatPeriod } from "@/lib/vat-periods";
import { buildVatReport } from "@/lib/vat-report";
import { getVatSettlement } from "@/lib/vat-settlement";
import { kr } from "@/lib/format";
import VskPeriodPicker from "./VskPeriodPicker";
import VskActions from "./VskActions";

export const dynamic = "force-dynamic";

const fmtIs = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };

export default async function VskPage({ searchParams }: { searchParams: Promise<{ year?: string; period?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const period = Number(sp.period) || currentVatPeriod(year, now.getMonth() + 1);
  const periods = vatPeriods(year);
  const p = periods.find((x) => x.key === period) ?? periods[0];

  const [velta, accts, settlement] = await Promise.all([
    getVatVeltaByRate(p.from, p.to),
    getVatAccountsPeriod(p.from, p.to),
    getVatSettlement(year, period),
  ]);

  const { v24, v11, v0, veltaTotal, out, inn, output, input, net } = buildVatReport(velta, accts);
  const overdue = new Date(p.due) < now;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><span>%</span> Virðisaukaskattsskýrsla</h1>
        <div className="flex flex-wrap items-center gap-3">
          <VskPeriodPicker year={year} period={period} />
          <VskActions year={year} period={period} settled={settlement?.voucher_number ? { series_code: settlement.series_code, voucher_number: settlement.voucher_number } : null} />
        </div>
      </div>

      {/* Period info */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-sm flex flex-wrap gap-x-8 gap-y-1 items-center">
        <span className="flex items-center gap-2 text-gray-600">📅 Tímabil: <b className="text-gray-900">{p.label}</b></span>
        <span className="text-gray-600">Dagsetningar: <b className="text-gray-900">{fmtIs(p.from)} – {fmtIs(p.to)}</b></span>
        <span className="text-gray-600">Skiladagur: <b className={overdue ? "text-red-600" : "text-gray-900"}>{fmtIs(p.due)}</b>
          {overdue && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">Liðinn</span>}</span>
      </div>

      {/* Skattskyld velta */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold mb-4 flex items-center gap-2">% Skattskyld velta (án VSK)</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <Velta label="24% þrep" cls="bg-blue-50 text-blue-700" value={v24} />
          <Velta label="11% þrep" cls="bg-emerald-50 text-emerald-700" value={v11} />
          <Velta label="0% (Undanþegin)" cls="bg-gray-100 text-gray-600" value={v0} />
        </div>
        <p className="text-sm text-gray-600 mt-4 border-t border-gray-100 pt-3">Heildar skattskyld velta: <b className="text-gray-900">{kr(veltaTotal)}</b></p>
      </div>

      {/* Settlement cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">↑ Útskattur (Sala)</p>
          <p className="text-2xl font-bold text-blue-700">{kr(output)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">↓ Innskattur (Kaup)</p>
          <p className="text-2xl font-bold text-emerald-700">{kr(input)}</p>
        </div>
        <div className={`border rounded-xl p-5 ${net >= 0 ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"}`}>
          <p className="text-sm text-gray-500 mb-1">{net >= 0 ? "Skuld við ríkissjóð" : "Inneign"}</p>
          <p className={`text-2xl font-bold ${net >= 0 ? "text-red-700" : "text-green-700"}`}>{kr(Math.abs(net))}</p>
        </div>
      </div>

      {/* Sundurliðun */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Sundurlidun title="↑ Útskattur — Sundurliðun" empty="Enginn útskattur á tímabilinu"
          rows={out.map((a) => ({ account: a.account, name: a.name, amount: a.amount }))} />
        <Sundurlidun title="↓ Innskattur — Sundurliðun" empty="Enginn innskattur á tímabilinu"
          rows={inn.map((a) => ({ account: a.account, name: a.name, amount: a.amount }))} />
      </div>

      {settlement?.voucher_number ? (
        <p className="text-xs text-green-700">✓ Tímabilið hefur verið gert upp (fylgiskjal {settlement.series_code}-{settlement.voucher_number}). Uppgjörið færist á 9535 Uppgjörsreikningur VSK.</p>
      ) : (
        <p className="text-xs text-gray-400">Tölur miðast við bókaðar færslur á völdu tímabili. „Bóka VSK-uppgjör“ stofnar færslu: Debet útskattur / Kredit innskattur, mismunur á 9535.</p>
      )}
    </div>
  );
}

function Velta({ label, cls, value }: { label: string; cls: string; value: number }) {
  return (
    <div>
      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cls}`}>{label}</span>
      <p className="text-2xl font-bold mt-2">{kr(value)}</p>
    </div>
  );
}

function Sundurlidun({ title, rows, empty }: { title: string; rows: { account: string; name: string; amount: number }[]; empty: string }) {
  const nonzero = rows.filter((r) => r.amount !== 0);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="font-semibold mb-3">{title}</p>
      {nonzero.length === 0 ? <p className="text-sm text-gray-400">{empty}</p> : (
        <table className="w-full text-sm">
          <tbody>
            {nonzero.map((r) => (
              <tr key={r.account} className="border-t border-gray-100 first:border-t-0">
                <td className="py-1.5"><span className="font-mono text-gray-500 mr-2">{r.account}</span>{r.name}</td>
                <td className="py-1.5 text-right font-medium">{kr(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
