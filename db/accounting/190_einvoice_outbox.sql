-- Hlíðarkaup — OUTGOING e-invoice outbox (rafrænir sölureikningar gegnum inExchange).
-- One row per sölureikningur addressed to a "rafræn viðskipti" customer. The generated UBL
-- is captured at enqueue time (audit + retry). Transmission is gated by INEXCHANGE_SEND_ENABLED;
-- until enabled, rows sit as 'queued'. Apply after 180_rafraen_vidskipti.sql.
set search_path = acc, public;

create table if not exists acc.einvoice_outbox (
  id              uuid primary key default gen_random_uuid(),
  voucher_id      uuid not null unique references acc.vouchers(id),
  customer_id     uuid references shop.customers(id),
  recipient_kt    text,
  invoice_number  text,
  filename        text,
  ubl_xml         text,
  status          text not null default 'queued',   -- queued | sent | failed | skipped
  attempts        int  not null default 0,
  return_code     int,
  return_string   text,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists idx_einvoice_outbox_status on acc.einvoice_outbox(status);
