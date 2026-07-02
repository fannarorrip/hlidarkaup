// Read-only queries for the back-office (bókhald + sölukerfi) UI. Server-only (uses pg).
import { query } from "@/lib/db";

export interface AccountRow {
  account_number: string; name: string; account_type: string; statement: string | null;
  parent_number: string | null; vat_rate: string | null; rsk_code: string | null;
  is_postable: boolean; total_debit: string; total_credit: string; balance: string;
}
export interface VoucherRow {
  id: string; series_code: string; voucher_number: string; voucher_date: string;
  voucher_type: string; status: string; description: string | null; amount: string;
  source?: string | null;
}
export interface EntryRow {
  line_no: number; account_number: string; account_name: string;
  debit: string; credit: string; vat_code: string | null; description: string | null;
}

export async function getSummary() {
  // Velta (gross turnover incl. VSK) split by sales channel. Each sale voucher has
  // exactly one money-in debit line equal to the gross total, so summing debits over
  // sale vouchers per channel gives the gross turnover (works for every sale, incl.
  // those posted before shop.sale_lines existed).
  const rows = await query<{
    till_gross: string; kiosk_gross: string; web_gross: string; eldhus_gross: string;
    sales_tx: string; output_vat: string;
    accounts: string; products: string; barcodes: string;
  }>(`
    with velta as (
      select v.source, coalesce(sum(le.debit),0) as gross, count(distinct v.id) as tx
      from acc.vouchers v join acc.ledger_entries le on le.voucher_id = v.id
      where v.status='posted'
        and v.voucher_type in ('kassi_sale','account_sale','web_sale','eldhus_sale')
      group by v.source
    )
    select
      (select coalesce(gross,0) from velta where source='till')   as till_gross,
      (select coalesce(gross,0) from velta where source='kiosk')  as kiosk_gross,
      (select coalesce(gross,0) from velta where source='web')    as web_gross,
      (select coalesce(gross,0) from velta where source='eldhus') as eldhus_gross,
      (select coalesce(sum(tx),0) from velta) as sales_tx,
      (select coalesce(sum(le.credit),0) from acc.ledger_entries le join acc.vouchers v on v.id=le.voucher_id
         where v.status='posted' and le.account_number in ('9530','9532')) as output_vat,
      (select count(*) from acc.accounts) as accounts,
      (select count(*) from shop.products) as products,
      (select count(*) from shop.product_barcodes) as barcodes`);
  return rows[0];
}

const VOUCHER_SELECT = `
  select v.id, v.series_code, v.voucher_number, v.voucher_date::text, v.voucher_type,
         v.status, v.description, v.source, coalesce(sum(le.debit),0) as amount
  from acc.vouchers v join acc.ledger_entries le on le.voucher_id=v.id`;

export const getRecentVouchers = (limit = 12) =>
  query<VoucherRow>(`${VOUCHER_SELECT} group by v.id order by v.voucher_date desc, v.voucher_number desc limit $1`, [limit]);

export const getVouchers = (limit = 200) =>
  query<VoucherRow>(`${VOUCHER_SELECT} group by v.id order by v.voucher_date desc, v.voucher_number desc limit $1`, [limit]);

export interface SalesInvoiceRow extends VoucherRow {
  customer_id: string | null;
  customer_flagged: boolean;       // customer marked rafræn viðskipti
  customer_kt: string | null;
  einvoice_status: string | null;  // acc.einvoice_outbox.status (null = never queued)
}
export const getSalesInvoices = (limit = 200) =>
  query<SalesInvoiceRow>(`
    select v.id, v.series_code, v.voucher_number, v.voucher_date::text, v.voucher_type,
           v.status, v.description, v.source, coalesce(sum(le.debit),0) as amount,
           v.customer_id,
           coalesce(c.rafraen_vidskipti, false) as customer_flagged,
           c.kennitala as customer_kt,
           eo.status as einvoice_status
    from acc.vouchers v
    join acc.ledger_entries le on le.voucher_id = v.id
    left join shop.customers c on c.id = v.customer_id
    left join acc.einvoice_outbox eo on eo.voucher_id = v.id
    where v.voucher_type in ('kassi_sale','sales_invoice','credit_note','web_sale','account_sale','eldhus_sale')
    group by v.id, c.rafraen_vidskipti, c.kennitala, eo.status
    order by v.voucher_date desc, v.voucher_number desc limit $1`, [limit]);

export async function getVoucher(id: string) {
  const v = (await query<VoucherRow & {
    external_reference: string | null; posted_at: string | null; posted_by: string | null;
    has_document: boolean; document_name: string | null; document_skjalanumer: string | null;
  }>(`
    select v.id, v.series_code, v.voucher_number, v.voucher_date::text, v.voucher_type, v.status,
           v.description, v.external_reference, v.posted_at::text, v.posted_by,
           coalesce((select sum(debit) from acc.ledger_entries where voucher_id=v.id),0) as amount,
           exists(select 1 from acc.documents d where d.voucher_id=v.id) as has_document,
           (select filename from acc.documents d where d.voucher_id=v.id order by created_at desc limit 1) as document_name,
           (select skjalanumer from acc.documents d where d.voucher_id=v.id order by created_at desc limit 1) as document_skjalanumer
    from acc.vouchers v where v.id=$1`, [id]))[0];
  if (!v) return null;
  const lines = await query<EntryRow>(`
    select le.line_no, le.account_number, a.name as account_name, le.debit, le.credit, le.vat_code, le.description
    from acc.ledger_entries le join acc.accounts a on a.account_number=le.account_number
    where le.voucher_id=$1 order by le.line_no`, [id]);
  return { voucher: v, lines };
}

