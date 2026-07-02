// Server-side PSD2 consent registry (acc.psd2_consents). Consents used to live only in browser
// localStorage — dead on any other device and invisible to server jobs. Every created consent is
// recorded here; routes fall back to the newest usable one when the client doesn't send an id.
import { query } from "@/lib/db";

export interface StoredConsent { consent_id: string; status: string; valid_until: string | null; created_at: string }

export async function storeConsent(consentId: string, validUntil?: string | null): Promise<void> {
  if (!consentId) return;
  await query(
    `insert into acc.psd2_consents (consent_id, valid_until) values ($1, $2::date)
     on conflict (consent_id) do nothing`, [consentId, validUntil || null]).catch(() => {});
}

export async function updateConsentStatus(consentId: string, status: string): Promise<void> {
  if (!consentId || !status) return;
  await query(
    `update acc.psd2_consents set status=$2, last_used_at=now() where consent_id=$1`,
    [consentId, status.toLowerCase()]).catch(() => {});
}

/** Newest consent that isn't known-dead (used when the client doesn't supply one). */
export async function getLatestConsent(): Promise<StoredConsent | null> {
  const r = await query<StoredConsent>(
    `select consent_id, status, valid_until::text as valid_until, created_at::text as created_at
     from acc.psd2_consents
     where status not in ('rejected','expired','revoked')
       and (valid_until is null or valid_until >= current_date)
     order by created_at desc limit 1`).catch(() => [] as StoredConsent[]);
  return r[0] ?? null;
}
