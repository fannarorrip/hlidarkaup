import Link from "next/link";
import Skeytamidlari from "./Skeytamidlari";

export const dynamic = "force-dynamic";

// Skeytamiðlarinn (inExchange): ALLIR reikningar sem liggja hjá miðlaranum, bornir saman við
// pósthólfið okkar — „vantar" sést strax og má sækja beint. Ekkert getur týnst þegjandi.
export default function SkeytamidlariPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Skeytamiðlari (inExchange)</h1>
          <p className="text-sm text-gray-500">Allt sem liggur hjá miðlaranum — borið saman við pósthólfið. Rautt = til hjá inExchange en vantar í kerfið.</p>
        </div>
        <Link href="/bokhald/skraning/postholf" className="text-sm text-red-600 hover:underline">← Pósthólf</Link>
      </div>
      <Skeytamidlari />
    </div>
  );
}