export const getAccounts = () =>
  query<AccountRow>(`
    select a.account_number, a.name, a.account_type, a.statement, a.parent_number,
           a.vat_rate, a.rsk_code, a.is_postable,
           coalesce(sum(le.debit),0) as total_debit, coalesce(sum(le.credit),0) as total_credit,
           coalesce(sum(le.debit),0) - coalesce(sum(le.credit),0) as balance
    from acc.accounts a
    left join acc.ledger_entries le on le.account_number=a.account_number
    left join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    group by a.account_number order by a.account_number`);

export const getTrialBalance = () =>
  query<{ account_number: string; name: string; account_type: string; total_debit: string; total_credit: string; balance: string }>(
    `select * from acc.trial_balance where total_debit<>0 or total_credit<>0 order by account_number`);

export interface TBRawRow {
  account_number: string; name: string; account_type: string; rsk_code: string | null; vat_rate: string | null;
  opening_debit: string; opening_credit: string; period_debit: string; period_credit: string;
}
// Trial balance for a period: opening balance (before `from`), movement (from..to), closing.
export const getTrialBalancePeriod = (from: string, to: string) =>
  query<TBRawRow>(`
    select a.account_number, a.name, a.account_type, a.rsk_code, a.vat_rate,
      coalesce(sum(le.debit)  filter (where v.voucher_date <  $1::date), 0) as opening_debit,
      coalesce(sum(le.credit) filter (where v.voucher_date <  $1::date), 0) as opening_credit,
      coalesce(sum(le.debit)  filter (where v.voucher_date between $1::date and $2::date), 0) as period_debit,
      coalesce(sum(le.credit) filter (where v.voucher_date between $1::date and $2::date), 0) as period_credit
    from acc.accounts a
    left join acc.ledger_entries le on le.account_number = a.account_number
    left join acc.vouchers v on v.id = le.voucher_id and v.status in ('posted','reversed')
    group by a.account_number, a.name, a.account_type, a.rsk_code, a.vat_rate
    having coalesce(sum(le.debit)  filter (where v.voucher_date <= $2::date), 0) <> 0
        or coalesce(sum(le.credit) filter (where v.voucher_date <= $2::date), 0) <> 0
    order by a.account_number`, [from, to]);

export const getVatReport = () =>
  query<{ vat_code: string; rate: string; net_sales: string; output_vat: string }>(`
    select le.vat_code, vc.rate,
           coalesce(sum(le.credit) filter (where a.account_type='tekjur'),0) as net_sales,
           coalesce(sum(le.credit) filter (where le.account_number in ('9530','9532')),0) as output_vat
    from acc.ledger_entries le
    join acc.vouchers v on v.id=le.voucher_id and v.status='posted'
    join acc.accounts a on a.account_number=le.account_number
    left join acc.vat_codes vc on vc.code=le.vat_code
    where le.vat_code is not null group by le.vat_code, vc.rate order by le.vat_code`);

export const getPurchases = (limit = 200) =>
  query<VoucherRow>(`${VOUCHER_SELECT}
    where v.voucher_type = 'purchase'
    group by v.id order by v.voucher_date desc, v.voucher_number desc limit $1`, [limit]);

export const getPostableAccounts = (types: string[]) =>
  query<{ account_number: string; name: string; account_type: string }>(
    `select account_number, name, account_type from acc.accounts
       where is_postable and account_type::text = any($1::text[]) order by account_number`, [types]);

// Next fylgiskjalanúmer that the JOURNAL series will assign (peek, doesn't consume).
export const getNextJournalNumber = async () =>
  Number((await query<{ n: string }>(
    `select coalesce(next_number, 1) as n from acc.voucher_series where series_code='JOURNAL'`))[0]?.n ?? 1);

// ── Email-ingested invoice drafts (Pósthólf) ─────────────────────────────────
export interface EmailInvoiceRow {
  id: string; received_at: string | null; from_address: string | null; from_name: string | null;
  subject: string | null; status: string; error: string | null;
  supplier: string | null; invoice_number: string | null; line_count: number; total: number;
  has_attachment: boolean; voucher_id: string | null;
}

export const getEmailInvoices = (statuses: string[], limit = 100) =>
  query<EmailInvoiceRow>(
    `select id, received_at, from_address, from_name, subject, status, error,
            extracted->>'supplier'      as supplier,
            extracted->>'invoiceNumber' as invoice_number,
            coalesce(jsonb_array_length(extracted->'lines'), 0) as line_count,
            coalesce((select sum(greatest((l->>'amount')::numeric, 0))
                        from jsonb_array_elements(extracted->'lines') l), 0)::float8 as total,
            (attachment_bytes is not null) as has_attachment,
            voucher_id
       from acc.email_invoices
      where status = any($1)
      order by received_at desc nulls last
      limit $2`, [statuses, limit]);

