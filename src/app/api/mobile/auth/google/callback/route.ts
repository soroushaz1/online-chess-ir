import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMobileExchangeCode } from "@/lib/auth";

const MOBILE_OAUTH_STATE_COOKIE = "mobile_google_oauth_state";
const MOBILE_OAUTH_VERIFIER_COOKIE = "mobile_google_oauth_verifier";
const COOKIE_PATH = "/api/mobile/auth/google";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeUsername(value: string) {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  return normalized || "player";
}

async function uniqueUsername(email: string, name?: string) {
  const emailPrefix = email.split("@")[0] || "player";
  const base = normalizeUsername(name || emailPrefix);

  let candidate = base;
  let suffix = 1;

  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    const tail = `_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 24 - tail.length))}${tail}`;
    suffix += 1;
  }

  return candidate;
}

function createAppRedirect(params: Record<string, string>) {
  const configured = process.env.MOBILE_APP_REDIRECT_URI || "onlinechess://auth";
  const url = new URL(configured);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function redirectToApp(params: Record<string, string>) {
  // Build the redirect manually so custom app schemes are preserved.
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: createAppRedirect(params).toString(),
      "Cache-Control": "no-store",
    },
  });
}

function clearOAuthCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(MOBILE_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: COOKIE_PATH,
    expires: new Date(0),
  });

  response.cookies.set(MOBILE_OAUTH_VERIFIER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: COOKIE_PATH,
    expires: new Date(0),
  });
}

function failure(error: string) {
  const response = redirectToApp({ error });
  clearOAuthCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get(MOBILE_OAUTH_STATE_COOKIE)?.value;
  const verifier = cookieStore.get(MOBILE_OAUTH_VERIFIER_COOKIE)?.value;

  if (
    oauthError ||
    !code ||
    !returnedState ||
    !storedState ||
    !verifier ||
    !safeEqual(returnedState, storedState)
  ) {
    return failure("google_auth_failed");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_MOBILE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return failure("google_not_configured");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Mobile Google token exchange failed", tokenData.error);
      return failure("google_token_exchange_failed");
    }

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        cache: "no-store",
      }
    );

    const profile = (await userInfoResponse.json()) as GoogleUserInfo;

    if (
      !userInfoResponse.ok ||
      !profile.sub ||
      !profile.email ||
      profile.email_verified !== true
    ) {
      console.error("Mobile Google user info validation failed");
      return failure("google_profile_invalid");
    }

    const email = profile.email.toLowerCase();

    let user = await prisma.user.findUnique({
      where: { googleId: profile.sub },
    });

    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.sub,
          email,
          name: profile.name ?? null,
          avatarUrl: profile.picture ?? null,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          username: await uniqueUsername(email, profile.name),
          googleId: profile.sub,
          email,
          name: profile.name ?? null,
          avatarUrl: profile.picture ?? null,
        },
      });
    }

    const exchange = await createMobileExchangeCode(user.id);

    const response = redirectToApp({
      code: exchange.token,
    });

    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("Mobile Google OAuth callback failed", error);
    return failure("google_auth_failed");
  }
}
