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
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          rating: user.rating,
        }
      : null,
  });
}
