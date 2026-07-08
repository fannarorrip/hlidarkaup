-- Register attribution on each voucher: which register (kassi 1-3 / sjálfsafgreiðsla 1-2)
-- rang the sale. Metadata only, set at insert time — same pattern as source/customer/supplier
-- in 031/070/140 — so it never touches the immutable ledger entries (Lög 145/1994 gr. 21).
set search_path = acc, public;

alter table acc.vouchers add column if not exists register_id text;
create index if not exists idx_vouchers_register on acc.vouchers(register_id);

-- Re-create post_voucher with p_register_id. Drop the current 11-arg signature first so we
-- don't leave an ambiguous overload (same care as 140 when it added p_supplier_id).
drop function if exists acc.post_voucher(text, date, text, text, text, text, jsonb, uuid, uuid, text, uuid);

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
  p_supplier_id         uuid default null,
  p_register_id         text default null
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
                           reverses_voucher_id, customer_id, source, supplier_id, register_id, created_by, posted_at, posted_by)
  values (p_series_code, v_number, p_voucher_date, p_voucher_type,
          p_description, p_external_reference, 'posted',
          p_reverses_voucher_id, p_customer_id, p_source, p_supplier_id, p_register_id, p_user_id, now(), p_user_id)
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
                             'customer', p_customer_id, 'source', p_source, 'supplier', p_supplier_id,
                             'register', p_register_id));
  return v_voucher;
end $$;
