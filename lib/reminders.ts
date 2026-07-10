// Áminningakerfið — the "don't forget" brain behind the Yfirlit widget + the daily escalation email.
// Two sources, merged and sorted by urgency:
//   1. LIVE obligations (computed here): óbókuð fylgiskjöl/móttaka, VSK-skiladagur, staðgreiðsla,
//      gjaldfallnir reikningar, kröfur í biðröð, kælaaflestur ekki skráður. These clear themselves.
//   2. SCHEDULED reminders (acc.reminders): rituals + manual one-offs, marked done per occurrence.
// Tax deadline RULES are encoded from skatturinn.is (confirmed 2026) — see deploy notes.
import { query } from "@/lib/db";

export type Severity = "overdue" | "today" | "soon" | "upcoming";
export interface ReminderItem {
  key: string;               // stable key for mark-done (reminder-id@date, or synthetic tax key@date)
  title: string;
  detail?: string;
  category: string;          // 'fylgiskjal'|'skattur'|'reikningur'|'krafa'|'haccp'|'ritúal'|'pöntun'|'annað'
  dueDate: string | null;    // YYYY-MM-DD
  daysUntil: number | null;  // negative = overdue
  severity: Severity;
  href?: string;
  source: "live" | "scheduled";
  canDone: boolean;          // scheduled/tax → markable; live obligations clear themselves
  emailEscalate: boolean;
}

const ISO = (d: Date) => d.toISOString().slice(0, 10);
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysBetween = (dateStr: string) => Math.round((new Date(dateStr + "T00:00:00").getTime() - today0().getTime()) / 86400000);
function severityFor(days: number | null): Severity {
  if (days == null) return "upcoming";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  return "upcoming";
}
/** Move a weekend date to the following Monday (statutory deadlines shift to the next business day). */
function toBusinessDay(d: Date): Date {
  const x = new Date(d);
  const wd = x.getDay(); // 0 = Sun, 6 = Sat
  if (wd === 6) x.setDate(x.getDate() + 2);
  else if (wd === 0) x.setDate(x.getDate() + 1);
  return x;
}

// ── TAX DEADLINES ────────────────────────────────────────────────────────────
// VSK: six two-month periods; skiladagur = 5th of the 2nd month after period end,
//   shifted to the next business day. Nil returns still required.
const VSK_PERIODS = [
  { key: "jan-feb", endMonth: 1, label: "jan–feb" },   // 0-based end month
  { key: "mar-apr", endMonth: 3, label: "mar–apr" },
  { key: "mai-jun", endMonth: 5, label: "maí–jún" },
  { key: "jul-ag",  endMonth: 7, label: "júl–ág" },
  { key: "sep-okt", endMonth: 9, label: "sep–okt" },
  { key: "nov-des", endMonth: 11, label: "nóv–des" },
];
function vskDueDate(year: number, endMonth: number): { due: string; periodYear: number } {
  // due month = endMonth + 2 (may roll into next year for nóv–des)
  let m = endMonth + 2, y = year;
  if (m > 11) { m -= 12; y += 1; }
  const d = toBusinessDay(new Date(y, m, 5));
  return { due: ISO(d), periodYear: year };
}

