-- Hlíðarkaup — supplier-invoice registry to HARD-BLOCK duplicate purchase invoices.
-- Keyed by (supplier kennitala, invoice number). Every posting path inserts here inside its
-- transaction; the partial unique index is the hard block. Dedup only applies when BOTH the
-- kennitala and the invoice number are known. Apply after 190_einvoice_outbox.sql.
set search_path = acc, public;

create table if not exists acc.supplier_invoices (
  id                  uuid primary key default gen_random_uuid(),
  supplier_kennitala  text not null,
  invoice_number      text not null,
  voucher_id          uuid references acc.vouchers(id),
  supplier_id         uuid references acc.suppliers(id),
  source              text,
  created_at          timestamptz not null default now()
);

create unique index if not exists uq_supplier_invoice
  on acc.supplier_invoices (supplier_kennitala, invoice_number)
  where supplier_kennitala <> '' and invoice_number <> '';

-- Best-effort backfill from already-booked móttaka receipts (clean source: kt + invoice_number).
insert into acc.supplier_invoices (supplier_kennitala, invoice_number, voucher_id, supplier_id, source)
select regexp_replace(coalesce(s.kennitala, ''), '\D', '', 'g'), btrim(gr.invoice_number), gr.voucher_id, gr.supplier_id, 'backfill-mottaka'
from acc.goods_receipts gr
left join acc.suppliers s on s.id = gr.supplier_id
where gr.status = 'booked' and coalesce(btrim(gr.invoice_number), '') <> '' and coalesce(s.kennitala, '') <> ''
on conflict do nothing;
