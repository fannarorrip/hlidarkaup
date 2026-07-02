// Launakerfi — Icelandic payroll calc engine + ledger posting (v2, Regla-parity).
// Unions are multi-fund (acc.union_funds); the calc produces a structured breakdown
// (rendered on the payslip) plus summary numbers (for lists/skilagrein/posting).
// Statutory rates come from acc.payroll_tax_config. Posting mirrors lib/purchases.ts.
import { db } from "@/lib/db";

const r = (n: number) => Math.round(n); // payroll amounts are whole krónur

export interface TaxConfig {
  year: number;
  personal_credit_monthly: number;
  bracket1_limit: number; bracket1_rate: number;
  bracket2_limit: number; bracket2_rate: number;
  bracket3_rate: number;
  tryggingagjald_rate: number;
}

export interface UnionFund {
  line_number: string | null; name: string; rate_pct: number | null; fixed_amount: number | null;
  payer: "employee" | "employer"; fund_type: string; pay_month: number | null;
}

export interface Employee {
  id: string; kennitala: string; name: string;
  employment_type: "salary" | "hourly";
  monthly_salary: number; hourly_rate: number; employment_ratio: number;
  personal_credit_pct: number;
  pension_employee_pct: number; pension_employer_pct: number;
  private_pension_employee_pct: number; private_pension_employer_pct: number;
  vacation_pct: number; orlof_method: "accrue" | "payout";
}

export interface PayComponent { kind: "yfirvinna" | "bonus" | "alag" | "fradrattur"; label?: string; units?: number; rate?: number; amount?: number }
export interface LineInput { hours?: number; components?: PayComponent[] }

export interface BreakdownItem { code: string; label: string; units?: number; rate?: number; amount: number }
export interface Breakdown {
  earnings: BreakdownItem[];
  pensionEmployee: BreakdownItem[];
  stadgreidsla: BreakdownItem[];
  personalCredit: number;
  unionEmployee: BreakdownItem[];
  deductions: BreakdownItem[];
  employer: { pensionAlmennur: number; pensionSereign: number; tryggingagjald: number; unionFunds: BreakdownItem[] };
  orlofAccrual: number;
}

export interface PayrollLine {
  employee_id: string; employee_name: string; kennitala: string; hours: number | null;
  gross: number; taxable: number; income_tax: number; personal_credit_used: number;
  pension_employee: number; pension_employer: number; private_employee: number; private_employer: number;
  union_dues: number; union_employer: number; tryggingagjald: number; vacation_accrual: number; net_pay: number;
  breakdown: Breakdown;
}

export function bracketTax(taxable: number, c: TaxConfig): number {
  if (taxable <= 0) return 0;
  let t = 0;
  t += Math.min(taxable, c.bracket1_limit) * (c.bracket1_rate / 100);
  if (taxable > c.bracket1_limit) t += (Math.min(taxable, c.bracket2_limit) - c.bracket1_limit) * (c.bracket2_rate / 100);
  if (taxable > c.bracket2_limit) t += (taxable - c.bracket2_limit) * (c.bracket3_rate / 100);
  return t;
}

const FUND_CODE: Record<string, string> = { sjukrasjodur: "9130", orlofsheimila: "9140", starfsmennt: "9160" };

