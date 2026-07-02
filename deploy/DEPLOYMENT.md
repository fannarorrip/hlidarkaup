# Hlíðarkaup — Deployment runbook (Rocky Linux)

Target architecture: **everything on-prem** on a dedicated Rocky Linux machine, reachable
from the internet through a **Cloudflare Tunnel** (no open inbound ports). PostgreSQL holds
the accounting + catalog data; the Next.js app serves the kassi, staffed till, web shop and
the back-office. Data stays on your premises. The machine itself is replaceable — the code
lives on GitHub and the data in nightly DB dumps, so a rebuild is: install Rocky, follow
this runbook, restore the dump.

```
            Internet ──► Cloudflare (DNS + TLS + CDN)
                              │  Cloudflare Tunnel (outbound only)
        ┌─────────────────────┴───────────────────────┐
        │ ROCKY LINUX (on-prem, bare metal)            │
        │   • PostgreSQL 16   (127.0.0.1:5432)         │
        │   • Next.js app     (systemd, port 3000)     │
        │   • cloudflared     (tunnel, systemd)        │
        │   nightly pg_dump → offsite                  │
        └──────────────────────────────────────────────┘
        Tills / staff browse via the Cloudflare hostname (or LAN, see §5).
```

## 1. Base system (Rocky Linux 9)
```bash
sudo dnf -y update
sudo dnf -y install git curl tar policycoreutils-python-utils
# Node 20 LTS (module stream; 22 works too):
sudo dnf -y module enable nodejs:20 && sudo dnf -y install nodejs
node -v
# Automatic security updates:
sudo dnf -y install dnf-automatic
sudo sed -i 's/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer
```
- **SELinux stays Enforcing** (default) — everything below works under it. If something is
  ever blocked, diagnose with `sudo ausearch -m avc -ts recent` — don't disable SELinux.
- **firewalld stays on** with only SSH open. The app needs **no inbound ports** (the tunnel
  is outbound-only). Note: `next start` listens on all interfaces — firewalld keeping :3000
  closed is what keeps it private.

## 2. PostgreSQL 16 (PGDG repo — Rocky's default stream is older)
```bash
sudo dnf -y install https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo dnf -qy module disable postgresql
sudo dnf -y install postgresql16-server
sudo /usr/pgsql-16/bin/postgresql-16-setup initdb
sudo systemctl enable --now postgresql-16

sudo -u postgres createuser --pwprompt hlidar
sudo -u postgres createdb -O hlidar -E UTF8 hlidarkaup
# apply schema (run from the repo, in order):
PGPASSWORD=… PGUSER=hlidar PGHOST=127.0.0.1 PGDATABASE=hlidarkaup ./deploy/apply-migrations.sh
```
Keep Postgres on `127.0.0.1:5432` (default). Never expose 5432. (Standard port ⇒ no
`semanage port` needed.)

## 3. The app (dedicated user + systemd)
```bash
sudo useradd --system --home /opt/hlidarkaup --shell /sbin/nologin hlidarkaup
sudo git clone https://github.com/fannarorrip/hlidarkaup.git /opt/hlidarkaup
cd /opt/hlidarkaup && sudo -u hlidarkaup npm ci
# .env.local (chmod 600, owner hlidarkaup) — see .env.example for every variable:
#   DATABASE_URL=postgres://hlidar:PASS@127.0.0.1:5432/hlidarkaup
#   NEXT_PUBLIC_BASE_URL=https://<your-domain>
#   KASSI_IGNORE_STOCK=   (remove/false for production)
#   + rotated secrets, ARION_* per deploy/ARION_ONBOARDING.md
sudo -u hlidarkaup npm run build
```
`/etc/systemd/system/hlidarkaup.service`:
```ini
[Unit]
Description=Hlidarkaup accounting + shop (Next.js)
After=network-online.target postgresql-16.service
Wants=network-online.target

[Service]
Type=simple
User=hlidarkaup
WorkingDirectory=/opt/hlidarkaup
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now hlidarkaup
```
Secrets that are FILES (Arion búnaðarskilríki `.pfx`) go in `/etc/hlidarkaup/`,
owner `hlidarkaup`, `chmod 600` — never inside the repo directory.

## 4. Import products + barcodes (one-time)
```bash
DATABASE_URL=… node scripts/import-products.js 1000   # or your curated count
DATABASE_URL=… node scripts/import-barcodes.js
```

## 5. Public access — Cloudflare Tunnel
```bash
curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | sudo tee /etc/yum.repos.d/cloudflared.repo
sudo dnf -y install cloudflared
cloudflared tunnel login
cloudflared tunnel create hlidarkaup
cloudflared tunnel route dns hlidarkaup hlidarkaup.is
# config.yml: ingress → service: http://127.0.0.1:3000
sudo cloudflared service install
```
HTTPS with **no inbound firewall ports opened**. The tunnel serves the PUBLIC surfaces only
(web shop, SVO GOTT, self-checkout APIs) — the back office is blocked from it, see §5b.

## 5b. Back office = LAN-only (accountant via VPN)
The bókhald and all admin surfaces are **never reachable from the internet**. Two layers:

1. **App enforcement** — set `ADMIN_LAN_ONLY=true` in `.env.local`. The middleware 404s every
   staff-gated route (bókhald, kassi/starf, admin APIs, even the staff login page) for requests
   that arrived through Cloudflare (they carry the edge-added `cf-ray` header, which a public
   client cannot remove). Direct LAN/VPN requests to `:3000` don't have it and pass normally.
