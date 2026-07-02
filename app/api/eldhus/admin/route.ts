import { NextRequest, NextResponse } from "next/server";
import { getMeals, upsertMeal, patchMeal, deleteMeal, eldhusAdminEnabled, type MealRow } from "@/lib/eldhus-admin";
import { getEldhusOrders, updateEldhusOrderStatus } from "@/lib/eldhus-orders";

// SVO GOTT kitchen admin — data + actions, running on the STAFF session (middleware gates
// /api/eldhus/admin to eldhus/stjornandi). Replaces the old second client-side Supabase login.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!eldhusAdminEnabled()) return NextResponse.json({ ok: false, reason: "not_configured" });
  const [meals, orders] = await Promise.all([getMeals(), getEldhusOrders()]);
  return NextResponse.json({ ok: true, meals, orders });
}

const ORDER_STATUSES = new Set(["new", "preparing", "done"]);

export async function POST(req: NextRequest) {
  if (!eldhusAdminEnabled()) return NextResponse.json({ ok: false, message: "Bakvinnsla ekki stillt." });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    if (action === "saveMeal") {
      const m = body.meal as MealRow | undefined;
      if (!m || !m.title?.trim() || !m.slug?.trim()) return NextResponse.json({ ok: false, message: "Vantar heiti/slóð." });
      const res = await upsertMeal(m);
      return NextResponse.json(res);
    }
    if (action === "togglePublish") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ ok: false, message: "Vantar auðkenni." });
      const ok = await patchMeal(id, { published: !!body.published });
      return NextResponse.json({ ok });
    }
    if (action === "deleteMeal") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ ok: false, message: "Vantar auðkenni." });
      const ok = await deleteMeal(id);
      return NextResponse.json({ ok });
    }
    if (action === "orderStatus") {
      const id = String(body.id || "");
      const status = String(body.status || "");
      if (!id || !ORDER_STATUSES.has(status)) return NextResponse.json({ ok: false, message: "Ógild staða." });
      const ok = await updateEldhusOrderStatus(id, status);
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." });
  } catch (e) {
    console.error("eldhus/admin failed:", e);
    return NextResponse.json({ ok: false, message: "Aðgerð mistókst." });
  }
}
