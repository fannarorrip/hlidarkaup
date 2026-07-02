# Hlíðarkaup — Deployment runbook (Proxmox)

Target architecture: **everything on-prem** on your Proxmox host, reachable from the
internet through a **Cloudflare Tunnel** (no open inbound ports). PostgreSQL holds the
accounting + catalog data; the Next.js app serves the kassi, staffed till, web shop and
the back-office. Data stays on your premises.

```
            Internet ──► Cloudflare (DNS + TLS + CDN)
                              │  Cloudflare Tunnel (outbound only)
        ┌─────────────────────┴───────────────────────┐
        │ PROXMOX (on-prem)                            │
        │  VM/LXC "hlidarkaup"                          │
        │   • PostgreSQL 16   (127.0.0.1:5432)         │
        │   • Next.js app     (127.0.0.1:3000)         │
        │   • cloudflared     (tunnel)                 │
        │  Proxmox vzdump + nightly pg_dump → offsite  │
        └──────────────────────────────────────────────┘
        Till / staff browse over the LAN; public shop via Cloudflare hostname.
```

## 1. Proxmox VM/LXC
- Create a VM or LXC (Debian 12 / Ubuntu 22.04+), 2 vCPU / 4 GB RAM / 40 GB disk is ample.
- `apt update && apt install -y postgresql git curl gnupg`
- Install Node 20+: use nodesource or `fnm`/`nvm`. Verify `node -v`.

## 2. PostgreSQL
```bash
sudo -u postgres createuser --pwprompt hlidar
sudo -u postgres createdb -O hlidar -E UTF8 hlidarkaup
# apply schema (run from the repo)
PGPASSWORD=… PGUSER=hlidar PGHOST=127.0.0.1 PGDATABASE=hlidarkaup ./deploy/apply-migrations.sh
```
Keep Postgres bound to `127.0.0.1` only (default). Never expose 5432 to the internet.

## 3. The app
```bash
git clone <repo> /opt/hlidarkaup && cd /opt/hlidarkaup
npm ci
# create .env.local (see .env.local on the old machine) and set:
#   DATABASE_URL=postgres://hlidar:PASS@127.0.0.1:5432/hlidarkaup
#   NEXT_PUBLIC_BASE_URL=https://<your-domain>
#   KASSI_IGNORE_STOCK=   (remove/false for production)
npm run build
# run with a process manager (pm2 or a systemd unit) on 127.0.0.1:3000
pm2 start "npm run start" --name hlidarkaup    # or a systemd service
```

## 4. Import products + barcodes (one-time / on the curated list)
```bash
DATABASE_URL=… node scripts/import-products.js 1000   # or your curated count
DATABASE_URL=… node scripts/import-barcodes.js
```

## 5. Public access — Cloudflare Tunnel
```bash
# install cloudflared, then:
cloudflared tunnel login
cloudflared tunnel create hlidarkaup
# route your hostname to the local app:
cloudflared tunnel route dns hlidarkaup hlidarkaup.is
# config.yml: ingress → service: http://127.0.0.1:3000
cloudflared service install
```
This publishes the app over HTTPS with **no inbound firewall ports opened**. Add
**Cloudflare Access** in front of `/bokhald` and `/kassi/starf` for an extra gate if desired.

## 6. Backups (legally required — 7-year retention)
- Nightly DB dump: cron `0 2 * * * /opt/hlidarkaup/deploy/backup.sh` with `OFFSITE_DIR` set
  to a mounted external/cloud path.
- Proxmox **vzdump** of the whole VM on a schedule (Datacenter → Backup), to a separate datastore.
- Test a restore at least once: `gunzip -c backup.sql.gz | psql hlidarkaup_restore_test`.

## 7. Go-live checklist
- [ ] **Auth on** — staff login required for `/bokhald` and `/kassi/starf` (see §8).
- [ ] `KASSI_IGNORE_STOCK` removed (stock limits enforced).
- [ ] Secrets rotated (the ones shared during development) and only in `.env.local` on the box.
- [ ] `NEXT_PUBLIC_BASE_URL` + Kenni `KENNI_REDIRECT_URI` point at the production domain.
- [ ] Postgres bound to localhost; only the Cloudflare Tunnel is public.
- [ ] Nightly DB backup + Proxmox vzdump verified, offsite copy confirmed, one restore tested.
- [ ] Rgl. 505/2013 self-declaration reviewed with your accountant/endurskoðandi.

## 8. Authentication (built)
Staff routes (`/bokhald`, `/kassi/starf`, `/admin/*`) and staff-only mutating APIs are
protected **server-side** by `middleware.ts` using a signed httpOnly cookie (`lib/staff-session.ts`).

- **Login:** `/starf/login` → `POST /api/auth/staff/login`, which accepts either:
  1. `STAFF_PASSWORD` — a shared break-glass password (any email). Set a strong value.
  2. An existing **Supabase staff account** (email/password) — created via `/eldhus/admin`.
- **Logout:** button in the back-office sidebar → `POST /api/auth/staff/logout`.
- Set **`STAFF_SESSION_SECRET`** to a long random string in production (it signs the cookie;
  must be identical for middleware + the login route, i.e. one value in `.env.local`).
- **Public, unprotected:** `/kassi` self-checkout, the web shop, and
  `/api/kassi/{scan,search,bag,checkout}`, `/api/checkout`, `/api/products` (grid).
- Optional extra gate: put **Cloudflare Access** in front of `/bokhald` and `/kassi/starf`.

> Before go-live: set a strong `STAFF_PASSWORD` (or remove it for Supabase-only) and a random
> `STAFF_SESSION_SECRET`; create real staff accounts in `/eldhus/admin`.
