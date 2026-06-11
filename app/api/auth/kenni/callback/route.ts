import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ageFromKennitala } from "@/lib/unifi";

const KENNI_ISSUER = process.env.KENNI_ISSUER ?? "https://idp.kenni.is/hlidarkaup.netlify.app";
const TOKEN_ENDPOINT = `${KENNI_ISSUER}/oidc/token`;
const CLIENT_ID = process.env.KENNI_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.KENNI_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.KENNI_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/kenni/callback`;
const MIN_AGE = parseInt(process.env.SJALFSALI_MIN_AGE ?? "18");

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("kenni_state")?.value;
  const codeVerifier = cookieStore.get("kenni_verifier")?.value ?? "";
  cookieStore.delete("kenni_state");
  cookieStore.delete("kenni_verifier");

  if (error) {
    const desc = searchParams.get("error_description") ?? error;
    console.error("Kenni error:", error, desc);
    return NextResponse.redirect(new URL(`/sjalfsali?error=cancelled&detail=${encodeURIComponent(desc)}`, req.nextUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/sjalfsali?error=no_code`, req.nextUrl.origin));
  }

  if (!state || state !== storedState) {
    console.error("State mismatch — stored:", storedState, "received:", state);
    return NextResponse.redirect(new URL(`/sjalfsali?error=invalid_state`, req.nextUrl.origin));
  }

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL(`/sjalfsali?error=token_failed`, req.nextUrl.origin));
  }

  const tokens = await tokenRes.json();

  // Decode the ID token payload (JWT, no need to verify signature here — Kenni is trusted)
  const idToken = tokens.id_token as string;
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());

  const kennitala: string = payload.national_id ?? payload.kennitala ?? "";
  const name: string = payload.name ?? `${payload.given_name ?? ""} ${payload.family_name ?? ""}`.trim();

  if (!kennitala) {
    return NextResponse.redirect(new URL(`/sjalfsali?error=no_kennitala`, req.nextUrl.origin));
  }

  const age = ageFromKennitala(kennitala);

  if (age < MIN_AGE) {
    return NextResponse.redirect(new URL(`/sjalfsali?error=too_young&age=${age}&min=${MIN_AGE}`, req.nextUrl.origin));
  }

  // Store verified identity in a cookie — user proceeds to selfie step
  const pending = Buffer.from(JSON.stringify({ name, kennitala, age })).toString("base64");
  cookieStore.set("sjalfsali_pending", pending, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 1800, // 30 minutes to upload selfie
    path: "/",
    sameSite: "lax",
  });

  return NextResponse.redirect(new URL("/sjalfsali/selfie", req.nextUrl.origin));
}