// ── LIVE OBLIGATIONS ─────────────────────────────────────────────────────────
async function liveObligations(): Promise<ReminderItem[]> {
  const items: ReminderItem[] = [];
  const push = (i: ReminderItem) => items.push(i);

  // 1. Óbókuð fylgiskjöl í Pósthólfi (received e-invoices/emails awaiting booking)
  const posth = (await query<{ n: string; oldest: string | null }>(
    `select count(*)::text as n, min(received_at)::text as oldest from acc.email_invoices where status='pending'`))[0];
  if (Number(posth.n) > 0) {
    const ageDays = posth.oldest ? Math.floor((Date.now() - new Date(posth.oldest).getTime()) / 86400000) : 0;
    const days = ageDays >= 5 ? -(ageDays - 4) : ageDays >= 2 ? 0 : 1;
    push({ key: "live:postholf", title: `Óbókuð fylgiskjöl í Pósthólfi (${posth.n})`, detail: "EKKI GLEYMA AÐ BÓKA FÆRSLUNA — reikningar bíða í Skráningu.",
      category: "fylgiskjal", dueDate: ISO(today0()), daysUntil: days, severity: severityFor(days),
      href: "/bokhald/skraning/postholf", source: "live", canDone: false, emailEscalate: true });
  }

  // 2. Óbókuð móttaka (goods receipts still 'received')
  const mott = (await query<{ n: string; oldest: string | null }>(
    `select count(*)::text as n, min(created_at)::text as oldest from acc.goods_receipts where status='received'`))[0];
  if (Number(mott.n) > 0) {
    const ageDays = mott.oldest ? Math.floor((Date.now() - new Date(mott.oldest).getTime()) / 86400000) : 0;
    const days = ageDays >= 4 ? -(ageDays - 3) : ageDays >= 2 ? 0 : 1;
    push({ key: "live:mottaka", title: `Óbókuð móttaka (${mott.n})`, detail: "Móttökur bíða bókunar — bókaðu og uppfærðu birgðir.",
      category: "fylgiskjal", dueDate: ISO(today0()), daysUntil: days, severity: severityFor(days),
      href: "/bokhald/solukerfi/innkaup/mottaka", source: "live", canDone: false, emailEscalate: true });
  }

  // 3. Gjaldfallnir / næstum gjaldfallnir bankareikningar (kröfur á okkur) — by eindagi
  const bills = await query<{ id: string; claimant: string | null; amount: string; final: string | null; days: number | null }>(
    `select id, coalesce(claimant_name, claimant_id) as claimant, amount_due::text as amount,
            coalesce(final_due_date, due_date)::text as final,
            (coalesce(final_due_date, due_date) - current_date) as days
       from acc.bank_bills
      where status='open' and coalesce(final_due_date, due_date) <= current_date + 3
      order by coalesce(final_due_date, due_date)`);
  for (const b of bills) {
    const days = b.days == null ? 0 : Number(b.days);
    push({ key: `live:bill:${b.id}`, title: `Greiða: ${b.claimant ?? "krafa"} — ${Math.round(Number(b.amount)).toLocaleString("is-IS")} kr.`,
      detail: days < 0 ? "Í VANSKILUM — greiða strax." : "Eindagi að nálgast.",
      category: "reikningur", dueDate: b.final, daysUntil: days, severity: severityFor(days),
      href: "/bokhald/bankatenging", source: "live", canDone: false, emailEscalate: true });
  }

  // 4. Gjaldfallnir eigin lánadrottnareikningar (AP past due, not yet in bank_bills)
  const payDue = (await query<{ n: string }>(
    `select count(*)::text as n from acc.payables where status in ('open','pending') and due_date is not null and due_date < current_date`))[0];
  if (Number(payDue.n) > 0) {
    push({ key: "live:payables", title: `Gjaldfallnir reikningar (${payDue.n})`, detail: "Reikningar sem eru komnir fram yfir eindaga.",
      category: "reikningur", dueDate: ISO(today0()), daysUntil: -1, severity: "overdue",
      href: "/bokhald/bankatenging", source: "live", canDone: false, emailEscalate: true });
  }

  // 5. Kröfur í biðröð (queued, not sent) — the cron sends these, but flag if any linger
  const claims = (await query<{ n: string }>(`select count(*)::text as n from acc.claims where status='queued'`))[0];
  if (Number(claims.n) > 0) {
    push({ key: "live:claims", title: `Kröfur í biðröð (${claims.n})`, detail: "Ósendar kröfur — sendast sjálfvirkt kl. 8 en má senda strax.",
      category: "krafa", dueDate: ISO(today0()), daysUntil: 1, severity: "soon",
      href: "/bokhald/bankatenging", source: "live", canDone: false, emailEscalate: false });
  }

  // 6. Kælaaflestur ekki skráður í dag (HACCP) — only once the store has started logging (any reading in 7 d)
  const temp = (await query<{ active: string; done: string; started: boolean }>(
    `select (select count(*) from acc.fridge_units where is_active)::text as active,
            (select count(distinct unit_id) from acc.temp_readings where reading_date = current_date)::text as done,
            exists(select 1 from acc.temp_readings where reading_date > current_date - 7) as started`))[0];
  if (temp.started && Number(temp.active) > Number(temp.done)) {
    const missing = Number(temp.active) - Number(temp.done);
    push({ key: "live:kaelar", title: `Kælaaflestur: ${missing} óskráðir í dag`, detail: "HACCP — skráðu hitastig kæla og frysta.",
      category: "haccp", dueDate: ISO(today0()), daysUntil: 0, severity: "today",
      href: "/bokhald/solukerfi/kaelar", source: "live", canDone: false, emailEscalate: true });
  }

  return items;
}

