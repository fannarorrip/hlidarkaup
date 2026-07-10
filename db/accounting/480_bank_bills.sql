-- Incoming bank bills / kröfur (ógreiddar kröfur, greiðsluseðlar) that OTHERS issue against us —
-- Hlíðarkaup as the PAYOR. Fetched from Arion/RB B2B BillService (GetBills) through the B2B Bridge.
-- These are what we OWE at the bank; DISTINCT from acc.payables (our own posted AP items from
-- purchase vouchers). Keyed by the B2B BillKey (Bank|Ledger|Number|DueDate|PayorId|ClaimantId).
create table if not exists acc.bank_bills (
  id            uuid primary key default gen_random_uuid(),
  bill_key      text not null unique,                 -- Bank|Ledger|Number|DueDate|PayorId|ClaimantId
  bank          text,                                 -- 4-digit útibú
  ledger        text,                                 -- 2-digit höfuðbók (e.g. 66)
  number        text,                                 -- kröfunúmer
  due_date      date,                                 -- gjalddagi
  final_due_date date,                                -- eindagi
  identifier    text,                                 -- tilvísun / auðkenni greiðanda
  description   text,                                 -- skýring
  amount_due    numeric(14,2),                        -- upphæð til greiðslu
  minimum_amount numeric(14,2),                       -- lágmarksupphæð
  currency      text default 'ISK',
  claimant_id   text,                                 -- kt kröfuhafa (sá sem rukkar okkur)
  claimant_name text,                                 -- nafn (frá lánadrottnaskrá ef til)
  payor_id      text,                                 -- kt greiðanda (okkar kt)
  claim_type    text,                                 -- ClaimType: Default/Light/Optional/…
  bill_type     text,                                 -- BillType: Claim/Bond/BillOfExchange/…
  is_debited    boolean not null default false,       -- í beingreiðslu/boðgreiðslu
  is_forward_payment boolean not null default false,
  is_settlement_fee  boolean not null default false,
  is_deposit    boolean not null default false,
  is_in_electronic_documents boolean not null default false,
  is_hidden     boolean not null default false,
  status        text not null default 'open'
                check (status in ('open','paid','hidden','ignored','gone')),
  payment_ref        text,                            -- Arion paymentId when paid via PSD2
  payment_status     text,
  payment_voucher_id uuid references acc.vouchers(id),
  paid_at       timestamptz,
  supplier_id   uuid references acc.suppliers(id),    -- matched lánadrottinn by claimant kt
  raw           jsonb,                                -- full BillInfo as received
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists bank_bills_status_idx   on acc.bank_bills(status, due_date);
create index if not exists bank_bills_claimant_idx on acc.bank_bills(claimant_id);