/** Compute one employee's payroll line (pure). `funds` = the employee's union funds. */
export function calcLine(emp: Employee, input: LineInput, c: TaxConfig, funds: UnionFund[], month: number): PayrollLine {
  const num = (v: unknown) => Number(v) || 0;
  const ratio = num(emp.employment_ratio || 100) / 100;
  const hours = input.hours != null ? Number(input.hours) : null;
  const earnings: BreakdownItem[] = [];

  // Base wages
  if (emp.employment_type === "hourly") {
    const units = hours ?? 0; const rate = num(emp.hourly_rate);
    earnings.push({ code: "100", label: "Tímavinna", units, rate, amount: r(units * rate) });
  } else {
    earnings.push({ code: "101", label: "Mánaðarlaun", amount: r(num(emp.monthly_salary) * ratio) });
  }
  // Input components
  for (const comp of input.components ?? []) {
    if (comp.kind === "yfirvinna") {
      const amt = comp.amount != null ? r(num(comp.amount)) : r(num(comp.units) * num(comp.rate));
      if (amt) earnings.push({ code: "110", label: comp.label || "Yfirvinna", units: comp.units != null ? num(comp.units) : undefined, rate: comp.rate != null ? num(comp.rate) : undefined, amount: amt });
    }
    else if (comp.kind === "bonus") earnings.push({ code: "240", label: comp.label || "Bónus", amount: r(num(comp.amount)) });
    else if (comp.kind === "alag") earnings.push({ code: "241", label: comp.label || "Álag", amount: r(num(comp.amount)) });
  }
  const regularWages = earnings.reduce((a, e) => a + e.amount, 0); // orlof base (excl. uppbætur)

  // Auto uppbætur for this month (taxable wages)
  for (const f of funds) {
    if ((f.fund_type === "desemberuppbot" || f.fund_type === "orlofsuppbot") && f.pay_month === month && f.fixed_amount) {
      const code = f.fund_type === "desemberuppbot" ? "130" : "132";
      earnings.push({ code, label: f.name, amount: r(num(f.fixed_amount) * ratio) });
    }
  }

  // Orlof: payout adds an earning; accrue is a liability only.
  const accrue = emp.orlof_method !== "payout";
  const orlofPay = accrue ? 0 : r(regularWages * num(emp.vacation_pct) / 100);
  if (orlofPay) earnings.push({ code: "119", label: "Orlof greitt", amount: orlofPay });

  const gross = earnings.reduce((a, e) => a + e.amount, 0);
  const orlofAccrual = accrue ? r(regularWages * num(emp.vacation_pct) / 100) : 0;

  // Pension (pre-tax): almennur + séreign
  const penEeAlm = r(gross * num(emp.pension_employee_pct) / 100);
  const penEeSer = r(gross * num(emp.private_pension_employee_pct) / 100);
  const pensionEmployee: BreakdownItem[] = [];
  if (penEeAlm) pensionEmployee.push({ code: "9000", label: "Lífeyrissjóður", rate: num(emp.pension_employee_pct), amount: penEeAlm });
  if (penEeSer) pensionEmployee.push({ code: "9010", label: "Séreignarsparnaður", rate: num(emp.private_pension_employee_pct), amount: penEeSer });

  const taxable = Math.max(0, gross - penEeAlm - penEeSer);

  // Staðgreiðsla per bracket
  const stadgreidsla: BreakdownItem[] = [];
  const b1 = Math.min(taxable, c.bracket1_limit);
  if (b1 > 0) stadgreidsla.push({ code: "9701", label: "Staðgreiðsla þrep 1", rate: c.bracket1_rate, units: r(b1), amount: r(b1 * c.bracket1_rate / 100) });
  const b2 = Math.min(taxable, c.bracket2_limit) - c.bracket1_limit;
  if (b2 > 0) stadgreidsla.push({ code: "9702", label: "Staðgreiðsla þrep 2", rate: c.bracket2_rate, units: r(b2), amount: r(b2 * c.bracket2_rate / 100) });
  const b3 = taxable - c.bracket2_limit;
  if (b3 > 0) stadgreidsla.push({ code: "9703", label: "Staðgreiðsla þrep 3", rate: c.bracket3_rate, units: r(b3), amount: r(b3 * c.bracket3_rate / 100) });
  const bracketTotal = stadgreidsla.reduce((a, s) => a + s.amount, 0);
  const personalCredit = r(num(c.personal_credit_monthly) * num(emp.personal_credit_pct) / 100);
  const personalCreditUsed = Math.min(bracketTotal, personalCredit);
  const incomeTax = Math.max(0, bracketTotal - personalCreditUsed);

  // Union funds
  const unionEmployee: BreakdownItem[] = [];
  const unionFundsEr: BreakdownItem[] = [];
  for (const f of funds) {
    if (f.rate_pct == null) continue; // skip fixed uppbætur (handled as earnings)
    const amount = r(gross * num(f.rate_pct) / 100);
    if (!amount) continue;
    if (f.payer === "employee") unionEmployee.push({ code: "9100", label: f.name, rate: num(f.rate_pct), amount });
    else unionFundsEr.push({ code: FUND_CODE[f.fund_type] || "9190", label: f.name, rate: num(f.rate_pct), amount });
  }
  const unionDues = unionEmployee.reduce((a, u) => a + u.amount, 0);
  const unionEmployer = unionFundsEr.reduce((a, u) => a + u.amount, 0);

  // Ad-hoc deductions (mötuneyti, annar frádráttur)
  const deductions: BreakdownItem[] = [];
  for (const comp of input.components ?? []) {
    if (comp.kind === "fradrattur" && num(comp.amount)) deductions.push({ code: "740", label: comp.label || "Frádráttur", amount: r(num(comp.amount)) });
  }
  const deductTotal = deductions.reduce((a, d) => a + d.amount, 0);

  // Employer
  const penErAlm = r(gross * num(emp.pension_employer_pct) / 100);
  const penErSer = r(gross * num(emp.private_pension_employer_pct) / 100);
  const tryggingagjald = r(gross * num(c.tryggingagjald_rate) / 100);

  const netPay = gross - penEeAlm - penEeSer - incomeTax - unionDues - deductTotal;

  return {
    employee_id: emp.id, employee_name: emp.name, kennitala: emp.kennitala, hours,
    gross, taxable, income_tax: incomeTax, personal_credit_used: personalCreditUsed,
    pension_employee: penEeAlm, pension_employer: penErAlm, private_employee: penEeSer, private_employer: penErSer,
    union_dues: unionDues, union_employer: unionEmployer, tryggingagjald, vacation_accrual: orlofAccrual, net_pay: netPay,
    breakdown: {
      earnings, pensionEmployee, stadgreidsla, personalCredit: personalCreditUsed, unionEmployee, deductions,
      employer: { pensionAlmennur: penErAlm, pensionSereign: penErSer, tryggingagjald, unionFunds: unionFundsEr },
      orlofAccrual,
    },
  };
}