export const getPendingEmailCount = async () =>
  Number((await query<{ n: number }>(`select count(*)::int as n from acc.email_invoices where status = 'pending'`))[0]?.n ?? 0);

export interface EmailInvoiceDetail {
  id: string; status: string; subject: string | null; from_address: string | null; from_name: string | null;
  received_at: string | null; extracted: { supplier?: string; invoiceNumber?: string; date?: string; lines?: unknown[] } | null;
  attachment_name: string | null; has_attachment: boolean; voucher_id: string | null;
}
export const getEmailInvoice = (id: string) =>
  query<EmailInvoiceDetail>(
    `select id, status, subject, from_address, from_name, received_at, extracted,
            attachment_name, (attachment_bytes is not null) as has_attachment, voucher_id
       from acc.email_invoices where id = $1`, [id]).then((r) => r[0] ?? null);

export const getBankAccounts = () =>
  query<{ account_number: string; name: string }>(
    `select account_number, name from acc.accounts where is_postable and rsk_code = '5160' order by account_number`);

// ── Afstemming (reconciliation) ──────────────────────────────────────────────
export interface ReconEntry {
  id: string; voucher_id: string; series_code: string; voucher_number: string; voucher_date: string;
  voucher_type: string; description: string | null; line_description: string | null;
  debit: string; credit: string;
}
export const getAccountEntriesAsOf = (account: string, asOf: string) =>
  query<ReconEntry>(`
    select le.id, v.id as voucher_id, v.series_code, v.voucher_number, v.voucher_date::text, v.voucher_type,
           v.description, le.description as line_description, le.debit, le.credit
    from acc.ledger_entries le
    join acc.vouchers v on v.id = le.voucher_id and v.status in ('posted','reversed')
    where le.account_number = $1 and v.voucher_date <= $2::date
    order by v.voucher_date, v.voucher_number, le.line_no`, [account, asOf]);

export const getOpenReconciliation = async (type: string, account: string) =>
  (await query<{ id: string; statement_balance: string | null; cleared: string[]; as_of_date: string; note: string | null }>(`
    select id, statement_balance, cleared::text[] as cleared, as_of_date::text, note
    from acc.reconciliations where recon_type = $1 and account_number = $2 and status = 'open'
    order by updated_at desc limit 1`, [type, account]))[0] ?? null;

// Reikningsafstemming — customers with a non-zero receivable balance (ógreitt).
export const getOpenReceivables = () =>
  query<{ id: string; name: string; kennitala: string | null; balance: string; invoices: number }>(`
    select c.id, c.name, c.kennitala,
      coalesce(sum(le.debit - le.credit), 0) as balance,
      count(distinct v.id) filter (where v.voucher_type = 'account_sale') as invoices
    from shop.customers c
    left join acc.vouchers v on v.customer_id = c.id and v.status in ('posted','reversed')
    left join acc.ledger_entries le on le.voucher_id = v.id and le.account_number = coalesce(c.ar_account, '7600')
    group by c.id, c.name, c.kennitala
    having round(coalesce(sum(le.debit - le.credit), 0)) <> 0
    order by coalesce(sum(le.debit - le.credit), 0) desc`);

// Possible double-booked sales (same customer + date + amount).
export const getDuplicateSales = () =>
  query<{ customer_name: string | null; voucher_date: string; amount: string; cnt: number; vouchers: string }>(`
    with sv as (
      select v.id, v.series_code, v.voucher_number, v.voucher_date, v.customer_id,
             coalesce((select sum(le.debit) from acc.ledger_entries le where le.voucher_id = v.id), 0) as amount
      from acc.vouchers v
      where v.voucher_type in ('account_sale','web_sale','sales_invoice') and v.status = 'posted'
    )
    select c.name as customer_name, sv.voucher_date::text, sv.amount, count(*)::int as cnt,
           string_agg(sv.series_code || '-' || sv.voucher_number, ', ' order by sv.voucher_number) as vouchers
    from sv left join shop.customers c on c.id = sv.customer_id
    group by c.name, sv.voucher_date, sv.amount
    having count(*) > 1
    order by sv.voucher_date desc`);

// Birgðaafstemming — stock-controlled products with their recorded quantity.
export const getStockProducts = () =>
  query<{ product_number: string; name: string; stock_quantity: string; price_gross: number; product_group: string | null }>(`
    select product_number, name, stock_quantity, price_gross, product_group
    from shop.products where is_stock_controlled order by name`);

export const getVatSettlement = async () => (await query<{ output_vat: string; input_vat: string }>(`
  select coalesce(sum(le.credit) filter (where le.account_number in ('9530','9532')), 0) as output_vat,
         coalesce(sum(le.debit)  filter (where le.account_number in ('9510','9512','9520')), 0) as input_vat
  from acc.ledger_entries le join acc.vouchers v on v.id = le.voucher_id and v.status = 'posted'`))[0];

