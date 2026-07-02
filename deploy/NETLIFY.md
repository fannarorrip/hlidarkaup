# Deploying Hlíðarkaup (webshop + kassi + eldhús + bókhald) to Netlify

## Can we deploy to Netlify?
**Yes — the app is already wired for it.** `netlify.toml` builds via `@netlify/plugin-nextjs`,
order storage already uses Netlify Blobs in production (`lib/order-store.ts`), and the storefront
is live at `hlidarkaup.netlify.app`. The plugin turns Next 16 route handlers into serverless
functions and runs `middleware.ts` at the edge. So the whole app — including the bókhald — can run
on Netlify. The **data still lives on your Proxmox Postgres**; only the app runs on Netlify.

### 4 caveats to handle for the bókhald (the rest "just works")

1. **Postgres must be reachable from Netlify.** The app connects directly via `DATABASE_URL`
   (a `pg` Pool). Netlify functions run in AWS Lambda, so they need a route to your on-prem
   Postgres — a **Cloudflare Tunnel (TCP)** to the DB, and `DATABASE_URL` pointed at that hostname.
   Keep the pool small (serverless opens a pool per warm function); add **PgBouncer** later if you
   ever see connection pressure. For a single small store this is fine. (Data residency is
   preserved: the books stay on Proxmox.)

2. **Cron — use Netlify Scheduled Functions.** `/api/cron/email-poll` (M365 invoice polling) and
   the inExchange poll are built for an external scheduler. On Netlify, add **Scheduled Functions**
   that call those endpoints (with their secret headers), or keep a cron on the Proxmox box hitting
   the Netlify URLs. `netlify.toml` has none configured yet — ask me and I'll add them.

3. **Two file reads in serverless.**
   - PDF logo: `lib/pdf/*.ts` read `public/logo.png` from disk. If the plugin doesn't bundle it,
     PDFs **still generate** (the code falls back to the store name as text) — just test it and, if
     the logo is missing, we'll bundle it / base64-embed it.
   - **Arion `.pfx` cert (`ARION_CERT_PATH`)**: a file path will **not** exist on Netlify. To use
     Arion B2B from Netlify the cert must be base64'd into an env var and written to `/tmp` at
     runtime (small code change). Arion is on hold, so not urgent.

4. **Local-hardware features stay local.** Cash-drawer kick, the LAN card terminal IP, and UniFi
   door control talk to devices on your shop LAN. They won't reach those from Netlify unless the
   device is exposed via a tunnel. The Adyen **cloud** terminal API works fine from Netlify; the
   LAN-IP terminal vars do not. (See the "Do NOT set" list below.)

### Deploy steps
1. Connect the GitHub repo to the Netlify site (already done for the storefront).
2. Set the environment variables below (see "How to set them" — do **not** import dev values blindly).
3. Stand up the Cloudflare Tunnel to Postgres; set the prod `DATABASE_URL`.
4. Trigger a deploy; run the `db/accounting/*.sql` migrations against the prod DB once.
5. Add Scheduled Functions for the pollers.
6. Smoke-test: log in at `/starf`, open `/bokhald`, generate a PDF, ring up a kassi sale.

---

## Environment variables — the complete checklist

Legend:  **REQ** = required ·  **PUB** = `NEXT_PUBLIC_*`, baked in at *build* time ·
**PROD** = use a *production* value, not the dev one ·  **ROTATE** = was exposed (chat/git) — generate a
fresh value before prod ·  **SKIP** = don't set on Netlify.

### Core (required)
| Key | Notes |
|---|---|
| `DATABASE_URL` | **REQ · PROD** — Cloudflare-tunnel URL to the Proxmox Postgres (dev is `127.0.0.1:5455`). |
| `STAFF_SESSION_SECRET` | **REQ · ROTATE** — HMAC key signing staff cookies. Generate fresh (`openssl rand -hex 32`). |
| `STAFF_PASSWORD` | break-glass staff login. **ROTATE** — set a fresh strong value (or rely on Supabase staff accounts). |

### Public (build-time; exposed to the browser)
| Key | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | **PUB · PROD** — `https://<your-netlify-or-custom-domain>`. |
| `NEXT_PUBLIC_BASE_URL` | **PUB · PROD** — same as above (used for absolute links). |
| `NEXT_PUBLIC_SUPABASE_URL` | **PUB** — Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **PUB** — Supabase anon key (public by design). |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **PUB** — eldhús delivery address autocomplete. Restrict to your domain. |
| `NEXT_PUBLIC_ERECEIPT_ENABLED` | **PUB** — optional flag (`true`/unset). |

### Supabase (eldhús menu/orders + staff accounts)
| Key | Notes |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **ROTATE** — server-side admin key (also fallback for the session secret). Was pasted in chat → rotate. |

### AI invoice/statement reader (Skráning · Pósthólf)
| Key | Notes |
|---|---|
| `ANTHROPIC_API_KEY` | **ROTATE** — Claude API key. |
| `SKRANING_MODEL` | optional — defaults to a Sonnet model. |

### Email — Resend (kvittanir, reikningar, pantanir, skil)
| Key | Notes |
|---|---|
| `RESEND_API_KEY` | Resend API key. |
| `RECEIPT_FROM` | verified sender, e.g. `Hlíðarkaup <...>`. |

