import crypto from "node:crypto";
import { NextResponse } from "next/server";

const MOBILE_OAUTH_STATE_COOKIE = "mobile_google_oauth_state";
const MOBILE_OAUTH_VERIFIER_COOKIE = "mobile_google_oauth_verifier";
const COOKIE_PATH = "/api/mobile/auth/google";

function base64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_MOBILE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        ok: false,
        error: "Mobile Google OAuth is not configured",
      },
      { status: 500 }
    );
  }

  const state = base64Url(crypto.randomBytes(32));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(
    crypto.createHash("sha256").update(verifier).digest()
  );

  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("client_id", clientId);
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("code_challenge", challenge);
  googleUrl.searchParams.set("code_challenge_method", "S256");
  googleUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(googleUrl);
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(MOBILE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: COOKIE_PATH,
    maxAge: 60 * 10,
  });

  response.cookies.set(MOBILE_OAUTH_VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: COOKIE_PATH,
    maxAge: 60 * 10,
  });

  return response;
}
