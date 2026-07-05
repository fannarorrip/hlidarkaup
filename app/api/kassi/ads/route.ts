import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Active slideshow images for the price checker's idle screen. Kiosk surface
// (/api/kassi/*): reachable on the store LAN without a session, 404 from the internet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ads = await query<{ id: number; image_url: string }>(
    `select id, image_url from shop.screen_ads where is_active order by sort_order, id`,
  );
  return NextResponse.json({ ads });
}
