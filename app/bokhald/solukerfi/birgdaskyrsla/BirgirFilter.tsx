"use client";
import { useRouter, usePathname } from "next/navigation";

// Birgja-sía birgðaskýrslunnar: velur aðalbirgi → síðan + Excel-útflutningurinn sía á hann.
export default function BirgirFilter({ suppliers, value }: { suppliers: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select value={value} onChange={(e) => router.push(e.target.value ? `${pathname}?birgir=${e.target.value}` : pathname)}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 max-w-[16rem]">
      <option value="">Allir birgjar</option>
      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
