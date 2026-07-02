# Hlíðarkaup — Accounting system (bókhald)

Self-built double-entry accounting system replacing Regla. Runs on **PostgreSQL** (self-hosted on the on-prem Rocky Linux server).

## Design principles (Icelandic compliance)

| Rule | Source | How it's enforced |
|---|---|---|
| Double-entry, every voucher balances (Σ debit = Σ credit) | Lög 145/1994 gr. 2 | `acc.post_voucher()` rejects unbalanced vouchers |
| Sequential, **gap-free** numbering per document series | Rgl. 50/1993 gr. 4 | `acc.voucher_series` counter, assigned in-transaction |
| **Immutable** posted records — no edit/delete; correct via reversal | Lög 145/1994 gr. 21 | Triggers block UPDATE/DELETE; `acc.reverse_voucher()` |
| Two-way audit trail (source doc ↔ entry), user + time + ref per entry | Lög 145/1994 gr. 7; Rgl. 505/2013 | `acc.audit_log`, `posted_by`/`posted_at`, voucher↔entry FKs |
| Four VAT control accounts (útskattur/innskattur/uppgjör/bið) | Rgl. 50/1993 gr. 24 | Seeded in `003_seed.sql` (placeholders → replace from Regla export) |
| ISK + Icelandic | Lög 145/1994 gr. 10A/25 | `numeric(18,2)`; Icelandic naming |
| 7-year retention | Lög 145/1994 gr. 20 | Operational: nightly `pg_dump` offsite |

## Files (apply in order)

1. `001_foundation.sql` — schema (`acc`): accounts, vat_codes, voucher_series, periods, vouchers, ledger_entries, audit_log
2. `002_posting_and_immutability.sql` — `post_voucher()`, `reverse_voucher()`, immutability triggers, `trial_balance` view
3. `003_seed.sql` — VAT codes (24/11/0), numbering series, the four VAT control accounts (placeholders)

## Apply

```bash
psql "$DATABASE_URL" -f 001_foundation.sql
psql "$DATABASE_URL" -f 002_posting_and_immutability.sql
psql "$DATABASE_URL" -f 003_seed.sql
```

## Core API (everything posts through these — never INSERT into the ledger directly)

- `acc.post_voucher(series, date, type, description, reference, user_id, lines_jsonb)` → posts a balanced voucher atomically, returns it.
- `acc.reverse_voucher(voucher_id, user_id, reason)` → creates the offsetting reversal (the only legal "correction").
- `acc.trial_balance` → debit/credit/balance per account.

> **Not yet built:** products migration, sales/invoicing, till/kassi, purchases, VAT report, financial statements. This is the foundation only.
