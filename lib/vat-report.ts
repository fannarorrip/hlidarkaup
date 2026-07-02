// Pure VAT-report figures (Virðisaukaskattsskýrsla). No pg — shared by the server page, the PDF
// route and the Excel route. Uses net per VAT account (robust to reversals).
import type { VatRateRow, VatAcctRow } from "@/lib/accounting-queries";

export interface VatLine { account: string; name: string; amount: number }
export interface VatReport {
  v24: number; v11: number; v0: number; veltaTotal: number;
  out: VatLine[]; output: number;
  inn: VatLine[]; input: number;
  net: number; // >0 = skuld við ríkissjóð, <0 = inneign
}

const OUT_ACCTS = ["9530", "9532"];
const INN_ACCTS = ["9510", "9512", "9520"];

export function buildVatReport(velta: VatRateRow[], accts: VatAcctRow[]): VatReport {
  const veltaAt = (r: number) => Number(velta.find((v) => Math.round(Number(v.rate)) === r)?.net ?? 0);
  const v24 = veltaAt(24), v11 = veltaAt(11), v0 = veltaAt(0);

  const out = accts.filter((a) => OUT_ACCTS.includes(a.account_number))
    .map((a) => ({ account: a.account_number, name: a.name, amount: Number(a.credit) - Number(a.debit) }));
  const inn = accts.filter((a) => INN_ACCTS.includes(a.account_number))
    .map((a) => ({ account: a.account_number, name: a.name, amount: Number(a.debit) - Number(a.credit) }));

  const output = out.reduce((s, a) => s + a.amount, 0);
  const input = inn.reduce((s, a) => s + a.amount, 0);
  return { v24, v11, v0, veltaTotal: v24 + v11 + v0, out, output, inn, input, net: output - input };
}
