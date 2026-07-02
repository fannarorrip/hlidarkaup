import { getIncomeStatementPeriod } from "@/lib/accounting-queries";
import { buildIncomeStatement } from "@/lib/income-statement";
import ReksturView from "./ReksturView";

export const dynamic = "force-dynamic";

export default async function ReksturPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const from = sp.from || `${now.getFullYear()}-01-01`;
  const to = sp.to || now.toISOString().slice(0, 10);

  const is = buildIncomeStatement(await getIncomeStatementPeriod(from, to));

  return <ReksturView is={is} from={from} to={to} />;
}
