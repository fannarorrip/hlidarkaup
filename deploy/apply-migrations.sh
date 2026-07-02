#!/usr/bin/env bash
# Apply the accounting/catalog migrations (db/accounting/*.sql) in numeric order.
# Applied files are tracked in public._migrations, so re-running only applies NEW files —
# safe on a fresh database AND as part of every app update (deploy/update.sh).
#
# Fresh DB:      PGDATABASE=hlidarkaup ./deploy/apply-migrations.sh
# EXISTING DB that predates the tracking table (e.g. the dev machine): baseline it ONCE first —
#                BASELINE=1 PGDATABASE=hlidarkaup ./deploy/apply-migrations.sh
#                (records every current file as applied WITHOUT running anything)
set -euo pipefail

DB="${PGDATABASE:-hlidarkaup}"
DIR="$(cd "$(dirname "$0")/../db/accounting" && pwd)"

psql "$DB" -q -v ON_ERROR_STOP=1 -c \
  "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now());"

applied=0
for f in $(ls "$DIR"/*.sql | sort); do
  name="$(basename "$f")"
  seen=$(psql "$DB" -tAq -c "select 1 from public._migrations where name = '$name'")
  if [ "$seen" = "1" ]; then continue; fi
  if [ "${BASELINE:-}" = "1" ]; then
    psql "$DB" -q -v ON_ERROR_STOP=1 -c "insert into public._migrations (name) values ('$name')"
    echo "== baselined $name (marked applied, not run)"
  else
    echo ">> applying $name"
    PGCLIENTENCODING=UTF8 psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
    psql "$DB" -q -v ON_ERROR_STOP=1 -c "insert into public._migrations (name) values ('$name')"
  fi
  applied=$((applied+1))
done

echo "Done — $applied file(s) $( [ "${BASELINE:-}" = "1" ] && echo baselined || echo applied ) on '$DB'."
