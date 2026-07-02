-- Fix: reversals must carry the original voucher's party tags (customer_id,
-- supplier_id) and source — otherwise a reversed invoice leaves a phantom balance
-- in the AR/AP subledger (the reversal hits the control account but is untagged,
-- so Σ(per-party) never nets to zero). Re-create reverse_voucher to pass them through.
set search_path = acc, public;

create or replace function acc.reverse_voucher(p_voucher_id uuid, p_user_id text, p_reason text)
returns acc.vouchers
language plpgsql as $$
declare
  v_orig  acc.vouchers;
  v_lines jsonb;
  v_new   acc.vouchers;
begin
  select * into v_orig from acc.vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Voucher % not found', p_voucher_id; end if;
  if v_orig.status <> 'posted' then
    raise exception 'Only posted vouchers can be reversed (status=%).', v_orig.status;
  end if;

  -- Mirror the entries (swap debit <-> credit)
  select jsonb_agg(jsonb_build_object(
           'account',     account_number,
           'debit',       credit,
           'credit',      debit,
           'vat_code',    vat_code,
           'description', 'Bakfærsla: ' || coalesce(description, ''))
         order by line_no)
    into v_lines
    from acc.ledger_entries
   where voucher_id = p_voucher_id;

  v_new := acc.post_voucher(
    v_orig.series_code,
    current_date,
    'reversal',
    'Bakfærsla fylgiskjals ' || coalesce(v_orig.voucher_number::text, '') || ' — ' || coalesce(p_reason, ''),
    v_orig.external_reference,
    p_user_id,
    v_lines,
    v_orig.id,                          -- p_reverses_voucher_id
    p_customer_id => v_orig.customer_id,-- carry the party tags so the subledger nets to zero
    p_source      => v_orig.source,
    p_supplier_id => v_orig.supplier_id
  );

  update acc.vouchers
     set status = 'reversed', reversed_by_voucher_id = v_new.id
   where id = v_orig.id;

  insert into acc.audit_log(user_id, action, entity, entity_id, details)
  values (p_user_id, 'reverse_voucher', 'voucher', v_orig.id::text,
          jsonb_build_object('reversed_by', v_new.id, 'reason', p_reason));

  return v_new;
end $$;
