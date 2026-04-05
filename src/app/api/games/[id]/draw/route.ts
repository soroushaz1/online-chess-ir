import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { applyRatingForFinishedGame } from "@/lib/rating";
import { buildGamePgn } from "@/lib/pgn";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type DrawAction = "offer" | "accept" | "reject";

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
    select: {
      id: true,
      username: true,
      phoneNumber: true,
      rating: true,
    },
  },
  blackPlayer: {
    select: {
      id: true,
      username: true,
      phoneNumber: true,
      rating: true,
    },
  },
  moves: {
    orderBy: { moveNumber: "asc" as const },
  },
};

function emitGameUpdated(gameId: string, game: unknown) {
  const io = (globalThis as typeof globalThis & {
    io?: {
      to: (room: string) => {
        emit: (event: string, payload: unknown) => void;
      };
    };
  }).io;

  if (io) {
    io.to(`game:${gameId}`).emit("game:updated", {
      gameId,
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

  const body = (await request.json().catch(() => ({}))) as {
    action?: DrawAction;
  };

  const action = body.action;
  if (!action || !["offer", "accept", "reject"].includes(action)) {
    return NextResponse.json(
      { ok: false, error: "Invalid draw action" },
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
      { ok: false, error: "Only players can use draw actions" },
      { status: 403 }
    );
  }

  if (game.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Game is not active" },
      { status: 400 }
    );
  }

  if (!game.whitePlayerId || !game.blackPlayerId) {
    return NextResponse.json(
      { ok: false, error: "Both players must be present" },
      { status: 400 }
    );
  }

  if (action === "offer") {
    if (game.drawOfferedBySide) {
      return NextResponse.json(
        { ok: false, error: "There is already a pending draw offer" },
        { status: 400 }
      );
    }

    const updatedGame = await prisma.game.update({
      where: { id },
      data: {
        drawOfferedBySide: playerSide,
        drawOfferedAt: new Date(),
      },
      include: gameInclude,
    });

    emitGameUpdated(id, updatedGame);

    return NextResponse.json({
      ok: true,
      game: updatedGame,
    });
  }

  if (!game.drawOfferedBySide) {
    return NextResponse.json(
      { ok: false, error: "There is no pending draw offer" },
      { status: 400 }
    );
  }

  if (game.drawOfferedBySide === playerSide) {
    return NextResponse.json(
      { ok: false, error: "You cannot respond to your own draw offer" },
      { status: 400 }
    );
  }

  if (action === "reject") {
    const updatedGame = await prisma.game.update({
      where: { id },
      data: {
        drawOfferedBySide: null,
        drawOfferedAt: null,
      },
      include: gameInclude,
    });

    emitGameUpdated(id, updatedGame);

    return NextResponse.json({
      ok: true,
      game: updatedGame,
    });
  }

  let nextPgn: string;
  try {
    nextPgn = buildGamePgn({
      initialFen: game.initialFen,
      moves: game.moves.map((m) => ({ uci: m.uci })),
      whiteName: game.whitePlayer?.username,
      blackName: game.blackPlayer?.username,
      result: "1/2-1/2",
      createdAt: game.createdAt,
    });
  } catch (error) {
    console.error("Failed to build PGN in draw route", {
      gameId: game.id,
      initialFen: game.initialFen,
      existingMoves: game.moves.map((m) => m.uci),
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to save PGN for draw" },
      { status: 500 }
    );
  }

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      status: "finished",
      result: "1/2-1/2",
      pgn: nextPgn,
      finishedAt: new Date(),
      turnStartedAt: null,
      drawOfferedBySide: null,
      drawOfferedAt: null,
    },
    include: gameInclude,
  });

  const finalGame = await applyRatingForFinishedGame(updatedGame.id);

  emitGameUpdated(id, finalGame);

  return NextResponse.json({
    ok: true,
    game: finalGame,
  });
}