import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function getPlayerSide(
  game: { whitePlayerId: string | null; blackPlayerId: string | null },
  userId: string
): "white" | "black" | null {
  if (game.whitePlayerId === userId) return "white";
  if (game.blackPlayerId === userId) return "black";
  return null;
}

const gameInclude = {
  whitePlayer: {
    select: { id: true, username: true, phoneNumber: true },
  },
  blackPlayer: {
    select: { id: true, username: true, phoneNumber: true },
  },
  moves: {
    orderBy: { moveNumber: "asc" as const },
  },
};

function emitGameUpdated(id: string, game: unknown) {
  const io = (globalThis as typeof globalThis & {
    io?: {
      to: (room: string) => {
        emit: (event: string, payload: unknown) => void;
      };
    };
  }).io;

  if (io) {
    io.to(`game:${id}`).emit("game:updated", {
      gameId: id,
      game,
    });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { connected } = body as {
    connected?: boolean;
  };

  if (typeof connected !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Missing connected" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { id },
    include: gameInclude,
  });

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  const playerSide = getPlayerSide(game, currentUser.id);

  if (!playerSide) {
    return NextResponse.json(
      { ok: false, error: "Only players can update presence" },
      { status: 403 }
    );
  }

  const nextWhiteConnected =
    playerSide === "white" ? connected : game.whiteConnected;
  const nextBlackConnected =
    playerSide === "black" ? connected : game.blackConnected;

  const bothSeatsFilled = !!game.whitePlayerId && !!game.blackPlayerId;

  const shouldActivate =
    game.status === "waiting" &&
    bothSeatsFilled &&
    nextWhiteConnected &&
    nextBlackConnected;

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      whiteConnected: nextWhiteConnected,
      blackConnected: nextBlackConnected,
      status: shouldActivate ? "active" : game.status,
      turnStartedAt: shouldActivate
        ? game.turnStartedAt ?? new Date()
        : game.turnStartedAt,
    },
    include: gameInclude,
  });

  emitGameUpdated(id, updatedGame);

  return NextResponse.json({
    ok: true,
    game: updatedGame,
  });
}