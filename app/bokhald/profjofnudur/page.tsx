import { getTrialBalancePeriod } from "@/lib/accounting-queries";
import { buildTrialBalance } from "@/lib/trial-balance";
import TrialBalanceView from "./TrialBalanceView";

export const dynamic = "force-dynamic";

export default async function ProfjofnudurPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const from = sp.from || `${now.getFullYear()}-01-01`;
  const to = sp.to || now.toISOString().slice(0, 10);

  const rows = await getTrialBalancePeriod(from, to);
  const tb = buildTrialBalance(rows);

  return <TrialBalanceView tb={tb} from={from} to={to} />;
}
