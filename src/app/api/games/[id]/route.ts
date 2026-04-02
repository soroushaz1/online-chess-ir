import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const game = await prisma.game.findUnique({
    where: { id },
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

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  const currentUser = await getCurrentUser();

  const isPlayer =
    !!currentUser &&
    (game.whitePlayerId === currentUser.id ||
      game.blackPlayerId === currentUser.id);

  if (game.status === "finished" && !currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  if (game.status === "finished" && !isPlayer) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this game" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    game,
  });
}