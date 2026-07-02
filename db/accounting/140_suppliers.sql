-- Birgjar (supplier register) as an accounts-payable SUBLEDGER of the GL.
-- Mirrors shop.customers (AR). A supplier is a kennitala-keyed party; purchase/
-- invoice vouchers are TAGGED with supplier_id, so the lánadrottnalisti (per-supplier
-- payable balance) is just a view of the 9300 control account — not a parallel list.
set search_path = acc, public;

create table if not exists acc.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  supplier_number    text unique,                 -- optional human-friendly number
  kennitala          text,                        -- 10-digit (nullable for one-off/cash)
  name               text not null,
  address            text,
  postal_code        text,
  city               text,
  phone              text,
  email              text,
  payment_terms_days int not null default 0,      -- 0 = staðgreitt
  ap_account         text references acc.accounts(account_number) default '9300', -- lánadrottnar innlendir
  is_generic         boolean not null default false, -- the "Ýmsir birgjar" catch-all
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_suppliers_name_trgm on acc.suppliers using gin (name gin_trgm_ops);
create unique index if not exists uq_suppliers_kennitala on acc.suppliers(kennitala) where kennitala is not null;

create or replace function acc.touch_supplier_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_suppliers_touch on acc.suppliers;
create trigger trg_suppliers_touch before update on acc.suppliers
  for each row execute function acc.touch_supplier_updated();

-- Catch-all for one-off / cash suppliers (mirrors the anonymous customer pattern).
insert into acc.suppliers (name, is_generic)
select 'Ýmsir birgjar', true where not exists (select 1 from acc.suppliers where is_generic);

-- Tag a voucher with a supplier (for payables). Nullable = untagged.
alter table acc.vouchers add column if not exists supplier_id uuid references acc.suppliers(id);
create index if not exists idx_vouchers_supplier on acc.vouchers(supplier_id);

-- Re-create post_voucher with p_supplier_id (posted vouchers are immutable, so the
-- supplier must be set at insert time — same pattern as p_customer_id in 031/070).
-- Drop the current 10-arg signature first so we don't leave an ambiguous overload.
drop function if exists acc.post_voucher(text, date, text, text, text, text, jsonb, uuid, uuid, text);

create or replace function acc.post_voucher(
  p_series_code         text,
  p_voucher_date        date,
  p_voucher_type        text,
  p_description         text,
  p_external_reference  text,
  p_user_id             text,
  p_lines               jsonb,
  p_reverses_voucher_id uuid default null,
  p_customer_id         uuid default null,
  p_source              text default null,
  p_supplier_id         uuid default null
) returns acc.vouchers
language plpgsql as $$
declare
  v_voucher      acc.vouchers;
  v_number       bigint;
  v_total_debit  numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_line         jsonb;
  v_idx          int := 0;
  v_debit        numeric(18,2);
  v_credit       numeric(18,2);
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A voucher needs at least two lines (double-entry).';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit  := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    if (v_debit = 0) = (v_credit = 0) then
      raise exception 'Each line must be exactly one of debit/credit (got debit=%, credit=%).', v_debit, v_credit;
    end if;
    v_total_debit  := v_total_debit  + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;
  if v_total_debit <> v_total_credit then
    raise exception 'Voucher does not balance: debit % <> credit %.', v_total_debit, v_total_credit;
  end if;

  update acc.voucher_series set next_number = next_number + 1
   where series_code = p_series_code returning next_number - 1 into v_number;
  if v_number is null then raise exception 'Unknown voucher series %', p_series_code; end if;

  insert into acc.vouchers(series_code, voucher_number, voucher_date, voucher_type,
                           description, external_reference, status,
                           reverses_voucher_id, customer_id, source, supplier_id, created_by, posted_at, posted_by)
  values (p_series_code, v_number, p_voucher_date, p_voucher_type,
          p_description, p_external_reference, 'posted',
          p_reverses_voucher_id, p_customer_id, p_source, p_supplier_id, p_user_id, now(), p_user_id)
  returning * into v_voucher;

  v_idx := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    insert into acc.ledger_entries(voucher_id, line_no, account_number, debit, credit, vat_code, description)
    values (v_voucher.id, v_idx, v_line->>'account',
            coalesce((v_line->>'debit')::numeric, 0), coalesce((v_line->>'credit')::numeric, 0),
            nullif(v_line->>'vat_code',''), v_line->>'description');
  end loop;

  insert into acc.audit_log(user_id, action, entity, entity_id, details)
  values (p_user_id, 'post_voucher', 'voucher', v_voucher.id::text,
          jsonb_build_object('series', p_series_code, 'number', v_number, 'type', p_voucher_type,
                             'amount', v_total_debit, 'reference', p_external_reference,
                             'customer', p_customer_id, 'source', p_source, 'supplier', p_supplier_id));
  return v_voucher;
end $$;
