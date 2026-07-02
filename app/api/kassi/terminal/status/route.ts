import { NextResponse } from "next/server";
import { adyenEnabled, adyenConfig } from "@/lib/adyen-terminal";

// Is the card terminal configured? (the till uses this to decide whether to drive the terminal)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: adyenEnabled(), env: adyenConfig().env });
}
