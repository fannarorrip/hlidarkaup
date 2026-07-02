// Z-skýrsla: close a day's till into an immutable, gap-free record. The Z-number is assigned under
// an advisory lock so concurrent closes can't collide or skip numbers.
import { db } from "@/lib/db";
import { getDailySettlement, type DailySettlement } from "@/lib/accounting-queries";

export interface ZReport {
  z_number: number; report_date: string; snapshot: DailySettlement;
  cash_counted: number | null; cash_diff: number | null; closed_at: string;
}

export async function getZReport(date: string): Promise<ZReport | null> {
  const client = await db.connect();
  try {
    const r = await client.query<{ z_number: string; report_date: string; snapshot: DailySettlement; cash_counted: string | null; cash_diff: string | null; closed_at: string }>(
      `select z_number::text, report_date::text, snapshot, cash_counted::text, cash_diff::text, closed_at::text
       from acc.z_reports where report_date = $1`, [date]);
    const z = r.rows[0];
    if (!z) return null;
    return {
      z_number: Number(z.z_number), report_date: z.report_date, snapshot: z.snapshot,
      cash_counted: z.cash_counted == null ? null : Number(z.cash_counted),
      cash_diff: z.cash_diff == null ? null : Number(z.cash_diff),
      closed_at: z.closed_at,
    };
  } finally { client.release(); }
}

export interface CloseResult { ok: boolean; message?: string; z_number?: number }

export async function closeZReport(date: string, countedCash: number | null): Promise<CloseResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Ógild dagsetning." };
  const snapshot = await getDailySettlement(date);   // point-in-time snapshot of the day's sales
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('acc.z_reports'))"); // serialize Z-number assignment
    const dup = await client.query("select 1 from acc.z_reports where report_date = $1", [date]);
    if (dup.rowCount) { await client.query("rollback"); return { ok: false, message: "Dagurinn er þegar lokaður." }; }
    const zn = Number((await client.query<{ n: string }>("select coalesce(max(z_number),0)+1 as n from acc.z_reports")).rows[0].n);
    const cash = Number(snapshot?.cash) || 0;
    const diff = countedCash == null ? null : Math.round((countedCash - cash) * 100) / 100;
    await client.query(
      "insert into acc.z_reports (z_number, report_date, snapshot, cash_counted, cash_diff, closed_by) values ($1,$2::date,$3::jsonb,$4,$5,'bokhald')",
      [zn, date, JSON.stringify(snapshot), countedCash, diff]);
    await client.query("commit");
    return { ok: true, z_number: zn };
  } catch (e) {
    try { await client.query("rollback"); } catch { /* */ }
    console.error("closeZReport failed:", e);
    return { ok: false, message: "Lokun mistókst. Reyndu aftur." };
  } finally { client.release(); }
}
