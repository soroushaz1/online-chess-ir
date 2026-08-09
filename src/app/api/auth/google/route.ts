import crypto from "node:crypto";
import { NextResponse } from "next/server";

const OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_VERIFIER_COOKIE = "google_oauth_verifier";

function base64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { ok: false, error: "Google OAuth is not configured" },
      { status: 500 }
    );
  }

  const state = base64Url(crypto.randomBytes(32));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(
    crypto.createHash("sha256").update(verifier).digest()
  );

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  });

  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