// Daily till settlement (Kassauppgjör / Z-report) for a date: money in per payment method,
// velta + útskattur by VAT rate, sale/return counts. Returns (credit_note) net out.
export interface DailySettlement {
  card: string; cash: string; transfer: string; account: string;
  velta24: string; velta11: string; velta0: string; output_vat: string;
  sale_count: number; return_count: number;
}
const SALE_TYPES = "('kassi_sale','account_sale','web_sale','eldhus_sale','credit_note')";
export const getDailySettlement = async (date: string) => (await query<DailySettlement>(`
  with le_day as (
    select le.account_number, le.debit, le.credit, v.voucher_type
    from acc.ledger_entries le
    join acc.vouchers v on v.id = le.voucher_id
    where v.status = 'posted' and v.voucher_date = $1::date and v.voucher_type in ${SALE_TYPES}
  )
  select
    coalesce(sum(debit - credit) filter (where account_number = '7716'), 0) as card,
    coalesce(sum(debit - credit) filter (where account_number = '7850'), 0) as cash,
    coalesce(sum(debit - credit) filter (where account_number = '7830'), 0) as transfer,
    coalesce(sum(debit - credit) filter (where account_number = '7600'), 0) as account,
    coalesce(sum(credit - debit) filter (where account_number = '1200'), 0) as velta24,
    coalesce(sum(credit - debit) filter (where account_number = '1213'), 0) as velta11,
    coalesce(sum(credit - debit) filter (where account_number = '1220'), 0) as velta0,
    coalesce(sum(credit - debit) filter (where account_number in ('9530','9532')), 0) as output_vat,
    (select count(*) filter (where voucher_type <> 'credit_note') from acc.vouchers where status='posted' and voucher_date=$1::date and voucher_type in ${SALE_TYPES})::int as sale_count,
    (select count(*) filter (where voucher_type = 'credit_note') from acc.vouchers where status='posted' and voucher_date=$1::date and voucher_type in ${SALE_TYPES})::int as return_count
  from le_day`, [date]))[0];

// Period-aware VSK (for the VSK uppgjör screen with a chosen tímabil).
export interface VatRateRow { rate: string; net: string }
export const getVatVeltaByRate = (from: string, to: string) =>
  query<VatRateRow>(`
    select coalesce(vc.rate, 0)::text as rate, coalesce(sum(le.credit - le.debit), 0) as net
    from acc.ledger_entries le
    join acc.vouchers v on v.id = le.voucher_id and v.status = 'posted' and v.voucher_type <> 'vat_settlement' and v.voucher_date between $1::date and $2::date
    join acc.accounts a on a.account_number = le.account_number and a.account_type = 'tekjur'
    left join acc.vat_codes vc on vc.code = le.vat_code
    group by vc.rate`, [from, to]);

export interface VatAcctRow { account_number: string; name: string; debit: string; credit: string }
// Excludes the vat_settlement clearing voucher so booking an uppgjör doesn't re-enter the report.
export const getVatAccountsPeriod = (from: string, to: string) =>
  query<VatAcctRow>(`
    select le.account_number, a.name, coalesce(sum(le.debit),0) as debit, coalesce(sum(le.credit),0) as credit
    from acc.ledger_entries le
    join acc.vouchers v on v.id = le.voucher_id and v.status = 'posted' and v.voucher_type <> 'vat_settlement' and v.voucher_date between $1::date and $2::date
    join acc.accounts a on a.account_number = le.account_number
    where le.account_number in ('9510','9512','9520','9530','9532')
    group by le.account_number, a.name order by le.account_number`, [from, to]);

// ── Aðalbók / Hreyfingar ─────────────────────────────────────────────────────
export interface MovementRow {
  voucher_id: string; series_code: string; voucher_number: string; voucher_date: string;
  voucher_type: string; account_number: string; account_name: string;
  debit: string; credit: string; vat_code: string | null; description: string | null;
}
export const getMovements = (limit = 300) =>
  query<MovementRow>(`
    select v.id as voucher_id, v.series_code, v.voucher_number, v.voucher_date::text, v.voucher_type,
           le.account_number, a.name as account_name, le.debit, le.credit, le.vat_code, le.description
    from acc.ledger_entries le
    join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    join acc.accounts a on a.account_number=le.account_number
    order by v.voucher_date desc, v.voucher_number desc, le.line_no limit $1`, [limit]);

// Aðalbók/Hreyfingar grouped per account for a period (the expandable per-lykill list + PDF).
export interface LedgerEntryRow {
  account_number: string; name: string; account_type: string;
  voucher_id: string; series_code: string; voucher_number: string; voucher_date: string;
  debit: string; credit: string; vat_code: string | null; description: string | null;
}
export const getLedgerEntriesPeriod = (from: string, to: string) =>
  query<LedgerEntryRow>(`
    select le.account_number, a.name, a.account_type,
           v.id as voucher_id, v.series_code, v.voucher_number, v.voucher_date::text,
           le.debit, le.credit, le.vat_code, le.description
    from acc.ledger_entries le
    join acc.vouchers v on v.id = le.voucher_id and v.status in ('posted','reversed') and v.voucher_date between $1::date and $2::date
    join acc.accounts a on a.account_number = le.account_number
    order by le.account_number, v.voucher_date, v.voucher_number, le.line_no`, [from, to]);

