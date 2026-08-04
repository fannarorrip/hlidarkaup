import { getDailySettlement } from "@/lib/accounting-queries";
import { getZReport } from "@/lib/z-report";
import { getStaffSession } from "@/lib/staff-auth-server";
import KassaSettlement from "./KassaSettlement";

export const dynamic = "force-dynamic";

export default async function KassauppgjorPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : new Date().toISOString().slice(0, 10);
  const z = await getZReport(date);
  const s = z ? z.snapshot : await getDailySettlement(date);   // locked days render the frozen snapshot
  // Lagerstjóri sér AÐEINS sjóðstalninguna (hvað á að vera í kassanum + telja + loka degi) —
  // velta, VSK og greiðslumátar eru stjórnenda-/bókaramál.
  const role = (await getStaffSession())?.role ?? "";
  return <KassaSettlement date={date} s={s} z={z} minimal={role === "lagerstjori"} />;
}
