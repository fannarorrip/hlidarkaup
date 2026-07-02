-- Inbox-ingested invoice drafts (sjálfvirk skráning úr tölvupósti).
-- Each row is one email message that may become a dagbók entry. The source
-- attachment is kept as bytea so it (a) becomes the fylgiskjal on approval and
-- (b) travels with the nightly pg_dump (7-yr retention, Rgl 505/2013). A human
-- must approve before anything posts to the immutable ledger (Lög 145/1994).
set search_path = acc, public;

create table if not exists acc.email_invoices (
  id               uuid primary key default gen_random_uuid(),
  message_id       text unique not null,             -- Microsoft Graph message id (dedupe)
  received_at      timestamptz,
  from_address     text,
  from_name        text,
  subject          text,
  status           text not null default 'pending'
                     check (status in ('pending','approved','rejected','skipped','error')),
  extracted        jsonb,                            -- {supplier, invoiceNumber, date, lines:[{account,description,vatRate,amount}]}
  attachment_name  text,
  attachment_mime  text,
  attachment_size  int,
  attachment_bytes bytea,                            -- the source document (fylgiskjal-to-be)
  voucher_id       uuid references acc.vouchers(id), -- set when approved → posted
  error            text,
  created_at       timestamptz default now(),
  processed_at     timestamptz
);
create index if not exists idx_email_invoices_status on acc.email_invoices(status, received_at desc);

-- Single-row watermark so the poller only asks Graph for messages newer than the
-- last successful check (dedupe is still enforced by message_id, this just bounds the query).
create table if not exists acc.email_sync (
  id               int primary key default 1 check (id = 1),
  last_checked_at  timestamptz,
  last_received_at timestamptz
);
insert into acc.email_sync (id) values (1) on conflict (id) do nothing;
