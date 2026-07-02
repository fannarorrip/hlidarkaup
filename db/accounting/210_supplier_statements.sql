-- Hlíðarkaup — lánadrottna-afstemming: supplier statements (afstemmingalisti) uploaded for
-- reconciliation against our AP ledger. The source doc is kept as bytea (rides pg_dump),
-- the AI-extracted lines + reconciliation snapshot live in jsonb. Apply after 200.
set search_path = acc, public;

create table if not exists acc.supplier_statements (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid references acc.suppliers(id),
  supplier_kennitala  text,
  supplier_name       text,
  statement_date      date,
  closing_balance     numeric,
  doc_name            text,
  doc_mime            text,
  doc_bytes           bytea,
  extracted           jsonb,   -- {lines:[{invoiceNumber,date,amount}], closingBalance}
  result              jsonb,   -- reconciliation snapshot at upload time
  created_at          timestamptz not null default now(),
  created_by          text
);
create index if not exists idx_supplier_statements_supplier on acc.supplier_statements(supplier_id, created_at desc);
