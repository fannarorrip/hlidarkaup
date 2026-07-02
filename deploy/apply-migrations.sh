#!/usr/bin/env bash
# Apply the accounting/catalog schema to a fresh PostgreSQL database, in order.
# Usage:  PGDATABASE=hlidarkaup ./deploy/apply-migrations.sh
set -euo pipefail

DB="${PGDATABASE:-hlidarkaup}"
DIR="$(cd "$(dirname "$0")/../db/accounting" && pwd)"

MIGRATIONS=(
  001_foundation
  002_posting_and_immutability
  003_seed
  010_chart_of_accounts
  020_products
  030_customers
  031_post_voucher_customer
  040_sale_lines
)

for m in "${MIGRATIONS[@]}"; do
  echo ">> applying $m.sql"
  PGCLIENTENCODING=UTF8 psql "$DB" -v ON_ERROR_STOP=1 -q -f "$DIR/$m.sql"
done

echo "All migrations applied to '$DB'."
