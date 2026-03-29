import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const games = await prisma.game.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      whitePlayer: {
        select: { id: true, username: true, email: true },
      },
      blackPlayer: {
        select: { id: true, username: true, email: true },
      },
      moves: {
        orderBy: { moveNumber: "asc" },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    games,
  });
}