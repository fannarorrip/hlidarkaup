-- Channel/source tag on each voucher, so turnover (velta) can be split by sales
-- channel: staffed till ('till'), self-checkout kiosk ('kiosk'), web shop ('web'),
-- eldhús/SVO GOTT online ('eldhus'). Metadata only — does NOT touch the immutable
-- ledger entries, so it doesn't conflict with Lög 145/1994 gr. 21.
set search_path = acc, public;

alter table acc.vouchers add column if not exists source text;

-- Re-create post_voucher with p_source (posted vouchers are immutable, so the
-- source must be set at insert time — same pattern as p_customer_id in 031).
drop function if exists acc.post_voucher(text, date, text, text, text, text, jsonb, uuid, uuid);

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
  p_source              text default null
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
                           reverses_voucher_id, customer_id, source, created_by, posted_at, posted_by)
  values (p_series_code, v_number, p_voucher_date, p_voucher_type,
          p_description, p_external_reference, 'posted',
          p_reverses_voucher_id, p_customer_id, p_source, p_user_id, now(), p_user_id)
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
                             'customer', p_customer_id, 'source', p_source));
  return v_voucher;
end $$;

-- Backfill the source of existing sales so the dashboard split is correct from day one.
-- This is channel-classification metadata, NOT a change to any posted financial figure,
-- so we briefly lift the immutability trigger for this one-time tagging only.
alter table acc.vouchers disable trigger trg_vouchers_immutable;
update acc.vouchers set source =
  case
    when voucher_type = 'web_sale'                                                   then 'web'
    when voucher_type = 'account_sale'                                               then 'till'
    when voucher_type = 'kassi_sale' and coalesce(description,'') like '%afgrei%'    then 'till'
    when voucher_type = 'kassi_sale'                                                 then 'kiosk'
    else source
  end
where source is null;
alter table acc.vouchers enable trigger trg_vouchers_immutable;
