import { getDailySettlement } from "@/lib/accounting-queries";
import { getZReport } from "@/lib/z-report";
import KassaSettlement from "./KassaSettlement";

export const dynamic = "force-dynamic";

export default async function KassauppgjorPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : new Date().toISOString().slice(0, 10);
  const z = await getZReport(date);
  const s = z ? z.snapshot : await getDailySettlement(date);   // locked days render the frozen snapshot
  return <KassaSettlement date={date} s={s} z={z} />;
}