// ── TAX REMINDERS (rule-based) ───────────────────────────────────────────────
async function taxReminders(horizon: number): Promise<ReminderItem[]> {
  const items: ReminderItem[] = [];
  const now = today0();
  const yr = now.getFullYear();

  // done-log for tax keys within our window
  const done = new Set((await query<{ reminder_key: string; occurrence_date: string }>(
    `select reminder_key, occurrence_date::text from acc.reminder_done where occurrence_date > current_date - 60`))
    .map((r) => `${r.reminder_key}@${r.occurrence_date}`));

  // VSK — look at this year + previous year's nóv–des (whose deadline lands in Feb)
  for (const y of [yr - 1, yr]) {
    for (const p of VSK_PERIODS) {
      const { due } = vskDueDate(y, p.endMonth);
      const days = daysBetween(due);
      if (days < -45 || days > horizon) continue;             // outside the window
      const key = `VSK-${y}-${p.key}`;
      if (done.has(`${key}@${due}`)) continue;
      // auto-detect settled: a vat_settlement voucher covering the period
      const settled = (await query<{ n: string }>(
        `select count(*)::text as n from acc.vat_settlements
          where period_start <= make_date($1,$2,1) and period_end >= make_date($1,$2,1)`, [y, p.endMonth + 1]))[0];
      if (Number(settled.n) > 0) continue;
      items.push({ key: `${key}@${due}`, title: `VSK-uppgjör ${p.label} ${y}`,
        detail: days < 0 ? "SKILAFRESTUR LIÐINN — skila strax (dráttarvextir)." : "Skila VSK-skýrslu og greiða á skatturinn.is.",
        category: "skattur", dueDate: due, daysUntil: days, severity: severityFor(days),
        href: "/bokhald/vsk", source: "scheduled", canDone: true, emailEscalate: true });
    }
  }

  // Staðgreiðsla + tryggingagjald — monthly, due 15th of the following month, shifted to a business day.
  // Only surfaced once a payroll run exists for the wage month (no nagging pre-employees).
  for (let back = 0; back <= 2; back++) {
    const wage = new Date(yr, now.getMonth() - back, 1);
    const dueMonth = new Date(wage.getFullYear(), wage.getMonth() + 1, 15);
    const due = ISO(toBusinessDay(dueMonth));
    const days = daysBetween(due);
    if (days < -45 || days > horizon) continue;
    const key = `STGR-${wage.getFullYear()}-${String(wage.getMonth() + 1).padStart(2, "0")}`;
    if (done.has(`${key}@${due}`)) continue;
    const hasRun = (await query<{ n: string }>(
      `select count(*)::text as n from acc.payroll_runs where date_trunc('month', period_start) = date_trunc('month', $1::date)`,
      [ISO(wage)]).catch(() => [{ n: "0" }]))[0];
    if (Number(hasRun.n) === 0) continue;
    const mLabel = wage.toLocaleDateString("is-IS", { month: "long", year: "numeric" });
    if (!done.has(`${key}@${due}`))
      items.push({ key: `${key}@${due}`, title: `Staðgreiðsla + tryggingagjald (${mLabel})`,
        detail: days < 0 ? "SKILAFRESTUR LIÐINN — skila strax." : "Skila afdreginni staðgreiðslu og tryggingagjaldi (eindagi 15.).",
        category: "skattur", dueDate: due, daysUntil: days, severity: severityFor(days),
        href: "/bokhald/laun", source: "scheduled", canDone: true, emailEscalate: true });

    // Lífeyrissjóður — gjalddagi 10th of the following month (eindagi = last banking day of that month).
    const penDue = ISO(toBusinessDay(new Date(wage.getFullYear(), wage.getMonth() + 1, 10)));
    const penDays = daysBetween(penDue);
    const penKey = `LIF-${wage.getFullYear()}-${String(wage.getMonth() + 1).padStart(2, "0")}`;
    if (penDays >= -45 && penDays <= horizon && !done.has(`${penKey}@${penDue}`))
      items.push({ key: `${penKey}@${penDue}`, title: `Lífeyrissjóður (${mLabel})`,
        detail: penDays < 0 ? "GJALDDAGI LIÐINN — skila (eindagi = síðasti bankadagur mánaðar)." : "Skila lífeyrisiðgjöldum (gjalddagi 10.).",
        category: "skattur", dueDate: penDue, daysUntil: penDays, severity: severityFor(penDays),
        href: "/bokhald/laun", source: "scheduled", canDone: true, emailEscalate: true });
  }

  return items;
}

