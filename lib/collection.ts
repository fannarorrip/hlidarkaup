// Innheimtuþjónustur: manage the collection agreement + kröfusnið (collection profiles) that
// bank claims reference. Pure data layer over acc.collection_profiles / acc.collection_settings.
import { db, query } from "@/lib/db";

// Thrown for user-facing validation problems (safe to surface); anything else is an internal error.
export class CollectionValidationError extends Error {}

export interface CollectionProfile {
  id: string; code: string; name: string; settlement_iban: string | null; settlement_ledger: string | null;
  claim_type: string; interest_rule: string | null; notify_fee_paper: number; notify_fee_paperless: number;
  late_fee: number; dunning: boolean; dunning_count: number; to_collection_days: number | null;
  print_mode: string; is_default: boolean; is_active: boolean;
}

export interface CollectionSettings {
  kennitala_krofuhafa: string | null; agreement_signed: boolean; agreement_note: string | null;
  claim_bank: string | null;        // 4-digit útibú for the 12-digit claim account (innheimtusamningur)
  final_due_days: number;           // eindagi = gjalddagi + N dagar
  expires_after_days: number;       // lokadagur (expirationDate) = gjalddagi + N dagar
}

export const getCollectionProfiles = () =>
  query<CollectionProfile>(
    `select id, code, name, settlement_iban, settlement_ledger, claim_type, interest_rule,
            notify_fee_paper::float8 as notify_fee_paper, notify_fee_paperless::float8 as notify_fee_paperless,
            late_fee::float8 as late_fee, dunning, dunning_count, to_collection_days, print_mode, is_default, is_active
     from acc.collection_profiles order by is_default desc, is_active desc, name`);

export const getDefaultProfile = async () =>
  (await query<CollectionProfile>(
    `select id, code, name, settlement_iban, settlement_ledger, claim_type, interest_rule,
            notify_fee_paper::float8 as notify_fee_paper, notify_fee_paperless::float8 as notify_fee_paperless,
            late_fee::float8 as late_fee, dunning, dunning_count, to_collection_days, print_mode, is_default, is_active
     from acc.collection_profiles where is_active and is_default limit 1`))[0] ?? null;

export async function getCollectionSettings(): Promise<CollectionSettings> {
  const r = await query<CollectionSettings>(
    `select kennitala_krofuhafa, agreement_signed, agreement_note,
            claim_bank, final_due_days, expires_after_days
       from acc.collection_settings where id = 1`);
  return r[0] ?? {
    kennitala_krofuhafa: null, agreement_signed: false, agreement_note: null,
    claim_bank: null, final_due_days: 0, expires_after_days: 90,
  };
}

export interface SaveProfileInput {
  id?: string; code: string; name: string; settlement_iban?: string; settlement_ledger?: string;
  claim_type?: string; interest_rule?: string; notify_fee_paper?: number; notify_fee_paperless?: number;
  late_fee?: number; dunning?: boolean; dunning_count?: number; to_collection_days?: number | null;
  print_mode?: string; is_default?: boolean; is_active?: boolean;
}

/** Insert or update a kröfusnið. When is_default is set, clears the flag on all others first —
 *  the clear + upsert run in ONE transaction so two concurrent saves can't leave zero defaults or
 *  collide on the partial unique index. */
export async function saveCollectionProfile(p: SaveProfileInput): Promise<{ id: string }> {
  const code = (p.code || "").trim();
  const name = (p.name || "").trim();
  if (!code) throw new CollectionValidationError("Vantar kröfusnið (kóða).");
  if (!name) throw new CollectionValidationError("Vantar heiti.");
  const vals = [
    code, name, p.settlement_iban?.trim() || null, p.settlement_ledger?.trim() || null, p.claim_type || "krafa",
    p.interest_rule?.trim() || null, Number(p.notify_fee_paper) || 0, Number(p.notify_fee_paperless) || 0,
    Number(p.late_fee) || 0, !!p.dunning, Number(p.dunning_count) || 0,
    p.to_collection_days == null || p.to_collection_days === undefined ? null : Number(p.to_collection_days),
    p.print_mode || "rb", !!p.is_default, p.is_active === false ? false : true,
  ];
  const client = await db.connect();
  try {
    await client.query("begin");
    if (p.is_default) await client.query(`update acc.collection_profiles set is_default = false where is_default${p.id ? " and id <> $1" : ""}`, p.id ? [p.id] : []);
    let id: string;
    if (p.id) {
      await client.query(
        `update acc.collection_profiles set code=$2,name=$3,settlement_iban=$4,settlement_ledger=$5,claim_type=$6,
          interest_rule=$7,notify_fee_paper=$8,notify_fee_paperless=$9,late_fee=$10,dunning=$11,dunning_count=$12,
          to_collection_days=$13,print_mode=$14,is_default=$15,is_active=$16 where id=$1`, [p.id, ...vals]);
      id = p.id;
    } else {
      const r = await client.query<{ id: string }>(
        `insert into acc.collection_profiles
           (code,name,settlement_iban,settlement_ledger,claim_type,interest_rule,notify_fee_paper,notify_fee_paperless,
            late_fee,dunning,dunning_count,to_collection_days,print_mode,is_default,is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`, vals);
      id = r.rows[0].id;
    }
    await client.query("commit");
    return { id };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteCollectionProfile(id: string): Promise<void> {
  await query(`delete from acc.collection_profiles where id = $1`, [id]);
}

export async function saveCollectionSettings(s: { kennitala_krofuhafa?: string; agreement_signed?: boolean; agreement_note?: string }): Promise<void> {
  await query(
    `update acc.collection_settings set kennitala_krofuhafa=$1, agreement_signed=$2, agreement_note=$3, updated_at=now() where id=1`,
    [(s.kennitala_krofuhafa || "").replace(/\D/g, "") || null, !!s.agreement_signed, s.agreement_note?.trim() || null]);
}