export interface LedgerOpeningRow { account_number: string; account_type: string; opening_debit: string; opening_credit: string }
export const getLedgerOpeningBalances = (from: string) =>
  query<LedgerOpeningRow>(`
    select le.account_number, a.account_type,
           coalesce(sum(le.debit),0) as opening_debit, coalesce(sum(le.credit),0) as opening_credit
    from acc.ledger_entries le
    join acc.vouchers v on v.id = le.voucher_id and v.status in ('posted','reversed') and v.voucher_date < $1::date
    join acc.accounts a on a.account_number = le.account_number
    group by le.account_number, a.account_type`, [from]);

export const getLedgerAccounts = () =>
  query<{ account_number: string; name: string; account_type: string; total_debit: string; total_credit: string; balance: string }>(
    `select * from acc.trial_balance where total_debit<>0 or total_credit<>0 order by account_number`);

export async function getAccountLedger(account: string) {
  const acct = (await query<{ account_number: string; name: string; account_type: string }>(
    `select account_number, name, account_type from acc.accounts where account_number=$1`, [account]))[0];
  if (!acct) return null;
  const entries = await query<MovementRow>(`
    select v.id as voucher_id, v.series_code, v.voucher_number, v.voucher_date::text, v.voucher_type,
           le.account_number, a.name as account_name, le.debit, le.credit, le.vat_code, le.description
    from acc.ledger_entries le
    join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    join acc.accounts a on a.account_number=le.account_number
    where le.account_number=$1 order by v.voucher_date, v.voucher_number, le.line_no`, [account]);
  return { account: acct, entries };
}

// ── Financial statements ─────────────────────────────────────────────────────
export interface StatementRow { account_number: string; name: string; account_type: string; amount: string }
export const getIncomeStatement = () =>
  query<StatementRow>(`
    select a.account_number, a.name, a.account_type,
           coalesce(sum(case when a.account_type='tekjur' then le.credit-le.debit else le.debit-le.credit end),0) as amount
    from acc.accounts a
    join acc.ledger_entries le on le.account_number=a.account_number
    join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    where a.account_type in ('tekjur','gjold')
    group by a.account_number order by a.account_number`);

// Income statement for a period (voucher_date between from and to).
export const getIncomeStatementPeriod = (from: string, to: string) =>
  query<StatementRow>(`
    select a.account_number, a.name, a.account_type,
           coalesce(sum(case when a.account_type='tekjur' then le.credit-le.debit else le.debit-le.credit end),0) as amount
    from acc.accounts a
    join acc.ledger_entries le on le.account_number=a.account_number
    join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    where a.account_type in ('tekjur','gjold') and v.voucher_date between $1::date and $2::date
    group by a.account_number order by a.account_number`, [from, to]);

// Balance sheet as of a date (cumulative through asOf).
export const getBalanceSheetAsOf = (asOf: string) =>
  query<StatementRow & { balance: string }>(`
    select a.account_number, a.name, a.account_type,
           coalesce(sum(le.debit),0)-coalesce(sum(le.credit),0) as balance,
           coalesce(sum(le.debit),0)-coalesce(sum(le.credit),0) as amount
    from acc.accounts a
    join acc.ledger_entries le on le.account_number=a.account_number
    join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    where a.account_type in ('eign','skuld','eigid_fe') and v.voucher_date <= $1::date
    group by a.account_number order by a.account_number`, [asOf]);

// Net profit (retained earnings) for tekjur/gjold through asOf — flows into the balance sheet as eigið fé.
export const getRetainedThroughAsOf = (asOf: string) =>
  query<StatementRow>(`
    select a.account_number, a.name, a.account_type,
           coalesce(sum(case when a.account_type='tekjur' then le.credit-le.debit else le.debit-le.credit end),0) as amount
    from acc.accounts a
    join acc.ledger_entries le on le.account_number=a.account_number
    join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    where a.account_type in ('tekjur','gjold') and v.voucher_date <= $1::date
    group by a.account_number order by a.account_number`, [asOf]);

export const getBalanceSheet = () =>
  query<StatementRow & { balance: string }>(`
    select a.account_number, a.name, a.account_type,
           coalesce(sum(le.debit),0)-coalesce(sum(le.credit),0) as balance,
           coalesce(sum(le.debit),0)-coalesce(sum(le.credit),0) as amount
    from acc.accounts a
    join acc.ledger_entries le on le.account_number=a.account_number
    join acc.vouchers v on v.id=le.voucher_id and v.status in ('posted','reversed')
    where a.account_type in ('eign','skuld','eigid_fe')
    group by a.account_number order by a.account_number`);

