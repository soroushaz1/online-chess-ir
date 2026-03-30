import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  await prisma.matchmakingQueue.deleteMany({
    where: { userId: currentUser.id },
  });

  return NextResponse.json({
    ok: true,
    status: "idle",
  });
}