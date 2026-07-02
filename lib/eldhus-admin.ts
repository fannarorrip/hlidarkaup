// SVO GOTT (eldhús) meal management, server-side via the Supabase service-role key — same pattern
// as lib/eldhus-orders.ts. This lets the kitchen admin run entirely on the STAFF session (middleware
// role gate) instead of a second client-side Supabase login: the browser talks to our /api/eldhus/admin
// routes, never to Supabase directly.

export interface MealRow {
  id?: string;
  slug: string;
  title: string;
  tag: string;
  minutes: number;
  kcal: number;
  blurb: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  image_url: string | null;
  from_color: string;
  to_color: string;
  published: boolean;
  position: number;
}

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
export const eldhusAdminEnabled = () => !!cfg();

const hdrs = (key: string, extra: Record<string, string> = {}) => ({
  apikey: key, authorization: `Bearer ${key}`, ...extra,
});

export async function getMeals(): Promise<MealRow[]> {
  const c = cfg();
  if (!c) return [];
  const r = await fetch(`${c.url}/rest/v1/meals?select=*&order=position.asc`, { headers: hdrs(c.key), cache: "no-store" });
  if (!r.ok) return [];
  return (await r.json()) as MealRow[];
}

export async function upsertMeal(row: MealRow & { updated_at?: string }): Promise<{ ok: boolean; message?: string }> {
  const c = cfg();
  if (!c) return { ok: false, message: "Supabase ekki stillt." };
  const r = await fetch(`${c.url}/rest/v1/meals?on_conflict=slug`, {
    method: "POST",
    headers: hdrs(c.key, { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) return { ok: false, message: (await r.text().catch(() => "")).slice(0, 200) || `HTTP ${r.status}` };
  return { ok: true };
}

export async function patchMeal(id: string, patch: Partial<MealRow>): Promise<boolean> {
  const c = cfg();
  if (!c) return false;
  const r = await fetch(`${c.url}/rest/v1/meals?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: hdrs(c.key, { "content-type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

export async function deleteMeal(id: string): Promise<boolean> {
  const c = cfg();
  if (!c) return false;
  const r = await fetch(`${c.url}/rest/v1/meals?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers: hdrs(c.key),
  });
  return r.ok;
}

/** Upload a meal photo to the meal-photos bucket; returns its public URL. */
export async function uploadMealPhoto(path: string, bytes: Buffer, contentType: string): Promise<{ ok: boolean; url?: string; message?: string }> {
  const c = cfg();
  if (!c) return { ok: false, message: "Supabase ekki stillt." };
  const r = await fetch(`${c.url}/storage/v1/object/meal-photos/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: hdrs(c.key, { "content-type": contentType || "application/octet-stream", "x-upsert": "true" }),
    body: new Uint8Array(bytes),
  });
  if (!r.ok) return { ok: false, message: (await r.text().catch(() => "")).slice(0, 200) || `HTTP ${r.status}` };
  return { ok: true, url: `${c.url}/storage/v1/object/public/meal-photos/${path}` };
}
