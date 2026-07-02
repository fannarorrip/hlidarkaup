import { NextResponse } from "next/server";
import { STAFF_COOKIE } from "@/lib/staff-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
