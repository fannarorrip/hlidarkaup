#!/usr/bin/env bash
# Update the Hlíðarkaup app on the server to the latest code from GitHub:
#   pull → install deps → build → apply new migrations → restart the service.
# Run with sudo:  sudo PGPASSWORD=… ./deploy/update.sh
# Takes ~1–2 minutes; the app is briefly unavailable during the restart (seconds).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/hlidarkaup}"
cd "$APP_DIR"

echo "== pulling latest code"
sudo -u hlidarkaup git pull --ff-only

echo "== installing dependencies"
sudo -u hlidarkaup npm ci

echo "== building"
sudo -u hlidarkaup npm run build

echo "== applying new migrations (if any)"
# Run via bash so a lost executable bit (e.g. after a Windows-side commit) can't break the deploy.
PGUSER="${PGUSER:-hlidar}" PGHOST="${PGHOST:-127.0.0.1}" PGDATABASE="${PGDATABASE:-hlidarkaup}" \
  bash "$APP_DIR/deploy/apply-migrations.sh"

echo "== restarting"
systemctl restart hlidarkaup
sleep 3
systemctl is-active --quiet hlidarkaup && echo "✓ hlidarkaup running" || { echo "✗ service NOT running — check: journalctl -u hlidarkaup -n 50"; exit 1; }
