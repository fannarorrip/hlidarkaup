-- Duplicate-invoice guard v2: invoice numbers compare case-insensitively with collapsed
-- whitespace. Normalize existing registry rows to the new form (drop newer collisions first
-- so the unique index survives the update). Registry rows for reversed vouchers are released
-- by application logic, not here.
set search_path = acc, public;

delete from acc.supplier_invoices a
 using acc.supplier_invoices b
 where a.id <> b.id
   and a.supplier_kennitala = b.supplier_kennitala
   and upper(regexp_replace(btrim(a.invoice_number), '\s+', ' ', 'g'))
     = upper(regexp_replace(btrim(b.invoice_number), '\s+', ' ', 'g'))
   and a.created_at > b.created_at;

update acc.supplier_invoices
   set invoice_number = upper(regexp_replace(btrim(invoice_number), '\s+', ' ', 'g'))
 where invoice_number <> upper(regexp_replace(btrim(invoice_number), '\s+', ' ', 'g'));