### Microsoft 365 mailbox polling (Pósthólf)
| Key | Notes |
|---|---|
| `MS_TENANT_ID` · `MS_CLIENT_ID` | Azure app registration. |
| `MS_CLIENT_SECRET` | **ROTATE** — app secret (expires ≤24mo). |
| `MS_MAILBOX` | the scoped mailbox, e.g. `bokhald@hlidarkaup.is`. |
| `EMAIL_POLL_SECRET` | **ROTATE** — shared secret for `/api/cron/email-poll`. Set fresh; use it in the Scheduled Function. |

### inExchange (rafrænir reikningar)
| Key | Notes |
|---|---|
| `INEXCHANGE_RECEIVE_URL` · `INEXCHANGE_USERNAME` · `INEXCHANGE_RECEIVER_ID` | receive config. |
| `INEXCHANGE_PASSWORD` | **ROTATE**. |
| `INEXCHANGE_STANDARD` · `INEXCHANGE_TRANSACTION_TYPE` · `INEXCHANGE_ACK_STATUS` | optional defaults. |
| `INEXCHANGE_WEBHOOK_SECRET` | **ROTATE** — gate for the inbound webhook. |
| `INEXCHANGE_SEND_URL` · `INEXCHANGE_SUBACCOUNT` | send config. |
| `INEXCHANGE_SEND_ENABLED` | `false` until you're ready to transmit live (no sandbox exists). |

### Arion B2B (on hold — see caveat #3)
| Key | Notes |
|---|---|
| `ARION_USERNAME` · `ARION_PASSWORD` · `ARION_SUBSCRIPTION_KEY` · `ARION_CERT_PASSWORD` | bank creds. |
| `ARION_CERT_PATH` | ⚠️ **won't work on Netlify as a path** — needs base64-in-env + write-to-`/tmp`. |
| `ARION_BASE_URL` · `ARION_TOKEN_URL` · `ARION_SCOPE` · `ARION_SANDBOX` · `ARION_CLAIMS_ENABLED` | optional/feature flags. |

### Adyen / Straumur cloud card terminal
| Key | Notes |
|---|---|
| `ADYEN_API_KEY` | **ROTATE** — Adyen web-service key. |
| `ADYEN_POI_ID` · `ADYEN_MERCHANT_ACCOUNT` · `ADYEN_TERMINAL_ENV` · `ADYEN_LIVE_URL_PREFIX` · `ADYEN_SALE_ID` | terminal/cloud config. |

### Kenni OIDC (sjálfsali aldursstaðfesting)
| Key | Notes |
|---|---|
| `KENNI_ISSUER` · `KENNI_CLIENT_ID` | OIDC config. |
| `KENNI_CLIENT_SECRET` | **ROTATE**. |
| `KENNI_REDIRECT_URI` | **PROD** — the prod callback URL (register it with Kenni). |
| `SJALFSALI_MIN_AGE` | optional, default age gate. |

### Kassi (optional account/behaviour overrides)
`KASSI_CARD_ACCOUNT` · `KASSI_CASH_ACCOUNT` · `KASSI_TRANSFER_ACCOUNT` · `KASSI_BAG_PRODUCT` ·
`KASSI_IGNORE_STOCK` — all optional; sensible defaults in code.

### Do NOT set on Netlify (LAN / on-prem only)
- `DRAWER_KICK_URL` — cash-drawer kick via a local print agent (shop LAN).
- `STRAUMUR_TERMINAL_IP` · `STRAUMUR_TERMINAL_PORT` — direct LAN terminal (cloud uses Adyen instead).
- `MAC_LOCAL_IP` — local dev artifact.
- `UNIFI_HOST` · `UNIFI_API_TOKEN` · `UNIFI_CONSOLE_HOST` · `UNIFI_USERNAME` · `UNIFI_PASSWORD` ·
  `UNIFI_ACCESS_GROUP_ID` — door control; only set if the UniFi console is reachable from Netlify
  via a tunnel, otherwise keep door control on-prem.

### Skip (dead — not referenced in code anymore)
- `REGLA_BASE_URL` · `REGLA_USERNAME` · `REGLA_PASSWORD` · `REGLA_WEB_CUSTOMER_KENNITALA` (Regla was cut out).
- `PRODUCT_API_URL` · `PRODUCT_API_KEY` (no `process.env` reference).
- `TEYA_API_KEY` · `TEYA_MERCHANT_ID` · `TEYA_SECRET` (no `process.env` reference — Teya isn't wired in code).

---

## How to set them (without leaking secrets)
- **Easiest:** Netlify UI → Site configuration → Environment variables → **Import from a .env file**,
  or CLI `netlify env:import .env.local`. ⚠️ **But** that imports your *dev* values — afterwards you
  MUST fix every **PROD** row (DATABASE_URL, NEXT_PUBLIC_SITE_URL/BASE_URL, KENNI_REDIRECT_URI),
  set fresh **ROTATE** values, and delete the **SKIP** / **Do-NOT-set** keys.
- Mark genuine secrets as **"Secret"** scope in Netlify so they're write-only.
- `NEXT_PUBLIC_*` are read at **build** time — set them before triggering the build.
- After changing build-time vars, trigger a fresh deploy.
