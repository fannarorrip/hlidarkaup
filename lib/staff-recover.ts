// Send a staff password email (reset OR first-time activation) via Resend, using a
// Supabase recovery link we generate ourselves (admin API) — not Supabase's own mailer,
// which is rate-limited and would point at the wrong URL. Creating the Supabase account
// on the fly also ACTIVATES staff rows that were seeded without an auth account.
import { query } from "@/lib/db";
import { ensureSupabaseUser, generateRecoveryLink, staffAdminConfigured } from "@/lib/staff-auth";

export function staffResetRedirect(): string {
  const base = process.env.STAFF_RESET_URL
    || `${(process.env.NEXT_PUBLIC_SITE_URL || "https://hlidarkaup.is").replace(/\/$/, "")}/starf/nytt-lykilord`;
  return base;
}

export interface SendResetResult { ok: boolean; created?: boolean; error?: string }

/** Ensure a staff email has a Supabase account, then email them a set-password link.
 *  requireStaff: for self-service, only send to real staff (and stay quiet about it). */
export async function sendStaffPasswordEmail(email: string, opts: { requireStaff?: boolean } = {}): Promise<SendResetResult> {
  const clean = (email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Ógilt netfang" };
  if (!staffAdminConfigured()) return { ok: false, error: "Supabase þjónustulykill vantar." };

  const staff = (await query<{ email: string; supabase_uid: string | null }>(
    `select email, supabase_uid from shop.staff where lower(email) = $1 and is_active`, [clean]))[0];
  if (!staff) {
    // Self-service must not reveal whether an email is staff.
    return opts.requireStaff ? { ok: true } : { ok: false, error: "Enginn virkur starfsmaður með þetta netfang." };
  }

  // Create + link the Supabase account if missing (this is what "activates" petur & co.).
  const ensured = await ensureSupabaseUser(clean);
  if (!ensured.ok || !ensured.uid) return { ok: false, error: ensured.error || "Gat ekki búið til aðgang." };
  if (ensured.uid !== staff.supabase_uid) {
    await query(`update shop.staff set supabase_uid = $2 where lower(email) = $1`, [clean, ensured.uid]).catch(() => {});
  }

  const link = await generateRecoveryLink(clean, staffResetRedirect());
  if (!link.ok || !link.link) return { ok: false, error: link.error || "Gat ekki búið til hlekk." };

  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY vantar — get ekki sent póst." };
  const from = process.env.RECEIPT_FROM ?? "Hlíðarkaup <onboarding@resend.dev>";
  const verb = ensured.created ? "Virkjaðu aðganginn þinn" : "Endurstilltu lykilorðið þitt";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [clean],
      subject: `${verb} — Hlíðarkaup`,
      html:
        `<p>Sæl/l,</p>` +
        `<p>${ensured.created ? "Aðgangur hefur verið stofnaður fyrir þig í starfsmannakerfi Hlíðarkaups." : "Beiðni um endurstillingu lykilorðs barst."}</p>` +
        `<p><a href="${link.link}" style="display:inline-block;padding:10px 18px;background:#DB1A1A;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Setja lykilorð</a></p>` +
        `<p style="color:#888;font-size:12px">Hlekkurinn rennur út innan skamms. Ef þú baðst ekki um þetta máttu hunsa póstinn.</p>` +
        `<p>Kær kveðja,<br/>Hlíðarkaup</p>`,
    }),
  });
  if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
  return { ok: true, created: ensured.created };
}
