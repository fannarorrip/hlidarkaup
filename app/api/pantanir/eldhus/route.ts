import { NextRequest, NextResponse } from "next/server";
import { updateEldhusOrderStatus } from "@/lib/eldhus-orders";

const ALLOWED = new Set(["new", "preparing", "done"]);

// Update an eldhús (SVO GOTT) order's status in Supabase. Gated stjornandi/bokari via middleware.
export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !ALLOWED.has(status)) return NextResponse.json({ error: "Vantar id eða ógild staða" }, { status: 400 });
  const ok = await updateEldhusOrderStatus(id, status);
  if (!ok) return NextResponse.json({ error: "Uppfærsla mistókst" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
