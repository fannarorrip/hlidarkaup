"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import ProductPicker from "@/app/bokhald/ProductPicker";

// Vöruval samanburðarins: bæta vöru við gegnum leitina (sama leit og í móttöku), fjarlægja
// með ✕ — vörulistinn býr í slóðinni svo samanburðinn má bókamerkja og deila.
export default function VoruVal({ selected, days }: { selected: { product_number: string; name: string }[]; days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  useSearchParams(); // heldur client-hlutanum í takti við slóðina

  const go = (pns: string[], d = days) => router.push(`${pathname}?vorur=${pns.map(encodeURIComponent).join(",")}&dagar=${d}`);
  const add = (pn: string | null) => { if (pn && !selected.some((s) => s.product_number === pn)) go([...selected.map((s) => s.product_number), pn]); };
  const remove = (pn: string) => go(selected.filter((s) => s.product_number !== pn).map((s) => s.product_number));

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((s) => (
          <span key={s.product_number} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E4F1F0] text-sm">
            {s.name}
            <button onClick={() => remove(s.product_number)} className="text-gray-400 hover:text-red-600" aria-label="Fjarlægja">×</button>
          </span>
        ))}
        <div className="w-64"><ProductPicker value={null} onChange={(pn) => add(pn)} /></div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Tímabil:</span>
        {[7, 30, 90].map((dg) => (
          <button key={dg} onClick={() => go(selected.map((s) => s.product_number), dg)}
            className={`px-3 py-1 rounded-lg border ${days === dg ? "bg-[#21323A] text-white border-[#21323A]" : "border-gray-300 hover:bg-gray-50"}`}>{dg} dagar</button>
        ))}
      </div>
    </div>
  );
}
