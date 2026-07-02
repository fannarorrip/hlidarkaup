-- Innheimtuþjónustur: the collection agreement + one-or-more kröfusnið (innheimtuauðkenni) that
-- every bank claim references. Each profile points at a settlement/ráðstöfunarreikningur (and the
-- matching bank lykill in our chart) and carries the default rules Arion/RB apply per claim.
-- Also extends acc.claims with the payment-back link (voucher that settles the receivable).
set search_path = acc, public;

create table if not exists acc.collection_profiles (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null,            -- innheimtuauðkenni / kröfusnið (assigned by Arion)
  name                  text not null,
  settlement_iban       text,                     -- ráðstöfunarreikningur payments land in (IBAN/acct)
  settlement_ledger     text references acc.accounts(account_number),  -- our bank lykill (e.g. 7830)
  claim_type            text not null default 'krafa'
                          check (claim_type in ('krafa','valgreidsla')),
  interest_rule         text,                     -- dráttarvaxtaregla (code/free text)
  notify_fee_paper      numeric(18,2) not null default 0,  -- tilkynninga-/greiðslugjald, pappír
  notify_fee_paperless  numeric(18,2) not null default 0,  -- rafrænt
  late_fee              numeric(18,2) not null default 0,  -- vanskilagjald
  dunning               boolean not null default false,    -- ítrekanir
  dunning_count         int not null default 0,
  to_collection_days    int,                      -- senda í milliinnheimtu eftir N daga (null=aldrei)
  print_mode            text not null default 'rb'
                          check (print_mode in ('self','rb','electronic')),
  is_default            boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);
-- At most one default profile.
create unique index if not exists collection_profiles_one_default
  on acc.collection_profiles ((true)) where is_default;

-- Single-row agreement status (the innheimtusamningur).
create table if not exists acc.collection_settings (
  id                    int primary key default 1 check (id = 1),
  kennitala_krofuhafa   text,                     -- our kt as kröfuhafi
  agreement_signed      boolean not null default false,
  agreement_note        text,
  updated_at            timestamptz not null default now()
);
insert into acc.collection_settings (id) values (1) on conflict do nothing;

-- Payment-back link on claims: the receipt voucher that clears the receivable when the claim is paid.
alter table acc.claims add column if not exists payment_voucher_id uuid references acc.vouchers(id);
alter table acc.claims add column if not exists paid_at timestamptz;
alter table acc.claims add column if not exists profile_id uuid references acc.collection_profiles(id);