// ── SCHEDULED REMINDERS (rituals + manual) ───────────────────────────────────
interface ReminderRow {
  id: string; title: string; description: string | null; category: string;
  schedule_kind: string; weekday: number | null; day_of_month: number | null;
  month: number | null; due_date: string | null; lead_days: number; email_escalate: boolean;
}
/** Next occurrence date of a scheduled reminder on/after today (null for a past one-off already gone). */
function nextOccurrence(r: ReminderRow): string | null {
  const now = today0();
  if (r.schedule_kind === "oneoff") return r.due_date;
  if (r.schedule_kind === "weekly" && r.weekday) {
    const target = ((r.weekday % 7)); // our weekday 1=Mon..7=Sun → JS getDay 1..0
    const jsTarget = target === 0 ? 0 : target; // Sun handled: weekday 7 → 0
    const d = new Date(now);
    let add = (jsTarget - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + add);
    return ISO(d);
  }
  if (r.schedule_kind === "monthly" && r.day_of_month) {
    let d = new Date(now.getFullYear(), now.getMonth(), r.day_of_month);
    if (d < now) d = new Date(now.getFullYear(), now.getMonth() + 1, r.day_of_month);
    return ISO(d);
  }
  if (r.schedule_kind === "yearly" && r.month) {
    const dom = r.day_of_month || 1;
    let d = new Date(now.getFullYear(), r.month - 1, dom);
    if (d < now) d = new Date(now.getFullYear() + 1, r.month - 1, dom);
    return ISO(d);
  }
  return null;
}
async function scheduledReminders(horizon: number): Promise<ReminderItem[]> {
  const rows = await query<ReminderRow>(
    `select id, title, description, category, schedule_kind, weekday, day_of_month, month,
            due_date::text as due_date, lead_days, email_escalate
       from acc.reminders where is_active`);
  const done = new Set((await query<{ reminder_key: string; occurrence_date: string }>(
    `select reminder_key, occurrence_date::text from acc.reminder_done where occurrence_date > current_date - 60`))
    .map((r) => `${r.reminder_key}@${r.occurrence_date}`));

  const items: ReminderItem[] = [];
  for (const r of rows) {
    const occ = nextOccurrence(r);
    if (!occ) continue;
    const days = daysBetween(occ);
    // one-off keeps showing when overdue; recurring only within its lead window
    if (r.schedule_kind === "oneoff") { if (days > r.lead_days) continue; }
    else if (days < 0 || days > r.lead_days) continue;
    const key = `${r.id}@${occ}`;
    if (done.has(key)) continue;
    items.push({ key, title: r.title, detail: r.description ?? undefined, category: r.category,
      dueDate: occ, daysUntil: days, severity: severityFor(days),
      source: "scheduled", canDone: true, emailEscalate: r.email_escalate });
  }
  return items;
}

const SEV_RANK: Record<Severity, number> = { overdue: 0, today: 1, soon: 2, upcoming: 3 };

/** All reminders (live + tax + scheduled), sorted most-urgent first. */
export async function getReminders(horizon = 14): Promise<ReminderItem[]> {
  const [live, tax, sched] = await Promise.all([
    liveObligations().catch(() => []),
    taxReminders(horizon).catch(() => []),
    scheduledReminders(horizon).catch(() => []),
  ]);
  return [...live, ...tax, ...sched].sort((a, b) =>
    SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
    (a.daysUntil ?? 99) - (b.daysUntil ?? 99) ||
    a.title.localeCompare(b.title, "is"));
}

/** Items critical enough to escalate by email today (overdue/today + escalate flag). */
export async function criticalReminders(): Promise<ReminderItem[]> {
  return (await getReminders(3)).filter((r) => r.emailEscalate && (r.severity === "overdue" || r.severity === "today"));
}

// ── mark done + CRUD ─────────────────────────────────────────────────────────
export async function markReminderDone(key: string, by?: string): Promise<{ ok: boolean }> {
  // key is "<reminder-key>@<YYYY-MM-DD>"
  const at = key.lastIndexOf("@");
  if (at < 0) return { ok: false };
  const reminderKey = key.slice(0, at), occ = key.slice(at + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occ)) return { ok: false };
  await query(
    `insert into acc.reminder_done (reminder_key, occurrence_date, done_by)
       values ($1,$2::date,$3) on conflict (reminder_key, occurrence_date) do nothing`,
    [reminderKey, occ, by || "bokhald"]);
  return { ok: true };
}