2. **Tunnel enforcement (belt + suspenders)** — in the cloudflared `config.yml`, 404 the admin
   paths before the catch-all:
   ```yaml
   ingress:
     - hostname: hlidarkaup.is
       path: ^/(bokhald|starf|admin|kassi/starf|eldhus/admin|api/(auth/staff|staff|bankatenging|laun|skraning|afstemming|kassauppgjor|profjofnudur|rekstur|efnahagur|arsreikningur|vsk|hreyfingar|reikningur|suppliers|innkaup|purchases|customers|pantanir|einvoice|manaduppgjor|manadarreikningur|birgdaskyrsla)).*
       service: http_status:404
     - hostname: hlidarkaup.is
       service: http://127.0.0.1:3000
   ```

**In-store access** (tills, office PC): open the app port to the LAN —
`sudo firewall-cmd --permanent --add-port=3000/tcp && sudo firewall-cmd --reload` — and browse
`http://<lan-ip>:3000`. (Login over plain-HTTP LAN works: the session cookie sets `secure`
by actual protocol, not by NODE_ENV.)

**Remote access (accountant, you from home): VPN into the store.** Easiest: **Tailscale**
(WireGuard-based, no inbound ports, free tier is plenty):
```bash
sudo dnf -y config-manager --add-repo https://pkgs.tailscale.com/stable/rhel/9/tailscale.repo
sudo dnf -y install tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up
```
The accountant installs Tailscale, you **share the machine** with their account in the
Tailscale admin, and they browse `http://<tailscale-ip>:3000/bokhald` — then log in with
their own staff account (bokari role) as usual. Self-hosted alternative: plain **WireGuard**
on the box with one forwarded UDP port (51820) on the router — more manual, zero third parties.

## 6. Backups (legally required — 7-year retention)
No hypervisor snapshots on bare metal — the backup surface is exactly two things:
1. **The database** — nightly dump: cron `0 2 * * * /opt/hlidarkaup/deploy/backup.sh` with
   `OFFSITE_DIR` set to a mounted external disk or an rclone-synced cloud path. The dump
   includes the bókhald AND the stored fylgiskjöl/PDF documents (they live in the DB as bytea).
2. **`/etc/hlidarkaup` + `/opt/hlidarkaup/.env.local`** — secrets + cert; copy ENCRYPTED
   (e.g. `tar czf - /etc/hlidarkaup | gpg -c > secrets-$(date +%F).tgz.gpg`) whenever they change,
   stored separately from the DB dumps.

Everything else is rebuildable: code from GitHub, packages from this runbook.
**Test a restore at least once**: `gunzip -c backup.sql.gz | psql hlidarkaup_restore_test`.

Also add the app crons (same crontab):
```
0 2 * * *    /opt/hlidarkaup/deploy/backup.sh
*/15 * * * * curl -s -H "x-cron-secret: $EMAIL_POLL_SECRET" http://127.0.0.1:3000/api/cron/email-poll
```

## 7. Go-live checklist
- [ ] **Auth on** — staff login required for `/bokhald` and `/kassi/starf` (see §8).
- [ ] `KASSI_IGNORE_STOCK` removed (stock limits enforced).
- [ ] Secrets rotated (everything shared during development) and only on the box (`chmod 600`).
- [ ] `NEXT_PUBLIC_BASE_URL` + Kenni `KENNI_REDIRECT_URI` point at the production domain.
- [ ] Postgres bound to localhost; firewalld: SSH + LAN :3000 only; SELinux Enforcing.
- [ ] `ADMIN_LAN_ONLY=true` + cloudflared ingress 404 rules — verify `/bokhald` 404s via the public URL but works on LAN/VPN.
- [ ] VPN (Tailscale/WireGuard) tested with the accountant's account (bokari role).
- [ ] `dnf-automatic` security updates on.
- [ ] Nightly DB backup verified, offsite copy confirmed, **one restore tested**, secrets archive stored.
- [ ] Rgl. 505/2013 self-declaration reviewed with your accountant/endurskoðandi.

## 8. Authentication (built)
Staff routes (`/bokhald`, `/kassi/starf`, `/admin/*`, `/eldhus/admin`) and staff-only APIs are
protected **server-side** by `middleware.ts` using a signed httpOnly cookie (`lib/staff-session.ts`).

- **Login:** `/starf/login` → `POST /api/auth/staff/login`, which accepts either:
  1. `STAFF_PASSWORD` — a shared break-glass password (any email). Set a strong value.
  2. An existing **Supabase staff account** (email/password) — managed in `/bokhald/starfsmenn`.
- **Logout:** button in the back-office header → `POST /api/auth/staff/logout`.
- Set **`STAFF_SESSION_SECRET`** to a long random string in production.
- **Public, unprotected:** `/kassi` self-checkout, the web shop, SVO GOTT ordering, and
  `/api/kassi/{scan,search,bag,checkout}`, `/api/checkout`, `/api/products` (grid), `/api/eldhus/confirm`.

> Before go-live: set a strong `STAFF_PASSWORD` (or remove it for Supabase-only) and a random
> `STAFF_SESSION_SECRET`; verify staff accounts + roles in `/bokhald/starfsmenn`.
