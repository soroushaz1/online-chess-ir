import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { deleteMobileSession } from "@/lib/auth";

export async function POST() {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (token) {
    await deleteMobileSession(token);
  }

  return NextResponse.json({ ok: true });
}
