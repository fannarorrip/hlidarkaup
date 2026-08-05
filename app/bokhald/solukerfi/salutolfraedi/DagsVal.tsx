"use client";
import { useRouter, usePathname } from "next/navigation";

// Dagsetningarval sölutölfræðinnar — skiptir um dag án þess að missa síðuna.
export default function DagsVal({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (d: string) => d && router.push(`${pathname}?dags=${d}`);
  const shift = (days: number) => {
    const d = new Date(value + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    go(d.toISOString().slice(0, 10));
  };
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => shift(-1)} className="w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50">‹</button>
      <input type="date" value={value} onChange={(e) => go(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-red-400" />
      <button onClick={() => shift(1)} className="w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50">›</button>
    </div>
  );
}