// ── Sölukerfi: vörur / vöruflokkar ───────────────────────────────────────────
export interface ProductRow {
  product_number: string; name: string; price_gross: number; vat_rate: string;
  stock_quantity: string; is_stock_controlled: boolean; product_group: string | null; barcodes: number;
}
export const getProducts = (limit = 300) =>
  query<ProductRow>(`
    select p.product_number, p.name, p.price_gross, p.vat_rate, p.stock_quantity, p.is_stock_controlled, p.product_group,
           (select count(*)::int from shop.product_barcodes b where b.product_number=p.product_number) as barcodes
    from shop.products p order by p.name limit $1`, [limit]);

// Server-side, ACCENT-INSENSITIVE product search over ALL products (name / number / barcode),
// so "rjomi" finds "RJÓMI". Replaces the old client-side filter over a 2000-row subset.
export const searchProducts = (q: string, limit = 500) =>
  query<ProductRow>(`
    select p.product_number, p.name, p.price_gross, p.vat_rate, p.stock_quantity, p.is_stock_controlled, p.product_group,
           (select count(*)::int from shop.product_barcodes b where b.product_number=p.product_number) as barcodes
    from shop.products p
    where unaccent(p.name) ilike unaccent('%'||$1||'%')
       or p.product_number ilike $1||'%'
       or exists (select 1 from shop.product_barcodes b where b.product_number=p.product_number and b.barcode like $1||'%')
    order by p.name limit $2`, [q, limit]);

export const getProductCount = async () =>
  Number((await query<{ c: string }>(`select count(*)::int c from shop.products`))[0].c);

export const getProductGroups = () =>
  query<{ product_group: string; count: number; stock: string }>(`
    select coalesce(nullif(product_group,''),'(óflokkað)') as product_group,
           count(*)::int as count,
           coalesce(sum(case when is_stock_controlled then stock_quantity else 0 end),0) as stock
    from shop.products group by 1 order by count desc`);

export interface ProductDetail {
  product_number: string; name: string; description: string | null;
  unit_price_net: string; vat_key: string | null; vat_rate: string; price_gross: number;
  stock_quantity: string; is_stock_controlled: boolean; product_group: string | null;
  unit_code: string | null; use_scale: boolean; allow_discount: boolean; is_active: boolean;
  regla_id: string | null; synced_at: string | null;
  reorder_point: string | null; reorder_qty: string | null;
  image_url: string | null;
}
export interface SaleLine {
  line_no: number; product_number: string | null; name: string;
  quantity: string; unit_price_gross: string; line_total: string; vat_rate: string;
}
export async function getSaleReceipt(id: string) {
  const v = (await query<{
    id: string; series_code: string; voucher_number: string; voucher_date: string;
    voucher_type: string; status: string; source: string | null; external_reference: string | null;
    customer_name: string | null; customer_kennitala: string | null;
  }>(`
    select v.id, v.series_code, v.voucher_number, v.voucher_date::text, v.voucher_type, v.status,
           v.source, v.external_reference, c.name as customer_name, c.kennitala as customer_kennitala
    from acc.vouchers v left join shop.customers c on c.id = v.customer_id
    where v.id = $1`, [id]))[0];
  if (!v) return null;
  const lines = await query<SaleLine>(`
    select line_no, product_number, name, quantity, unit_price_gross, line_total, vat_rate
    from shop.sale_lines where voucher_id = $1 order by line_no`, [id]);
  return { voucher: v, lines };
}

export interface CustomerRow {
  id: string; customer_number: string | null; kennitala: string | null; name: string;
  address: string | null; postal_code: string | null; city: string | null; phone: string | null; email: string | null;
  payment_terms_days: number; is_account: boolean; is_active: boolean; is_generic: boolean; ar_account: string | null;
  rafraen_vidskipti: boolean;
  billing_mode: string;   // 'consolidated' | 'per_trip'
  balance: string;
}
export const getCustomers = () =>
  query<CustomerRow>(`
    select c.*, coalesce((
      select sum(le.debit - le.credit)
      from acc.vouchers v join acc.ledger_entries le on le.voucher_id = v.id
      where v.customer_id = c.id and v.status in ('posted','reversed')
        and le.account_number = coalesce(c.ar_account, '7600')
    ), 0) as balance
    from shop.customers c order by c.is_generic, c.name`);

export const getCustomer = async (id: string) =>
  (await query<CustomerRow>(`select c.*, 0 as balance from shop.customers c where c.id = $1`, [id]))[0] ?? null;

export async function getProductDetail(productNumber: string) {
  const p = (await query<ProductDetail>(`
    select product_number, name, description, unit_price_net, vat_key, vat_rate, price_gross,
           stock_quantity, is_stock_controlled, product_group, unit_code, use_scale, allow_discount, is_active,
           regla_id, synced_at::text, reorder_point, reorder_qty, image_url
    from shop.products where product_number = $1`, [productNumber]))[0];
  if (!p) return null;
  const bc = await query<{ barcode: string }>(
    `select barcode from shop.product_barcodes where product_number = $1 order by barcode`, [productNumber]);
  return { product: p, barcodes: bc.map((r) => r.barcode) };
}

