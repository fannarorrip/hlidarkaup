import { getBankAccounts, getAccountEntriesAsOf, getOpenReconciliation, type ReconEntry } from "@/lib/accounting-queries";
import BankRecon from "./BankRecon";

export const dynamic = "force-dynamic";

export default async function BankReconPage({ searchParams }: { searchParams: Promise<{ account?: string; date?: string }> }) {
  const sp = await searchParams;
  const banks = await getBankAccounts();
  const account = sp.account || "";
  const date = sp.date || new Date().toISOString().slice(0, 10);

  let entries: ReconEntry[] = [];
  let ledgerBalance = 0;
  let open: Awaited<ReturnType<typeof getOpenReconciliation>> = null;
  if (account) {
    entries = await getAccountEntriesAsOf(account, date);
    ledgerBalance = entries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0);
    open = await getOpenReconciliation("bank", account);
  }
  const acctName = banks.find((b) => b.account_number === account)?.name ?? "";

  return <BankRecon banks={banks} account={account} acctName={acctName} date={date} entries={entries} ledgerBalance={ledgerBalance} open={open} />;
}
