// SVO GOTT (eldhús) orders live in the Supabase `orders` table — inserted client-side by the
// eldhús checkout (app/eldhus/ganga-fra/CheckoutView.tsx) and managed by the kitchen admin.
// The bókhald admin reads/updates them server-side via the service-role key (RLS-bypassing),
// mirroring the pattern in app/api/staff/route.ts. No new DB table needed.

export interface EldhusOrder {
  id: string;
  ref: string | null;
  plan: "once" | "subscription" | string | null;
  delivery_type: "pickup" | "delivery" | string | null;
  pickup_time: string | null;
  delivery_date: string | null;
  address: string | null;
  distance_km: number | null;
  shipping: number | null;
  portions: number | null;
  meals: number | null;
  items: { slug?: string; title: string }[] | null;
  subtotal: number | null;
  total: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  status: string;
  created_at: string;
}

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/** True once Supabase service-role access is configured (needed to read eldhús orders). */
export const eldhusOrdersEnabled = () => !!cfg();

export async function getEldhusOrders(): Promise<EldhusOrder[]> {
  const c = cfg();
  if (!c) return [];
  try {
    const r = await fetch(`${c.url}/rest/v1/orders?select=*&order=created_at.desc`, {
      headers: { apikey: c.key, authorization: `Bearer ${c.key}` },
      cache: "no-store",
    });
    if (!r.ok) return [];
    return (await r.json()) as EldhusOrder[];
  } catch {
    return [];
  }
}

export async function updateEldhusOrderStatus(id: string, status: string): Promise<boolean> {
  const c = cfg();
  if (!c) return false;
  try {
    const r = await fetch(`${c.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        apikey: c.key,
        authorization: `Bearer ${c.key}`,
        "content-type": "application/json",
        // representation so we can tell an actual update from a zero-row match (bogus id)
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) return false;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}