// ── Launakerfi (payroll) ─────────────────────────────────────────────────────
export interface EmployeeRow {
  id: string; kennitala: string; name: string; email: string | null; phone: string | null; address: string | null;
  bank_account: string | null; employment_type: "salary" | "hourly"; monthly_salary: string; hourly_rate: string;
  personal_credit_pct: string; pension_fund: string | null; pension_employee_pct: string; pension_employer_pct: string;
  private_pension_employee_pct: string; private_pension_employer_pct: string; union_name: string | null;
  union_dues_pct: string; union_employer_pct: string; vacation_pct: string; orlof_method: "accrue" | "payout";
  staff_email: string | null; is_active: boolean; start_date: string | null; end_date: string | null;
  union_id: string | null; starfsheiti: string | null; deild: string | null; employment_ratio: string;
}
export const listEmployees = (activeOnly = false) =>
  query<EmployeeRow>(`select *, start_date::text as start_date, end_date::text as end_date
    from acc.employees ${activeOnly ? "where is_active" : ""} order by name`);
export const getEmployeeById = (id: string) =>
  query<EmployeeRow>(`select * from acc.employees where id = $1`, [id]).then((r) => r[0] ?? null);

export interface PayrollRunRow {
  id: string; year: number; month: number; pay_date: string; status: "draft" | "posted"; voucher_id: string | null;
  total_gross: string; total_tax: string; total_pension: string; total_net: string; total_tryggingagjald: string;
  note: string | null; created_at: string; line_count?: number;
}
const RUN_COLS = `id, year, month, pay_date::text as pay_date, status, voucher_id,
  total_gross, total_tax, total_pension, total_net, total_tryggingagjald, note, created_at::text as created_at`;
export const listPayrollRuns = () =>
  query<PayrollRunRow>(`select ${RUN_COLS}, (select count(*) from acc.payroll_lines l where l.run_id = r.id)::int as line_count
    from acc.payroll_runs r order by r.year desc, r.month desc, r.created_at desc`);
export const getPayrollRun = (id: string) =>
  query<PayrollRunRow>(`select ${RUN_COLS} from acc.payroll_runs where id = $1`, [id]).then((r) => r[0] ?? null);

export interface PayrollLineRow {
  id: string; employee_id: string | null; employee_name: string; kennitala: string | null; hours: string | null;
  gross: string; taxable: string; income_tax: string; personal_credit_used: string;
  pension_employee: string; pension_employer: string; private_employee: string; private_employer: string;
  union_dues: string; union_employer: string; tryggingagjald: string; vacation_accrual: string; net_pay: string;
  breakdown: unknown;
}
export const getPayrollLines = (runId: string) =>
  query<PayrollLineRow>(`select * from acc.payroll_lines where run_id = $1 order by employee_name`, [runId]);
export const getPayrollLine = (runId: string, employeeId: string) =>
  query<PayrollLineRow>(`select * from acc.payroll_lines where run_id = $1 and employee_id = $2`, [runId, employeeId]).then((r) => r[0] ?? null);

// Per-employee annual totals for launamiðar.
export const getLaunamidar = (year: number) =>
  query<{ employee_name: string; kennitala: string | null; gross: string; income_tax: string; pension_employee: string; net_pay: string }>(`
    select l.employee_name, l.kennitala,
           sum(l.gross)::float8 as gross, sum(l.income_tax)::float8 as income_tax,
           sum(l.pension_employee)::float8 as pension_employee, sum(l.net_pay)::float8 as net_pay
    from acc.payroll_lines l join acc.payroll_runs r on r.id = l.run_id
    where r.year = $1 and r.status = 'posted'
    group by l.employee_name, l.kennitala order by l.employee_name`, [year]);

// ── Stéttarfélög (unions) ────────────────────────────────────────────────────
export interface UnionRow { id: string; code: string | null; name: string; orlof_period_start: string | null; orlof_period_end: string | null; is_active: boolean }
export interface UnionFundRow {
  id: string; union_id: string; line_number: string | null; name: string; rate_pct: string | null;
  fixed_amount: string | null; payer: "employee" | "employer"; fund_type: string; pay_month: number | null; sort: number;
}
export const getUnions = () =>
  query<UnionRow>(`select id, code, name, orlof_period_start::text as orlof_period_start, orlof_period_end::text as orlof_period_end, is_active
    from acc.unions order by name`);
export const getUnionFundsAll = () =>
  query<UnionFundRow>(`select id, union_id, line_number, name, rate_pct::text, fixed_amount::text, payer, fund_type, pay_month, sort
    from acc.union_funds order by union_id, sort`);

// Per-employee year-to-date totals (posted runs only) through a given month.
export interface YtdRow {
  gross: number; income_tax: number; pension_employee: number; pension_employer: number;
  private_employee: number; private_employer: number; union_dues: number; union_employer: number;
  vacation_accrual: number; net_pay: number;
}
export const getEmployeeYtd = (employeeId: string, year: number, uptoMonth: number) =>
  query<YtdRow>(`
    select coalesce(sum(l.gross),0)::float8 gross, coalesce(sum(l.income_tax),0)::float8 income_tax,
           coalesce(sum(l.pension_employee),0)::float8 pension_employee, coalesce(sum(l.pension_employer),0)::float8 pension_employer,
           coalesce(sum(l.private_employee),0)::float8 private_employee, coalesce(sum(l.private_employer),0)::float8 private_employer,
           coalesce(sum(l.union_dues),0)::float8 union_dues, coalesce(sum(l.union_employer),0)::float8 union_employer,
           coalesce(sum(l.vacation_accrual),0)::float8 vacation_accrual, coalesce(sum(l.net_pay),0)::float8 net_pay
    from acc.payroll_lines l join acc.payroll_runs r on r.id = l.run_id
    where l.employee_id = $1 and r.status = 'posted' and r.year = $2 and r.month <= $3`,
    [employeeId, year, uptoMonth]).then((rows) => rows[0]);

