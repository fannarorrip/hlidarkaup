#!/usr/bin/env bash
# Nightly PostgreSQL backup for the Hlíðarkaup accounting DB (run on the Rocky Linux server).
# Install once with:  sudo bash deploy/install-backup.sh   (sets up a systemd timer + encryption)
# Run by hand any time:  sudo bash deploy/backup.sh         (safe during trading — pg_dump never locks the tills)
#
# Bookkeeping records must be retained 7 years (Lög 145/1994 gr. 20). This keeps daily
# backups for KEEP_DAYS and a monthly archive long-term. Local dumps sit in a root-only
# directory on the owned server (cleartext, so a restore is trivial); anything copied
# OFFSITE is GPG-encrypted first, because the dumps contain customer kennitölur and a
# portable disk can be lost or stolen (persónuvernd / GDPR).
set -euo pipefail

# ---- DB credentials: reuse the app's own DATABASE_URL (from .env.local), exactly like
#      deploy/apply-migrations.sh — parsed into PG* env so the password never lands on a
#      command line. Falls back to any PG* already in the environment / trust auth.
ENV_FILE="${ENV_FILE:-/opt/hlidarkaup/.env.local}"
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  line="$(grep -E '^[[:space:]]*DATABASE_URL=' "$ENV_FILE" | head -1)"
  val="${line#*=}"; val="$(printf '%s' "$val" | tr -d '\r')"
  val="${val#\"}"; val="${val%\"}"; val="${val#\'}"; val="${val%\'}"
  DATABASE_URL="$val"
fi
case "${DATABASE_URL:-}" in
  postgres://*|postgresql://*)
    rest="${DATABASE_URL#*://}"
    if [ "${rest%%@*}" != "$rest" ]; then
      creds="${rest%%@*}"; rest="${rest#*@}"
      PGUSER="${creds%%:*}"; export PGUSER
      [ "${creds#*:}" != "$creds" ] && { PGPASSWORD="${creds#*:}"; export PGPASSWORD; }
    fi
    hostport="${rest%%/*}"; dbpart="${rest#*/}"
    PGDATABASE="${dbpart%%\?*}"; export PGDATABASE
    PGHOST="${hostport%%:*}"; export PGHOST
    [ "${hostport#*:}" != "$hostport" ] && { PGPORT="${hostport#*:}"; export PGPORT; }
    ;;
esac

DB="${PGDATABASE:-hlidarkaup}"; export PGDATABASE="$DB"
OUT_DIR="${BACKUP_DIR:-/var/backups/hlidarkaup}"
ARCHIVE_DIR="${ARCHIVE_DIR:-$OUT_DIR/monthly}"
OFFSITE_DIR="${OFFSITE_DIR:-}"                       # mounted external disk / cloud path
PASS_FILE="${BACKUP_PASS_FILE:-/etc/hlidarkaup/backup.pass}"  # root-only GPG passphrase for offsite
KEEP_DAYS="${KEEP_DAYS:-35}"

STAMP="$(date +%Y%m%d_%H%M%S)"
MONTH="$(date +%Y%m)"
mkdir -p "$OUT_DIR" "$ARCHIVE_DIR"
chmod 700 "$OUT_DIR" "$ARCHIVE_DIR"                  # kennitölur + secrets live here → root only
FILE="$OUT_DIR/hlidarkaup_${STAMP}.sql.gz"

# ---- The dump. pg_dump takes an MVCC snapshot — it does NOT lock writes, so the tills
#      keep selling straight through it. Safe to run at any time of day.
pg_dump --no-owner --no-privileges "$DB" | gzip -9 > "$FILE"
SIZE="$(du -h "$FILE" | cut -f1)"
echo "[$(date)] wrote $FILE ($SIZE)"

# ---- Secrets snapshot (.env.local): a root-only copy so an editing accident is one cp from recovery.
if [ -f "$ENV_FILE" ]; then
  ENV_BAK="$OUT_DIR/env_${STAMP}.local"
  install -m 600 "$ENV_FILE" "$ENV_BAK"
  find "$OUT_DIR" -maxdepth 1 -name 'env_*.local' -mtime +"$KEEP_DAYS" -delete
fi

# ---- Monthly archive kept long-term (7-year retention lives here — never auto-deleted).
[ -f "$ARCHIVE_DIR/hlidarkaup_${MONTH}.sql.gz" ] || cp "$FILE" "$ARCHIVE_DIR/hlidarkaup_${MONTH}.sql.gz"

# ---- Daily retention (local dailies only; monthly archive is exempt).
find "$OUT_DIR" -maxdepth 1 -name 'hlidarkaup_*.sql.gz' -mtime +"$KEEP_DAYS" -delete

# ---- Offsite copy — ENCRYPTED. The dumps contain customer kennitölur, so a copy that
#      leaves the premises must be unreadable if the disk is lost. No passphrase → refuse
#      (writing PII in cleartext to a portable disk is a privacy breach, not a backup).
if [ -n "$OFFSITE_DIR" ]; then
  if [ ! -d "$OFFSITE_DIR" ]; then
    echo "[$(date)] WARNING: OFFSITE_DIR=$OFFSITE_DIR not mounted — offsite copy SKIPPED (disk not plugged in?)"
  elif [ ! -r "$PASS_FILE" ]; then
    echo "[$(date)] WARNING: no passphrase at $PASS_FILE — offsite copy SKIPPED (run install-backup.sh to set encryption up; refusing to write kennitölur in cleartext)"
  elif ! command -v gpg >/dev/null 2>&1; then
    echo "[$(date)] WARNING: gpg not installed — offsite copy SKIPPED (dnf install -y gnupg2)"
  else
    OFF_MONTHLY="$OFFSITE_DIR/monthly"; mkdir -p "$OFF_MONTHLY"
    enc() { gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASS_FILE" -o "$2" "$1"; }
    enc "$FILE" "$OFFSITE_DIR/hlidarkaup_${STAMP}.sql.gz.gpg"
    [ -n "${ENV_BAK:-}" ] && enc "$ENV_BAK" "$OFFSITE_DIR/env_${STAMP}.local.gpg"
    [ -f "$OFF_MONTHLY/hlidarkaup_${MONTH}.sql.gz.gpg" ] || enc "$FILE" "$OFF_MONTHLY/hlidarkaup_${MONTH}.sql.gz.gpg"
    find "$OFFSITE_DIR" -maxdepth 1 -name 'hlidarkaup_*.sql.gz.gpg' -mtime +"$KEEP_DAYS" -delete
    find "$OFFSITE_DIR" -maxdepth 1 -name 'env_*.local.gpg'         -mtime +"$KEEP_DAYS" -delete
    echo "[$(date)] offsite copy (encrypted) -> $OFFSITE_DIR"
  fi
else
  echo "[$(date)] NOTE: OFFSITE_DIR not set — backup is ON-BOX ONLY (a fire/theft/disk failure would lose it). Plug in a USB drive and set OFFSITE_DIR to close this gap."
fi
