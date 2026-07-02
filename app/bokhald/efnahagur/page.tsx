import { getBalanceSheetAsOf, getRetainedThroughAsOf } from "@/lib/accounting-queries";
import { buildBalanceSheet } from "@/lib/balance-sheet";
import EfnahagurView from "./EfnahagurView";

export const dynamic = "force-dynamic";

export default async function EfnahagurPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const sp = await searchParams;
  const asOf = sp.asOf || new Date().toISOString().slice(0, 10);

  const [bs, is] = await Promise.all([getBalanceSheetAsOf(asOf), getRetainedThroughAsOf(asOf)]);
  const sheet = buildBalanceSheet(bs, is);

  return <EfnahagurView bs={sheet} asOf={asOf} />;
}
