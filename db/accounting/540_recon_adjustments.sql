-- Þolmarkafærslur (endurskoðandakrafa, júlí 2026): þegar greiðsla og reikningur/krafa
-- munar 0–500 kr (innheimtukostnaður birgja/banka) bókast mismunurinn sjálfkrafa á
-- 6200 Vaxtagjöld og færslan er FLÖGGUÐ hér til yfirferðar í lok mánaðar.
create table if not exists acc.recon_adjustments (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid references acc.vouchers(id),
  source      text not null,              -- 'bank_bill' | 'payable' | annað síðar
  supplier_id uuid references acc.suppliers(id),
  amount      integer not null,           -- mismunur í kr (jákvætt = greitt umfram reikning)
  note        text,
  reviewed    boolean not null default false,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists recon_adjustments_unreviewed_ix
  on acc.recon_adjustments (created_at desc) where not reviewed;
