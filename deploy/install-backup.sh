#!/usr/bin/env bash
# One-time setup for automated, encrypted Hlíðarkaup backups. Run once, with sudo:
#     sudo bash /opt/hlidarkaup/deploy/install-backup.sh
#
# Idempotent — safe to re-run. It does NOT touch the hlidarkaup web service, so the tills
# keep running throughout (the only DB work is a pg_dump, which never locks writes).
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Please run with sudo."; exit 1; }

REPO="/opt/hlidarkaup"
ETC="/etc/hlidarkaup"
PASS_FILE="$ETC/backup.pass"
ENV_OUT="$ETC/backup.env"

echo "== 1/5  Ensuring gpg is available (for encrypting offsite copies)"
command -v gpg >/dev/null 2>&1 || dnf install -y gnupg2

echo "== 2/5  Backup passphrase (encrypts every copy that leaves the building)"
mkdir -p "$ETC"; chmod 700 "$ETC"
if [ -s "$PASS_FILE" ]; then
  echo "   Passphrase already set at $PASS_FILE — keeping it."
else
  head -c 33 /dev/urandom | base64 > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  echo
  echo "   ┌───────────────────────────────────────────────────────────────────┐"
  echo "   │  SAVE THIS PASSPHRASE IN YOUR PASSWORD MANAGER NOW.                 │"
  echo "   │  Without it the ENCRYPTED OFFSITE backups cannot be restored — even │"
  echo "   │  by you. It is stored on this server too, but if the server dies    │"
  echo "   │  the USB copy is useless without this string:                       │"
  echo "   └───────────────────────────────────────────────────────────────────┘"
  echo "        $(cat "$PASS_FILE")"
  echo
  echo "   (Shown once. Copy it somewhere safe before continuing.)"
fi

echo "== 3/5  Offsite target"
if [ ! -f "$ENV_OUT" ]; then
  cat > "$ENV_OUT" <<'EOF'
# Set OFFSITE_DIR to a mounted external disk (or cloud-sync path) to keep a second,
# encrypted copy off the server. Leave commented until the USB drive is mounted.
# Example (after adding the USB to /etc/fstab as /mnt/backup-usb):
#OFFSITE_DIR=/mnt/backup-usb/hlidarkaup
EOF
  chmod 600 "$ENV_OUT"
fi
if grep -q '^OFFSITE_DIR=' "$ENV_OUT"; then
  echo "   OFFSITE_DIR is set: $(grep '^OFFSITE_DIR=' "$ENV_OUT")"
else
  echo "   OFFSITE_DIR not set yet — backups will be on-box only for now."
  echo "   Detected removable disks you could use:"
  lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT,LABEL,TRAN 2>/dev/null | grep -i 'usb\|/run/media\|/mnt' || echo "     (none detected — plug in the USB drive, then see step 5)"
fi

echo "== 4/5  Installing the nightly systemd timer (02:00, catches up if the box was off)"
install -m 644 "$REPO/deploy/hlidarkaup-backup.service" /etc/systemd/system/hlidarkaup-backup.service
install -m 644 "$REPO/deploy/hlidarkaup-backup.timer"   /etc/systemd/system/hlidarkaup-backup.timer
systemctl daemon-reload
systemctl enable --now hlidarkaup-backup.timer
echo "   Timer active. Next run:"
systemctl list-timers hlidarkaup-backup.timer --no-pager | sed -n '1,2p'

echo "== 5/5  Taking the FIRST backup now + validating it"
bash "$REPO/deploy/backup.sh"
NEWEST="$(ls -t /var/backups/hlidarkaup/hlidarkaup_*.sql.gz 2>/dev/null | head -1)"
if [ -z "$NEWEST" ]; then echo "   ✗ No dump was produced — check the output above."; exit 1; fi
echo "   Validating $NEWEST ..."
gunzip -t "$NEWEST"                                                     # gzip integrity
COMPLETE="$(gunzip -c "$NEWEST" | grep -c 'PostgreSQL database dump complete' || true)"
HASDATA="$(gunzip -c "$NEWEST" | grep -Ec 'shop\.sale_lines|shop\.products|acc\.' || true)"
if [ "${COMPLETE:-0}" -ge 1 ] && [ "${HASDATA:-0}" -ge 1 ]; then
  echo "   ✓ Dump is complete and contains real accounting data."
else
  echo "   ✗ Dump looks incomplete (complete=$COMPLETE data=$HASDATA) — do NOT rely on it; check DB credentials in .env.local."
  exit 1
fi

echo
echo "════════════════════════════════════════════════════════════════════════"
echo " DONE. Nightly encrypted backups are now automatic."
echo "   • Local dumps:   /var/backups/hlidarkaup/         (35 days of dailies)"
echo "   • Monthly kept:  /var/backups/hlidarkaup/monthly/ (long-term, 7 years)"
echo "   • Schedule:      systemctl list-timers hlidarkaup-backup.timer"
echo "   • Logs:          journalctl -u hlidarkaup-backup"
echo
echo " STILL TO DO — offsite copy (survives fire/theft), when you have a USB drive:"
echo "   1) Plug it in, then find it:   lsblk -o NAME,SIZE,FSTYPE,LABEL,UUID"
echo "   2) Mount it permanently, e.g.:"
echo "        sudo mkdir -p /mnt/backup-usb"
echo "        echo 'UUID=<uuid>  /mnt/backup-usb  <fstype>  defaults,nofail  0 2' | sudo tee -a /etc/fstab"
echo "        sudo mount -a"
echo "   3) Point backups at it:"
echo "        echo 'OFFSITE_DIR=/mnt/backup-usb/hlidarkaup' | sudo tee -a /etc/hlidarkaup/backup.env"
echo "   4) Test:  sudo systemctl start hlidarkaup-backup  &&  ls -lh /mnt/backup-usb/hlidarkaup"
echo "   Offsite copies are GPG-encrypted automatically (kennitölur must not sit in cleartext on a portable disk)."
echo "════════════════════════════════════════════════════════════════════════"
