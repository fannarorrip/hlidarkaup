-- Accounts-payable open items (ógreiddir reikningar). One row per booked supplier invoice
-- (the purchase voucher that credits the AP control account), so we can list invoice-level
-- unpaid bills with due dates + aging and settle them one by one — instead of only the
-- aggregate 9300 balance per supplier. Settlement posts a payment voucher (Dr 9300 / Cr bank)
-- and links it here. Populated going forward by postPurchase/confirmReceipt; existing invoices
-- can be imported on demand (backfillPayables).
set search_path = acc, public;

create table if not exists acc.payables (
  id                  uuid primary key default gen_random_uuid(),
  voucher_id          uuid not null unique references acc.vouchers(id),   -- the purchase voucher
  supplier_id         uuid references acc.suppliers(id),
  invoice_number      text,
  invoice_date        date,
  due_date            date,
  amount              numeric(18,2) not null,                             -- gross owed
  ap_account          text references acc.accounts(account_number) default '9300',
  status              text not null default 'open'
                        check (status in ('open','pending','paid','cancelled')),
  paid_amount         numeric(18,2) not null default 0,
  payment_voucher_id  uuid references acc.vouchers(id),                   -- the settlement voucher
  payment_ref         text,                                              -- Arion PSD2 paymentId
  payment_status      text,                                              -- Arion transactionStatus
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists payables_status_due_idx on acc.payables (status, due_date);
create index if not exists payables_supplier_idx on acc.payables (supplier_id);

-- Supplier bank details for outgoing payments (PSD2 creditorAccount). Kept minimal.
alter table acc.suppliers add column if not exists iban text;
