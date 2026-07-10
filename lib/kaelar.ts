// Kælaaflestur — daily HACCP temperature log per cooling unit (heilbrigðiseftirlit requires it).
// Units seeded from the old store's aflesturkæla sheet; readings judged against each unit's range.
import { query } from "@/lib/db";

export interface FridgeUnit {
  id: string; name: string; kind: string; min_temp: string; max_temp: string; sort: number; is_active: boolean;
  today_reading: string | null; today_ok: boolean | null; today_at: string | null;
}

/** Active units with today's latest reading per unit. */
export function listUnitsWithToday() {
  return query<FridgeUnit>(
    `select u.id, u.name, u.kind, u.min_temp::text, u.max_temp::text, u.sort, u.is_active,
            t.reading::text as today_reading, t.ok as today_ok, t.created_at::text as today_at
       from acc.fridge_units u
       left join lateral (
         select reading, ok, created_at from acc.temp_readings
          where unit_id = u.id and reading_date = current_date
          order by created_at desc limit 1
       ) t on true
      where u.is_active
      order by u.sort, u.name`);
}

/** Record a reading; ok = within the unit's range. */
export async function addReading(unitId: string, reading: number, note?: string, createdBy?: string) {
  const u = (await query<{ min_temp: string; max_temp: string }>(
    `select min_temp::text, max_temp::text from acc.fridge_units where id = $1 and is_active`, [unitId]))[0];
  if (!u) return { ok: false as const, message: "Kælir fannst ekki." };
  const within = reading >= Number(u.min_temp) && reading <= Number(u.max_temp);
  await query(
    `insert into acc.temp_readings (unit_id, reading, ok, note, created_by) values ($1,$2,$3,$4,$5)`,
    [unitId, reading, within, note || null, createdBy || "bokhald"]);
  return { ok: true as const, within };
}

export interface HistoryCell { unit_id: string; reading_date: string; reading: string; ok: boolean }

/** Last N days of readings (latest per unit per day) for the history matrix. */
export function history(days = 14) {
  return query<HistoryCell>(
    `select distinct on (unit_id, reading_date)
            unit_id, reading_date::text, reading::text, ok
       from acc.temp_readings
      where reading_date > current_date - $1::int
      order by unit_id, reading_date, created_at desc`, [days]);
}

/** Create or update a unit. */
export async function upsertUnit(u: { id?: string; name: string; kind: string; min_temp: number; max_temp: number }) {
  if (!["kælir", "frystir"].includes(u.kind)) return null;
  if (u.id) {
    const r = await query<{ id: string }>(
      `update acc.fridge_units set name=$2, kind=$3, min_temp=$4, max_temp=$5 where id=$1 returning id`,
      [u.id, u.name, u.kind, u.min_temp, u.max_temp]);
    return r[0] ?? null;
  }
  const r = await query<{ id: string }>(
    `insert into acc.fridge_units (name, kind, min_temp, max_temp, sort)
       values ($1,$2,$3,$4, coalesce((select max(sort) from acc.fridge_units), 0) + 10)
     on conflict (name) do update set is_active = true, kind = excluded.kind,
       min_temp = excluded.min_temp, max_temp = excluded.max_temp
     returning id`, [u.name, u.kind, u.min_temp, u.max_temp]);
  return r[0] ?? null;
}

export async function deactivateUnit(id: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    `update acc.fridge_units set is_active = false where id = $1 returning id`, [id]);
  return r.length > 0;
}
