import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildGamePgn } from "@/lib/pgn";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function getTurnFromFen(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

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
    select: { id: true, username: true },
  },
  blackPlayer: {
    select: { id: true, username: true },
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

export async function POST(_request: Request, { params }: Params) {
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
      { ok: false, error: "Only players can finalize timeout" },
      { status: 403 }
    );
  }

  if (game.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Game is not active", game },
      { status: 400 }
    );
  }

  const turn = getTurnFromFen(game.currentFen);
  const now = new Date();
  const turnStartedAt = game.turnStartedAt ?? game.createdAt;
  const elapsedMs = Math.max(
    0,
    now.getTime() - new Date(turnStartedAt).getTime()
  );

  let nextWhiteTimeMs = game.whiteTimeMs;
  let nextBlackTimeMs = game.blackTimeMs;

  if (turn === "white") {
    nextWhiteTimeMs = Math.max(0, game.whiteTimeMs - elapsedMs);
  } else {
    nextBlackTimeMs = Math.max(0, game.blackTimeMs - elapsedMs);
  }

  const expired = turn === "white" ? nextWhiteTimeMs <= 0 : nextBlackTimeMs <= 0;

  if (!expired) {
    return NextResponse.json(
      { ok: false, error: "Clock has not expired yet" },
      { status: 400 }
    );
  }

  const result = turn === "white" ? "0-1" : "1-0";

  let timeoutPgn: string;
  try {
    timeoutPgn = buildGamePgn({
      initialFen: game.initialFen,
      moves: game.moves.map((m) => ({ uci: m.uci })),
      whiteName: game.whitePlayer?.username,
      blackName: game.blackPlayer?.username,
      result,
      createdAt: game.createdAt,
    });
  } catch (error) {
    console.error("Failed to build PGN on timeout finalize", {
      gameId: game.id,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to save PGN on timeout" },
      { status: 500 }
    );
  }

  const updatedGame = await prisma.game.update({
    where: { id: game.id },
    data: {
      whiteTimeMs: nextWhiteTimeMs,
      blackTimeMs: nextBlackTimeMs,
      status: "finished",
      result,
      pgn: timeoutPgn,
      finishedAt: now,
      turnStartedAt: null,
      drawOfferedBySide: null,
      drawOfferedAt: null,
    },
    include: gameInclude,
  });

  emitGameUpdated(game.id, updatedGame);

  return NextResponse.json({
    ok: true,
    game: updatedGame,
  });
}