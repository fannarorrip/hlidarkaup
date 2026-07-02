// Lánadrottna-afstemming: compare a supplier's statement (their list of invoices to us)
// against what WE have booked for that supplier (vouchers tagged supplier_id, external_reference
// = invoice nr, gross = sum of debits). Flag-only — surfaces discrepancies, books nothing.
import { db } from "@/lib/db";
import { normInv } from "@/lib/invoice-dedup";
import type { StatementLine } from "@/lib/invoice-extract";

export type ReconStatus = "matched" | "amount-diff" | "missing-here" | "extra-here";
export interface ReconLine {
  invoiceNumber: string; date: string | null;
  statementAmount: number | null; ourAmount: number | null;
  status: ReconStatus; voucherId: string | null;
}
export interface ReconResult {
  matched: number; amountDiff: number; missingHere: number; extraHere: number;
  statementTotal: number; ourTotal: number; lines: ReconLine[];
}

export async function reconcileSupplierStatement(supplierId: string, statementLines: StatementLine[]): Promise<ReconResult> {
  const ours = (await db.query<{ invoice_number: string | null; voucher_id: string; gross: string; voucher_date: string }>(`
    select v.external_reference as invoice_number, v.id as voucher_id, v.voucher_date::text as voucher_date,
           coalesce(sum(le.debit),0) as gross
    from acc.vouchers v join acc.ledger_entries le on le.voucher_id = v.id
    where v.supplier_id = $1 and v.status in ('posted','reversed')
    group by v.id, v.external_reference, v.voucher_date`, [supplierId])).rows;

  const ourByNo = new Map<string, { voucherId: string; gross: number; date: string; invoiceNumber: string }>();
  for (const r of ours) {
    const key = normInv(r.invoice_number).toLowerCase();
    if (!key) continue;
    ourByNo.set(key, { voucherId: r.voucher_id, gross: Math.round(Number(r.gross)), date: r.voucher_date, invoiceNumber: (r.invoice_number || "").trim() });
  }

  const lines: ReconLine[] = [];
  const seen = new Set<string>();
  for (const s of statementLines) {
    const key = normInv(s.invoiceNumber).toLowerCase();
    const our = key ? ourByNo.get(key) : undefined;
    if (our) seen.add(key);
    const stAmt = Math.round(Number(s.amount) || 0);
    const status: ReconStatus = !our ? "missing-here" : Math.abs(our.gross - stAmt) > 1 ? "amount-diff" : "matched";
    lines.push({ invoiceNumber: s.invoiceNumber, date: s.date || null, statementAmount: stAmt, ourAmount: our?.gross ?? null, status, voucherId: our?.voucherId ?? null });
  }
  for (const [key, our] of ourByNo) {
    if (seen.has(key)) continue;
    lines.push({ invoiceNumber: our.invoiceNumber, date: our.date, statementAmount: null, ourAmount: our.gross, status: "extra-here", voucherId: our.voucherId });
  }

  return {
    matched: lines.filter((l) => l.status === "matched").length,
    amountDiff: lines.filter((l) => l.status === "amount-diff").length,
    missingHere: lines.filter((l) => l.status === "missing-here").length,
    extraHere: lines.filter((l) => l.status === "extra-here").length,
    statementTotal: statementLines.reduce((a, s) => a + (Math.round(Number(s.amount) || 0)), 0),
    ourTotal: [...ourByNo.values()].reduce((a, o) => a + o.gross, 0),
    lines,
  };
}