export interface ReminderDef {
  id: string; title: string; description: string | null; category: string; schedule_kind: string;
  weekday: number | null; day_of_month: number | null; month: number | null; due_date: string | null;
  lead_days: number; email_escalate: boolean; is_active: boolean;
}
export function listReminderDefs() {
  return query<ReminderDef>(
    `select id, title, description, category, schedule_kind, weekday, day_of_month, month,
            due_date::text as due_date, lead_days, email_escalate, is_active
       from acc.reminders order by is_active desc, schedule_kind, title`);
}
export async function upsertReminder(r: Partial<ReminderDef> & { title: string; schedule_kind: string }) {
  const vals = [r.title, r.description ?? null, r.category ?? "annað", r.schedule_kind,
    r.weekday ?? null, r.day_of_month ?? null, r.month ?? null, r.due_date ?? null,
    r.lead_days ?? 2, r.email_escalate ?? false];
  if (r.id) {
    const res = await query<{ id: string }>(
      `update acc.reminders set title=$1, description=$2, category=$3, schedule_kind=$4, weekday=$5,
              day_of_month=$6, month=$7, due_date=$8::date, lead_days=$9, email_escalate=$10
        where id=$11 returning id`, [...vals, r.id]);
    return res[0] ?? null;
  }
  const res = await query<{ id: string }>(
    `insert into acc.reminders (title, description, category, schedule_kind, weekday, day_of_month, month, due_date, lead_days, email_escalate)
       values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10) returning id`, vals);
  return res[0] ?? null;
}
export async function deleteReminder(id: string): Promise<boolean> {
  const r = await query<{ id: string }>(`update acc.reminders set is_active=false where id=$1 returning id`, [id]);
  return r.length > 0;
}

// ── Calendar occurrences (for the Dagatal month grid) ────────────────────────
export interface CalEvent { date: string; title: string; category: string; done: boolean }
/** Enumerate scheduled reminders + tax deadlines that FALL within [fromISO, toISO] (inclusive),
 *  ignoring lead windows — for the calendar view. */
