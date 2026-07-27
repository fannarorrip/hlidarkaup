import { NextResponse } from "next/server";
import { listUnpaidSimgreidslur } from "@/lib/simgreidsla-collect";

// Old símgreiðslur still owed (posted kassi_sale, money-in on 7830, not yet collected).
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ items: await listUnpaidSimgreidslur() });
  } catch (err) {
    console.error("[símgreiðsla/unpaid] error:", err);
    return NextResponse.json({ error: "Villa við að sækja ógreiddar símgreiðslur" }, { status: 500 });
  }
}
