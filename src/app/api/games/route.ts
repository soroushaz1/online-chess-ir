import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  const games = await prisma.game.findMany({
    where: {
      status: "finished",
      OR: [
        { whitePlayerId: currentUser.id },
        { blackPlayerId: currentUser.id },
      ],
    },
    orderBy: { finishedAt: "desc" },
    include: {
      whitePlayer: {
        select: { id: true, username: true },
      },
      blackPlayer: {
        select: { id: true, username: true },
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