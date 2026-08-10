import { NextRequest, NextResponse } from "next/server";
import { exchangeMobileAuthCode } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const code =
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof (body as { code?: unknown }).code === "string"
      ? (body as { code: string }).code
      : null;

  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Missing exchange code" },
      { status: 400 }
    );
  }

  const result = await exchangeMobileAuthCode(code);

  if (!result) {
    return NextResponse.json(
      { ok: false, error: "Exchange code is invalid or expired" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    sessionToken: result.token,
    expiresAt: result.expiresAt.toISOString(),
    user: {
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      name: result.user.name,
      avatarUrl: result.user.avatarUrl,
      rating: result.user.rating,
    },
  });
}
