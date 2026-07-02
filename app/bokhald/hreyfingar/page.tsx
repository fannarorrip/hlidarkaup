import { getLedgerEntriesPeriod, getLedgerOpeningBalances } from "@/lib/accounting-queries";
import { buildLedger } from "@/lib/ledger-report";
import HreyfingarView from "./HreyfingarView";

export const dynamic = "force-dynamic";

export default async function HreyfingarPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const from = sp.from || `${now.getFullYear()}-01-01`;
  const to = sp.to || now.toISOString().slice(0, 10);

  const [opening, entries] = await Promise.all([getLedgerOpeningBalances(from), getLedgerEntriesPeriod(from, to)]);
  const accounts = buildLedger(opening, entries);

  return <HreyfingarView accounts={accounts} from={from} to={to} />;
}
