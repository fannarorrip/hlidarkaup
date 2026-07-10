import { NextRequest, NextResponse } from "next/server";
import { getAccountStatement, accountsStatus } from "@/lib/arion-b2b-accounts";
import { storeBankTransactions, listBankTransactions } from "@/lib/bank-statement";
import type { ArionAccountTx } from "@/lib/arion";

// Hreyfingaryfirlit (account statement) from Arion/RB B2B via the Bridge — the PRODUCTION
// statement path (PSD2 never goes live; see deploy/ARION_ONBOARDING.md).
// Gated stjórnandi via middleware (/api/bankatenging).
// POST { account (12 digits), dateFrom, dateTo, ledgerAccount? } → fetches from the bank,
// stores lines deduped into acc.bank_transactions (same pipeline/booking as before: the
// /api/bankatenging/statement/book route + learned mótlyklar work unchanged), and returns
// the stored rows. Intraday rows have no TransactionID yet (RB assigns them next day) —
// they are counted but not stored, so re-fetching tomorrow picks them up without duplicates.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, status: accountsStatus() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const st = accountsStatus();
  if (!st.configured) {
    return NextResponse.json({ ok: false, configured: false, message: "B2B yfirlitsþjónusta er ekki tengd (ARION_B2B_ACCOUNTS_URL — sjá deploy/ARION_B2B_BRIDGE.md)." });
  }
  const account = String(body.account || "").replace(/\D/g, "");
  const dateFrom = String(body.dateFrom || "");
  const dateTo = String(body.dateTo || "");
  const ledgerAccount = String(body.ledgerAccount || "") || undefined;

  const res = await getAccountStatement({
    account, dateFrom, dateTo,
    recordFrom: Number(body.recordFrom) || undefined,
    recordTo: Number(body.recordTo) || undefined,
  });
  if (!res.ok || !res.statement) return NextResponse.json({ ok: false, configured: true, message: res.error || "Sókn mistókst." });

  const s = res.statement;
  // Map B2B rows onto the statement pipeline. TransactionID is the dedup key; intraday rows
  // (empty id) are skipped by storeBankTransactions and land on tomorrow's fetch.
  const mapped = s.transactions.map((t) => ({
    id: t.transactionId,
    bookingDate: t.transactionDate || "",
    valueDate: t.valueDate || "",
    amount: t.amount,
    currency: s.currency || "ISK",
    counterparty: t.referenceDetail || t.reference || t.category || null,
    remittance: [t.category, t.billNumber ? `seðill ${t.billNumber}` : ""].filter(Boolean).join(" · ") || null,
    reference: t.reference || null,
  })) as unknown as ArionAccountTx[];
  const intraday = s.transactions.filter((t) => !t.transactionId).length;

  const { stored, skipped } = await storeBankTransactions(mapped, account, s.iban || undefined, ledgerAccount);
  const rows = await listBankTransactions(account, dateFrom, dateTo);

  return NextResponse.json({
    ok: true, configured: true,
    fetched: s.transactions.length, stored, skipped, intraday,
    balance: s.balance, availableAmount: s.availableAmount, iban: s.iban,
    accountInformation: s.accountInformation,
    transactions: rows,
  });
}
