import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const KENNI_ISSUER = process.env.KENNI_ISSUER ?? "https://idp.kenni.is/hlidarkaup.netlify.app";
const AUTH_ENDPOINT = `${KENNI_ISSUER}/oidc/auth`;
const CLIENT_ID = process.env.KENNI_CLIENT_ID ?? "";
const REDIRECT_URI = process.env.KENNI_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/kenni/callback`;

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");

  // PKCE: generate code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile national_id",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const cookieStore = await cookies();
  cookieStore.set("kenni_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  // Store verifier so callback can use it in token exchange
  cookieStore.set("kenni_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });

  return NextResponse.redirect(`${AUTH_ENDPOINT}?${params}`);
}