// ── Birgjar (suppliers) — accounts-payable subledger ─────────────────────────
export interface SupplierRow {
  id: string; supplier_number: string | null; kennitala: string | null; name: string;
  address: string | null; postal_code: string | null; city: string | null; phone: string | null; email: string | null;
  payment_terms_days: number; ap_account: string | null; is_generic: boolean; is_active: boolean; balance: number;
}
// Per-supplier payable balance = Σ(credit − debit) on the supplier's payable account
// for vouchers tagged with this supplier (credit-normal liability = what we owe).
export const getSuppliers = () =>
  query<SupplierRow>(`
    select s.*, coalesce((
      select sum(le.credit - le.debit)
      from acc.vouchers v join acc.ledger_entries le on le.voucher_id = v.id
      where v.supplier_id = s.id and v.status in ('posted','reversed')
        and le.account_number = coalesce(s.ap_account, '9300')
    ), 0)::float8 as balance
    from acc.suppliers s order by s.is_generic, s.name`);

export const getSupplier = async (id: string) =>
  (await query<SupplierRow>(`select s.*, 0::float8 as balance from acc.suppliers s where s.id = $1`, [id]))[0] ?? null;

// Lightweight search for the supplier picker (name or kennitala prefix).
export const searchSuppliers = (q: string, limit = 20) =>
  query<{ id: string; name: string; kennitala: string | null; supplier_number: string | null; is_generic: boolean }>(`
    select id, name, kennitala, supplier_number, is_generic from acc.suppliers
    where is_active and ($1 = '' or unaccent(name) ilike unaccent('%'||$1||'%') or kennitala like $1||'%')
    order by is_generic, name limit $2`, [q, limit]);

export const findSupplierByKennitala = (kt: string) =>
  query<{ id: string; name: string }>(`select id, name from acc.suppliers where kennitala = $1 limit 1`, [kt]).then((r) => r[0] ?? null);

// ── Innkaupakerfi: móttaka (goods receipts) ──────────────────────────────────
export interface GoodsReceiptRow {
  id: string; supplier_id: string | null; supplier_name: string | null; invoice_number: string | null;
  invoice_date: string | null; source: string; status: string; voucher_id: string | null;
  total_net: string | null; total_vat: string | null; total_gross: string | null; line_count?: number;
}
export const listGoodsReceipts = () =>
  query<GoodsReceiptRow>(`select r.id, r.supplier_id, r.supplier_name, r.invoice_number, r.invoice_date::text as invoice_date,
      r.source, r.status, r.voucher_id, r.total_net, r.total_vat, r.total_gross,
      (select count(*) from acc.goods_receipt_lines l where l.receipt_id = r.id)::int as line_count
    from acc.goods_receipts r order by r.created_at desc limit 200`);
export const getGoodsReceipt = (id: string) =>
  query<GoodsReceiptRow & { has_doc: boolean }>(`select r.id, r.supplier_id, r.supplier_name, r.invoice_number,
      r.invoice_date::text as invoice_date, r.source, r.status, r.voucher_id, r.total_net, r.total_vat, r.total_gross,
      (r.doc_bytes is not null) as has_doc
    from acc.goods_receipts r where r.id = $1`, [id]).then((r) => r[0] ?? null);

export interface GoodsReceiptLineRow {
  id: string; line_no: number; supplier_item_id: string | null; gtin: string | null; description: string | null;
  invoiced_qty: string; unit_code: string | null; unit_price: string | null; line_net: string | null; vat_rate: string;
  matched_product_number: string | null; matched_name: string | null; received_qty: string | null;
}
export const getReceiptLines = (receiptId: string) =>
  query<GoodsReceiptLineRow>(`select l.*, p.name as matched_name
    from acc.goods_receipt_lines l left join shop.products p on p.product_number = l.matched_product_number
    where l.receipt_id = $1 order by l.line_no`, [receiptId]);

// Product search for the móttaka product-picker (by number / barcode / name).
export const searchProductsForPicker = (q: string, limit = 20) =>
  query<{ product_number: string; name: string; price_gross: number; stock_quantity: string }>(`
    select p.product_number, p.name, p.price_gross, p.stock_quantity from shop.products p
    where p.is_active and ($1 = '' or p.product_number ilike $1||'%' or unaccent(p.name) ilike unaccent('%'||$1||'%')
       or exists (select 1 from shop.product_barcodes b where b.product_number = p.product_number and b.barcode like $1||'%'))
    order by p.name limit $2`, [q, limit]);
