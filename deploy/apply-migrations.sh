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

# Reuse the app's OWN DATABASE_URL (from .env.local) so migrations authenticate exactly like the
# running app — no separate PGPASSWORD to type or keep in sync. The URL is parsed into PG* env vars
# (rather than handed to psql as a connection string) so the password never lands on a command line
# and psql is always invoked the same simple way. Falls back to existing PG* / trust auth if unset.
if [ -z "${DATABASE_URL:-}" ]; then
  ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
  if [ -f "$ENV_FILE" ]; then
    line="$(grep -E '^[[:space:]]*DATABASE_URL=' "$ENV_FILE" | head -1)"
    val="${line#*=}"; val="$(printf '%s' "$val" | tr -d '\r')"           # drop key + any CR
    val="${val#\"}"; val="${val%\"}"; val="${val#\'}"; val="${val%\'}"   # strip surrounding quotes
    DATABASE_URL="$val"
  fi
fi
case "${DATABASE_URL:-}" in
  postgres://*|postgresql://*)
    rest="${DATABASE_URL#*://}"                        # user[:pass]@host[:port]/db[?params]
    if [ "${rest%%@*}" != "$rest" ]; then              # credentials present
      creds="${rest%%@*}"; rest="${rest#*@}"
      PGUSER="${creds%%:*}"; export PGUSER
      [ "${creds#*:}" != "$creds" ] && { PGPASSWORD="${creds#*:}"; export PGPASSWORD; }
    fi
    hostport="${rest%%/*}"; dbpart="${rest#*/}"
    PGDATABASE="${dbpart%%\?*}"; export PGDATABASE      # ?query params (e.g. sslmode) are dropped
    PGHOST="${hostport%%:*}"; export PGHOST
    [ "${hostport#*:}" != "$hostport" ] && { PGPORT="${hostport#*:}"; export PGPORT; }
    DB="$PGDATABASE"
    ;;
esac
export PGDATABASE="$DB"   # every psql below connects via PG* env — no dbname positional, so option
                          # order can't trip a non-permuting getopt (portable Linux + Windows)

psql -q -v ON_ERROR_STOP=1 -c \
  "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now());"

applied=0
for f in $(ls "$DIR"/*.sql | sort); do
  name="$(basename "$f")"
  seen=$(psql -tAq -c "select 1 from public._migrations where name = '$name'")
  if [ "$seen" = "1" ]; then continue; fi
  if [ "${BASELINE:-}" = "1" ]; then
    psql -q -v ON_ERROR_STOP=1 -c "insert into public._migrations (name) values ('$name')"
    echo "== baselined $name (marked applied, not run)"
  else
    echo ">> applying $name"
    PGCLIENTENCODING=UTF8 psql -v ON_ERROR_STOP=1 -q -f "$f"
    psql -q -v ON_ERROR_STOP=1 -c "insert into public._migrations (name) values ('$name')"
  fi
  applied=$((applied+1))
done

echo "Done — $applied file(s) $( [ "${BASELINE:-}" = "1" ] && echo baselined || echo applied ) on '$DB'."
