-- Hlíðarkaup accounting — POSTING ENGINE + IMMUTABILITY
-- Apply after 001_foundation.sql

set search_path = acc, public;

-- ── Immutability ────────────────────────────────────────────────────────────
-- Posted vouchers and ALL ledger entries cannot be changed or deleted.
-- Corrections are made only with a reversing voucher (Lög 145/1994 gr. 21).

create or replace function acc.prevent_posted_voucher_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Cannot delete a % voucher (%). Use acc.reverse_voucher().', old.status, old.id;
    end if;
    return old;
  end if;
  -- UPDATE of a posted voucher: allow ONLY the controlled transition to 'reversed'
  if old.status = 'posted' then
    if new.status = 'reversed'
       and new.voucher_number is not distinct from old.voucher_number
       and new.series_code   = old.series_code
       and new.voucher_date  = old.voucher_date
       and new.voucher_type  = old.voucher_type then
      return new;
    end if;
    raise exception 'Posted voucher % is immutable (Lög 145/1994 gr. 21). Use acc.reverse_voucher().', old.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_vouchers_immutable on acc.vouchers;
create trigger trg_vouchers_immutable
  before update or delete on acc.vouchers
  for each row execute function acc.prevent_posted_voucher_mutation();

-- Ledger entries are fully append-only: no UPDATE, no DELETE, ever.
create or replace function acc.prevent_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Ledger entries are append-only (Lög 145/1994 gr. 21). Correct via acc.reverse_voucher().';
end $$;

drop trigger if exists trg_ledger_immutable on acc.ledger_entries;
create trigger trg_ledger_immutable
  before update or delete on acc.ledger_entries
  for each row execute function acc.prevent_ledger_mutation();

-- ── post_voucher: the ONLY way to write to the ledger ───────────────────────
-- Validates double-entry balance, assigns a gap-free number, writes voucher +
-- entries + audit row atomically. p_lines: jsonb array of
--   {"account":"3110","debit":0,"credit":1240,"vat_code":"S24","description":"..."}
create or replace function acc.post_voucher(
  p_series_code         text,
  p_voucher_date        date,
  p_voucher_type        text,
  p_description         text,
  p_external_reference  text,
  p_user_id             text,
  p_lines               jsonb,
  p_reverses_voucher_id uuid default null
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

  -- Pass 1: validate BEFORE consuming a voucher number (so invalid input never burns a number)
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

  -- Take next gap-free number (row lock serialises concurrent posts on this series)
  update acc.voucher_series
     set next_number = next_number + 1
   where series_code = p_series_code
  returning next_number - 1 into v_number;
  if v_number is null then
    raise exception 'Unknown voucher series %', p_series_code;
  end if;

  insert into acc.vouchers(series_code, voucher_number, voucher_date, voucher_type,
                           description, external_reference, status,
                           reverses_voucher_id, created_by, posted_at, posted_by)
  values (p_series_code, v_number, p_voucher_date, p_voucher_type,
          p_description, p_external_reference, 'posted',
          p_reverses_voucher_id, p_user_id, now(), p_user_id)
  returning * into v_voucher;

  -- Pass 2: insert the lines
  v_idx := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    insert into acc.ledger_entries(voucher_id, line_no, account_number, debit, credit, vat_code, description)
    values (v_voucher.id, v_idx,
            v_line->>'account',
            coalesce((v_line->>'debit')::numeric, 0),
            coalesce((v_line->>'credit')::numeric, 0),
            nullif(v_line->>'vat_code',''),
            v_line->>'description');
  end loop;

  insert into acc.audit_log(user_id, action, entity, entity_id, details)
  values (p_user_id, 'post_voucher', 'voucher', v_voucher.id::text,
          jsonb_build_object('series', p_series_code, 'number', v_number,
                             'type', p_voucher_type, 'amount', v_total_debit,
                             'reference', p_external_reference));
  return v_voucher;
end $$;

-- ── reverse_voucher: the only legal correction ──────────────────────────────
create or replace function acc.reverse_voucher(
  p_voucher_id uuid,
  p_user_id    text,
  p_reason     text
) returns acc.vouchers
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
    v_orig.id                       -- reverses_voucher_id, set at insert (posted row stays immutable)
  );

  -- Mark the original reversed (the one allowed transition on a posted voucher)
  update acc.vouchers
     set status = 'reversed', reversed_by_voucher_id = v_new.id
   where id = v_orig.id;

  insert into acc.audit_log(user_id, action, entity, entity_id, details)
  values (p_user_id, 'reverse_voucher', 'voucher', v_orig.id::text,
          jsonb_build_object('reversed_by', v_new.id, 'reason', p_reason));

  return v_new;
end $$;

-- ── Trial balance (saldolisti) ──────────────────────────────────────────────
-- Includes 'posted' and 'reversed' vouchers; a reversed voucher's own entries
-- remain and are netted out by its reversal voucher's entries.
create or replace view acc.trial_balance as
select a.account_number,
       a.name,
       a.account_type,
       coalesce(sum(le.debit),  0)                          as total_debit,
       coalesce(sum(le.credit), 0)                          as total_credit,
       coalesce(sum(le.debit), 0) - coalesce(sum(le.credit), 0) as balance
from acc.accounts a
left join acc.ledger_entries le on le.account_number = a.account_number
left join acc.vouchers v on v.id = le.voucher_id and v.status in ('posted','reversed')
group by a.account_number, a.name, a.account_type
order by a.account_number;
