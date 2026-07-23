import Link from "next/link";
import { getClaims, claimsEnabled } from "@/lib/claims";
import { dags, kr, vNr } from "@/lib/format";
import CancelClaimButton from "./CancelClaimButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { queued: "Í biðröð", created: "Stofnuð", failed: "Mistókst", paid: "Greidd", cancelled: "Afturkölluð" };
const STATUS_CLS: Record<string, string> = {
  queued: "bg-amber-100 text-amber-800", created: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-700", paid: "bg-green-100 text-green-800", cancelled: "bg-gray-100 text-gray-500",
};

export default async function KrofurPage() {
  const claims = await getClaims(200);
  const enabled = claimsEnabled();
  const queued = claims.filter((c) => c.status === "queued");
  const totalQueued = queued.reduce((a, c) => a + Number(c.amount), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Kröfur</h1>
      <p className="text-sm text-gray-500 mb-4">Bankakröfur (greiðsluseðlar) sem stofnast af reikningssölu — ein krafa á reikning.</p>

      {!enabled && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Arion B2B kröfur eru ekki virkar enn.</b> Kröfur safnast hér í biðröð. Þegar búnaðarskilríki og Arion B2B (Claims) eru komin
          í gagnið (<span className="font-mono">ARION_CLAIMS_ENABLED=true</span>) má senda biðröðina í bankann.
          {queued.length > 0 && <> Í biðröð núna: <b>{queued.length}</b> kröfur, samtals <b>{kr(totalQueued)}</b>.</>}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Reikningur</th>
              <th className="px-4 py-2 font-medium">Viðskiptamaður</th>
              <th className="px-4 py-2 font-medium">Kennitala</th>
              <th className="px-4 py-2 font-medium text-right">Upphæð</th>
              <th className="px-4 py-2 font-medium">Gjalddagi</th>
              <th className="px-4 py-2 font-medium">Staða</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Engar kröfur enn</td></tr>
            ) : claims.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  {c.voucher_id
                    ? <Link href={`/bokhald/solukerfi/reikningar/${c.voucher_id}`} className="font-mono text-red-700 hover:underline">{vNr(c.series_code, c.voucher_number)}</Link>
                    : <span className="font-mono text-gray-600">{c.claim_number ? `M-${c.claim_number}` : "—"}</span>}
                </td>
                <td className="px-4 py-2">{c.customer_name ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-gray-600">{c.kennitala ?? "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{kr(c.amount)}</td>
                <td className="px-4 py-2 text-gray-600">{dags(c.due_date)}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLS[c.status] ?? "bg-gray-100"}`}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                <td className="px-4 py-2 text-right"><CancelClaimButton id={c.id} status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