// Ledger account map (verified against the chart; adjustable with the accountant).
export const PAYROLL_ACCOUNTS = {
  wages: "3100",                 // Laun (debit) — incl. uppbætur + accrued orlof
  tryggingagjaldExpense: "3200",
  pensionExpense: "3210",        // Mótframlag í lífeyrissjóð (almennur + séreign)
  unionSjukraExpense: "3220",    // Sjúkra-/orlofsheimilasjóður (launagreiðandi)
  unionStarfsmenntExpense: "3225",
  taxPayable: "9567",
  tryggingagjaldPayable: "9566",
  pensionUnionPayable: "9545",   // lífeyrir (ee+er) + félagsgjöld + sjóðir
  netPayable: "9540",
  vacationPayable: "9575",
  adhocDeduction: "3390",        // ad-hoc launþega-frádráttur (annar starfsmannakostn.) — confirm w/ accountant
};

export interface TotalsForPosting {
  gross: number; vacationAccrual: number; tryggingagjald: number;
  pensionEmployer: number; unionSjukra: number; unionStarfsmennt: number;
  incomeTax: number; pensionEmployee: number; unionDues: number; unionEmployer: number; deductions: number; netPay: number;
}

export function sumTotals(lines: PayrollLine[]): TotalsForPosting {
  const s = (f: (l: PayrollLine) => number) => lines.reduce((a, l) => a + f(l), 0);
  const erFund = (l: PayrollLine, types: string[]) =>
    l.breakdown.employer.unionFunds.filter((u) => types.includes(u.code)).reduce((a, u) => a + u.amount, 0);
  return {
    gross: s((l) => l.gross), vacationAccrual: s((l) => l.vacation_accrual), tryggingagjald: s((l) => l.tryggingagjald),
    pensionEmployer: s((l) => l.pension_employer + l.private_employer),
    unionSjukra: s((l) => erFund(l, ["9130", "9140", "9190"])),
    unionStarfsmennt: s((l) => erFund(l, ["9160"])),
    incomeTax: s((l) => l.income_tax), pensionEmployee: s((l) => l.pension_employee + l.private_employee),
    unionDues: s((l) => l.union_dues), unionEmployer: s((l) => l.union_employer),
    deductions: s((l) => l.breakdown.deductions.reduce((a, d) => a + d.amount, 0)), netPay: s((l) => l.net_pay),
  };
}