export async function calendarOccurrences(fromISO: string, toISO: string): Promise<CalEvent[]> {
  const from = new Date(fromISO + "T00:00:00"), to = new Date(toISO + "T00:00:00");
  const inRange = (d: Date) => d >= from && d <= to;
  const events: CalEvent[] = [];
  const doneRows = await query<{ reminder_key: string; occurrence_date: string }>(
    `select reminder_key, occurrence_date::text from acc.reminder_done
      where occurrence_date between $1::date and $2::date`, [fromISO, toISO]);
  const done = new Set(doneRows.map((r) => `${r.reminder_key}@${r.occurrence_date}`));
  const add = (d: Date, title: string, category: string, key?: string) => {
    const iso = ISO(d);
    events.push({ date: iso, title, category, done: key ? done.has(`${key}@${iso}`) : false });
  };

  // scheduled reminders (rituals + manual + the seeded annuals)
  const rows = await query<ReminderRow>(
    `select id, title, description, category, schedule_kind, weekday, day_of_month, month,
            due_date::text as due_date, lead_days, email_escalate
       from acc.reminders where is_active`);
  for (const r of rows) {
    if (r.schedule_kind === "oneoff" && r.due_date) {
      const d = new Date(r.due_date + "T00:00:00"); if (inRange(d)) add(d, r.title, r.category, r.id);
    } else if (r.schedule_kind === "weekly" && r.weekday) {
      const jsTarget = r.weekday % 7; // 7→0 (Sun)
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1))
        if (d.getDay() === jsTarget) add(new Date(d), r.title, r.category, r.id);
    } else if (r.schedule_kind === "monthly" && r.day_of_month) {
      for (let m = new Date(from.getFullYear(), from.getMonth(), 1); m <= to; m.setMonth(m.getMonth() + 1)) {
        const d = new Date(m.getFullYear(), m.getMonth(), r.day_of_month); if (inRange(d)) add(d, r.title, r.category, r.id);
      }
    } else if (r.schedule_kind === "yearly" && r.month) {
      for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
        const d = new Date(y, r.month - 1, r.day_of_month || 1); if (inRange(d)) add(d, r.title, r.category, r.id);
      }
    }
  }

  // VSK deadlines
  for (let y = from.getFullYear() - 1; y <= to.getFullYear(); y++)
    for (const p of VSK_PERIODS) {
      const d = new Date(vskDueDate(y, p.endMonth).due + "T00:00:00");
      if (inRange(d)) add(d, `VSK ${p.label} ${y}`, "skattur", `VSK-${y}-${p.key}`);
    }
  // staðgreiðsla (15th) + lífeyrir (10th) of each month in range
  for (let m = new Date(from.getFullYear(), from.getMonth() - 1, 1); m <= to; m.setMonth(m.getMonth() + 1)) {
    const wageY = m.getFullYear(), wageM = m.getMonth();
    const st = toBusinessDay(new Date(wageY, wageM + 1, 15));
    if (inRange(st)) add(st, "Staðgreiðsla + tryggingagjald", "skattur", `STGR-${wageY}-${String(wageM + 1).padStart(2, "0")}`);
    const lif = toBusinessDay(new Date(wageY, wageM + 1, 10));
    if (inRange(lif)) add(lif, "Lífeyrissjóður", "skattur", `LIF-${wageY}-${String(wageM + 1).padStart(2, "0")}`);
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Daily escalation email ───────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Send the "EKKI GLEYMA" email when there are critical (overdue/today) items. Once per day.
 *  Recipients: REMINDER_EMAIL_TO (comma-sep) or the two Hlíðarkaup addresses. Uses Resend. */
export async function sendReminderEscalation(opts: { force?: boolean } = {}): Promise<{ sent: boolean; reason?: string; count?: number }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY vantar" };

  // once-per-day guard (unless forced)
  if (!opts.force) {
    const already = await query<{ id: string }>(`select id from acc.reminder_email_log where sent_date = current_date`);
    if (already.length) return { sent: false, reason: "þegar sent í dag" };
  }

  const critical = await criticalReminders();
  if (!critical.length) return { sent: false, reason: "ekkert áríðandi", count: 0 };

  const to = (process.env.REMINDER_EMAIL_TO || "oli@hlidarkaup.is,hlidarkaup@hlidarkaup.is")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.RECEIPT_FROM || "Hlíðarkaup <onboarding@resend.dev>";
  const siteBase = process.env.APP_BASE_URL || "";

  const rows = critical.map((r) => {
    const when = r.severity === "overdue" && r.daysUntil != null ? `${-r.daysUntil} d. yfir eindaga` : "Í DAG";
    const link = r.href ? `${siteBase}${r.href}` : "";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">
        <b style="color:${r.severity === "overdue" ? "#b91c1c" : "#111"};">${esc(r.title)}</b>
        ${r.detail ? `<div style="color:#666;font-size:13px;margin-top:2px;">${esc(r.detail)}</div>` : ""}
        ${link ? `<div style="margin-top:4px;"><a href="${esc(link)}" style="color:#b91c1c;font-size:12px;">Opna í kerfinu →</a></div>` : ""}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;color:${r.severity === "overdue" ? "#b91c1c" : "#a16207"};font-weight:700;">${when}</td>
    </tr>`;
  }).join("");

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:#b91c1c;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;">
        <div style="font-size:22px;font-weight:800;letter-spacing:.5px;">⚠️ EKKI GLEYMA!</div>
        <div style="opacity:.9;font-size:13px;margin-top:2px;">Áríðandi verkefni sem má ekki gleymast — Hlíðarkaup</div>
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-top:0;">${rows}</table>
      <p style="color:#999;font-size:12px;margin-top:12px;">
        Þessi póstur er sendur sjálfvirkt þegar eitthvað áríðandi er ógert. Kláraðu verkefnin í kerfinu — þá hverfa þau af listanum.
      </p>
    </div>`;

  const subjectLead = critical.find((r) => r.category === "fylgiskjal")
    ? "EKKI GLEYMA AÐ BÓKA FÆRSLUNA"
    : critical.find((r) => r.category === "skattur") ? "Skiladagur að renna út"
    : "Áríðandi verkefni ógerð";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject: `⚠️ ${subjectLead} — Hlíðarkaup (${critical.length})`, html }),
  });
  if (!res.ok) return { sent: false, reason: `Resend ${res.status}` };

  await query(
    `insert into acc.reminder_email_log (sent_date, item_count, recipients) values (current_date, $1, $2)
     on conflict (sent_date) do update set item_count = excluded.item_count, sent_at = now()`,
    [critical.length, to.join(", ")]).catch(() => {});
  return { sent: true, count: critical.length };
}
