import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    users,
  });
}