-- Claims per the official Arion Claims API reference (July 2026, confirmed by Arion):
-- creating a claim needs a composite claimKey — claimant kennitala + a 12-digit claim account
-- (4-digit bank/útibú + ledger '66' + 6-digit claim number) — plus REQUIRED finalDueDate and
-- expirationDate. The bank/útibú comes from the innheimtusamningur; the date offsets are policy.
set search_path = acc, public;

alter table acc.collection_settings
  add column if not exists claim_bank text,                            -- 4-digit útibú (innheimtusamningur)
  add column if not exists final_due_days int not null default 0,      -- eindagi = gjalddagi + N dagar
  add column if not exists expires_after_days int not null default 90; -- lokadagur = gjalddagi + N dagar
