import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildGamePgn } from "@/lib/pgn";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function hasSideMoved(
  moves: { moveNumber: number }[],
  side: "white" | "black"
) {
  return moves.some((move) =>
    side === "white" ? move.moveNumber % 2 === 1 : move.moveNumber % 2 === 0
  );
}

function getPlayerSide(
  game: { whitePlayerId: string | null; blackPlayerId: string | null },
  userId: string
): "white" | "black" | null {
  if (game.whitePlayerId === userId) return "white";
  if (game.blackPlayerId === userId) return "black";
  return null;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

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

  const playerSide = getPlayerSide(game, currentUser.id);

  if (!playerSide) {
    return NextResponse.json(
      { ok: false, error: "Only players can abort a game" },
      { status: 403 }
    );
  }

  if (game.status === "finished") {
    return NextResponse.json(
      { ok: false, error: "Game already finished" },
      { status: 400 }
    );
  }

  if (hasSideMoved(game.moves, playerSide)) {
    return NextResponse.json(
      { ok: false, error: "You can only abort before making your first move" },
      { status: 400 }
    );
  }

  let nextPgn: string;

  try {
    nextPgn = buildGamePgn({
      initialFen: game.initialFen,
      moves: game.moves.map((m) => ({ uci: m.uci })),
      whiteName: game.whitePlayer?.username,
      blackName: game.blackPlayer?.username,
      result: "*",
      createdAt: game.createdAt,
    });
  } catch (error) {
    console.error("Failed to build PGN in abort route", {
      gameId: game.id,
      initialFen: game.initialFen,
      existingMoves: game.moves.map((m) => m.uci),
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to save PGN for abort" },
      { status: 500 }
    );
  }

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      status: "finished",
      result: "aborted",
      pgn: nextPgn,
      finishedAt: new Date(),
      turnStartedAt: null,
      drawOfferedBySide: null,
      drawOfferedAt: null,
    },
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
      game: updatedGame,
    });
  }

  return NextResponse.json({
    ok: true,
    game: updatedGame,
  });
}