export function buildVoucherLines(t: TotalsForPosting) {
  const A = PAYROLL_ACCOUNTS;
  const d = (account: string, debit: number, description: string) => ({ account, debit, credit: 0, vat_code: null, description });
  const c = (account: string, credit: number, description: string) => ({ account, debit: 0, credit, vat_code: null, description });
  const lines = [
    d(A.wages, t.gross + t.vacationAccrual, "Laun"),
    d(A.tryggingagjaldExpense, t.tryggingagjald, "Tryggingagjald"),
    d(A.pensionExpense, t.pensionEmployer, "Mótframlag í lífeyrissjóð"),
    d(A.unionSjukraExpense, t.unionSjukra, "Sjúkra-/orlofsheimilasjóður"),
    d(A.unionStarfsmenntExpense, t.unionStarfsmennt, "Starfsmenntasjóður"),
    c(A.taxPayable, t.incomeTax, "Staðgreiðsla starfsmanna"),
    c(A.tryggingagjaldPayable, t.tryggingagjald, "Tryggingagjald"),
    c(A.pensionUnionPayable, t.pensionEmployee + t.pensionEmployer + t.unionDues + t.unionEmployer, "Lífeyrir og félagsgjöld"),
    c(A.netPayable, t.netPay, "Ógreidd nettólaun"),
    c(A.vacationPayable, t.vacationAccrual, "Áfallið orlof"),
    c(A.adhocDeduction, t.deductions, "Frádráttur launþega"),
  ];
  return lines.filter((l) => l.debit !== 0 || l.credit !== 0);
}

export class PayrollError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function getTaxConfig(year: number): Promise<TaxConfig> {
  const rows = await db.query<TaxConfig>(
    `select year, personal_credit_monthly::float8, bracket1_limit::float8, bracket1_rate::float8,
            bracket2_limit::float8, bracket2_rate::float8, bracket3_rate::float8, tryggingagjald_rate::float8
       from acc.payroll_tax_config where year <= $1 order by year desc limit 1`, [year]);
  if (!rows.rows[0]) throw new PayrollError(`Engin skattastilling fyrir ${year}`, 500);
  return rows.rows[0];
}

export async function getUnionFunds(unionId: string | null): Promise<UnionFund[]> {
  if (!unionId) return [];
  const rows = await db.query<UnionFund>(
    `select line_number, name, rate_pct::float8, fixed_amount::float8, payer, fund_type, pay_month
       from acc.union_funds where union_id = $1 order by sort`, [unionId]);
  return rows.rows;
}

export async function postPayrollRun(runId: string): Promise<{ voucherId: string; voucherNumber: string; invoiceNumber: string }> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const run = (await client.query<{ id: string; year: number; month: number; pay_date: string; status: string }>(
      `select id, year, month, pay_date, status from acc.payroll_runs where id = $1 for update`, [runId])).rows[0];
    if (!run) throw new PayrollError("Launakeyrsla fannst ekki", 404);
    if (run.status === "posted") throw new PayrollError("Þegar bókað", 409);

    const lineRows = (await client.query<PayrollLine>(
      `select gross::float8, income_tax::float8, pension_employee::float8, pension_employer::float8,
              private_employee::float8, private_employer::float8, union_dues::float8, union_employer::float8,
              tryggingagjald::float8, vacation_accrual::float8, net_pay::float8, breakdown
         from acc.payroll_lines where run_id = $1`, [runId])).rows;
    if (!lineRows.length) throw new PayrollError("Engar launalínur í keyrslunni");

    const totals = sumTotals(lineRows);
    const vlines = buildVoucherLines(totals);
    const mm = String(run.month).padStart(2, "0");
    const v = (await client.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher($1,$2::date,$3,$4,$5,$6,$7::jsonb)`,
      ["PAYROLL", run.pay_date, "payroll", `Launakeyrsla ${mm}/${run.year}`, `LAUN-${run.year}${mm}`, "bokhald", JSON.stringify(vlines)])).rows[0];

    await client.query(
      `update acc.payroll_runs set status='posted', voucher_id=$1,
         total_gross=$2, total_tax=$3, total_pension=$4, total_net=$5, total_tryggingagjald=$6 where id=$7`,
      [v.id, totals.gross, totals.incomeTax, totals.pensionEmployee + totals.pensionEmployer, totals.netPay, totals.tryggingagjald, runId]);

    await client.query("commit");
    return { voucherId: v.id, voucherNumber: String(v.voucher_number), invoiceNumber: `L-${String(v.voucher_number).padStart(6, "0")}` };
  } catch (err) {
    await client.query("rollback");
    if (err instanceof PayrollError) throw err;
    const msg = err instanceof Error ? err.message : "";
    throw new PayrollError(msg.includes("balance") ? "Færslan stemmir ekki (debet ≠ kredit)" : "Villa við bókun launakeyrslu", 400);
  } finally {
    client.release();
  }
}
