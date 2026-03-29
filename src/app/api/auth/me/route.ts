import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();

  return NextResponse.json({
    ok: true,
    user: user
      ? {
          id: user.id,
          username: user.username,
          phoneNumber: user.phoneNumber,
          phoneVerifiedAt: user.phoneVerifiedAt,
        }
      : null,
  });
}