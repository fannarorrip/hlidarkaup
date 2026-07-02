"use client";
import { useRouter, usePathname } from "next/navigation";
import { vatPeriods } from "@/lib/vat-periods";

const sel = "border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-red-400";

export default function VskPeriodPicker({ year, period }: { year: number; period: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const periods = vatPeriods(year);
  const years = [year + 1, year, year - 1, year - 2, year - 3];
  const go = (y: number, p: number) => router.push(`${pathname}?year=${y}&period=${p}`);

  return (
    <div className="flex items-center gap-2">
      <select value={year} onChange={(e) => go(Number(e.target.value), period)} className={sel}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select value={period} onChange={(e) => go(year, Number(e.target.value))} className={sel}>
        {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
    </div>
  );
}
