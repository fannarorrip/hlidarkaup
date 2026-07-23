import { query } from "@/lib/db";
import { kr } from "@/lib/format";
import ReviewRow from "./ReviewRow";

// Þolmarkafærslur: sjálfvirkt bókaður mismunur (0–500 kr) milli greiðslu og
// reiknings/kröfu — á 6200 Vaxtagjöld — flaggaður hér til mánaðaryfirferðar.
export const dynamic = "force-dynamic";

interface Row {
  id: string; amount: number; note: string | null; source: string; reviewed: boolean;
  created_at: string; supplier_name: string | null;
  series_code: string | null; voucher_number: string | null; voucher_id: string | null;
}

export default async function TholmorkPage() {
  const rows = await query<Row>(`
    select ra.id, ra.amount, ra.note, ra.source, ra.reviewed, ra.created_at::text as created_at,
           s.name as supplier_name, v.series_code, v.voucher_number::text as voucher_number, ra.voucher_id
    from acc.recon_adjustments ra
    left join acc.suppliers s on s.id = ra.supplier_id
    left join acc.vouchers v on v.id = ra.voucher_id
    order by ra.reviewed asc, ra.created_at desc limit 500`);
  const open = rows.filter((r) => !r.reviewed);
  const total = open.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Þolmarkafærslur</h1>
      <p className="text-sm text-gray-500 mb-4">
        Mismunur (0–500 kr.) milli greiðslu og reiknings — innheimtukostnaður birgja — bókaður
        sjálfkrafa á 6200 Vaxtagjöld. Renndu yfir listann í lok mánaðar og merktu yfirfarið.
      </p>
      {open.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Óyfirfarið: <b>{open.length}</b> færslur, samtals <b>{kr(total)}</b>
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Dags.</th>
              <th className="px-4 py-2 font-medium">Fylgiskjal</th>
              <th className="px-4 py-2 font-medium">Birgir</th>
              <th className="px-4 py-2 font-medium">Skýring</th>
              <th className="px-4 py-2 font-medium text-right">Mismunur</th>
              <th className="px-4 py-2 font-medium text-center">Yfirfarið</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Engar þolmarkafærslur enn</td></tr>
            ) : rows.map((r) => <ReviewRow key={r.id} row={r} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
