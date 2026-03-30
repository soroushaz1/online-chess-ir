import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({
      ok: true,
      loggedIn: false,
      status: "idle",
      gameId: null,
      hasActiveGame: false,
      activeGameId: null,
    });
  }

  const queueEntry = await prisma.matchmakingQueue.findUnique({
    where: { userId: currentUser.id },
  });

  const resumableGame = await prisma.game.findFirst({
    where: {
      OR: [
        {
          status: "active",
          OR: [
            { whitePlayerId: currentUser.id },
            { blackPlayerId: currentUser.id },
          ],
        },
        {
          status: "waiting",
          whitePlayerId: { not: null },
          blackPlayerId: { not: null },
          OR: [
            { whitePlayerId: currentUser.id },
            { blackPlayerId: currentUser.id },
          ],
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json({
    ok: true,
    loggedIn: true,
    status: queueEntry ? "searching" : "idle",
    gameId: null,
    hasActiveGame: !!resumableGame,
    activeGameId: resumableGame?.id ?? null,
  });
}