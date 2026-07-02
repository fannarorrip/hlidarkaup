#!/usr/bin/env bash
# Nightly PostgreSQL backup for the Hlíðarkaup accounting DB (run on the Proxmox VM).
# Schedule with cron, e.g.:   0 2 * * *  /opt/hlidarkaup/deploy/backup.sh >> /var/log/hlidarkaup-backup.log 2>&1
#
# Bookkeeping records must be retained 7 years (Lög 145/1994 gr. 20). This keeps
# daily backups for KEEP_DAYS and a monthly archive long-term; pair with an
# OFFSITE copy and Proxmox vzdump of the whole VM.
set -euo pipefail

DB="${PGDATABASE:-hlidarkaup}"
OUT_DIR="${BACKUP_DIR:-/var/backups/hlidarkaup}"
ARCHIVE_DIR="${ARCHIVE_DIR:-$OUT_DIR/monthly}"
OFFSITE_DIR="${OFFSITE_DIR:-}"      # optional mounted offsite/USB/cloud path
KEEP_DAYS="${KEEP_DAYS:-35}"

STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT_DIR" "$ARCHIVE_DIR"
FILE="$OUT_DIR/hlidarkaup_${STAMP}.sql.gz"

pg_dump --no-owner --no-privileges "$DB" | gzip -9 > "$FILE"
echo "[$(date)] wrote $FILE ($(du -h "$FILE" | cut -f1))"

# Keep one archive per month, retained long-term
MONTH="$(date +%Y%m)"
[ -f "$ARCHIVE_DIR/hlidarkaup_${MONTH}.sql.gz" ] || cp "$FILE" "$ARCHIVE_DIR/hlidarkaup_${MONTH}.sql.gz"

# Daily retention
find "$OUT_DIR" -maxdepth 1 -name 'hlidarkaup_*.sql.gz' -mtime +"$KEEP_DAYS" -delete

# Offsite copy
if [ -n "$OFFSITE_DIR" ] && [ -d "$OFFSITE_DIR" ]; then
  cp "$FILE" "$OFFSITE_DIR/" && echo "[$(date)] offsite copy -> $OFFSITE_DIR"
else
  echo "[$(date)] WARNING: OFFSITE_DIR not set/mounted — backup is on-box only"
fi
