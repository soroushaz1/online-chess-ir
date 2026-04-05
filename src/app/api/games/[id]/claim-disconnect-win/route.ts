import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildGamePgn } from "@/lib/pgn";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const CLAIM_AFTER_MS = 60_000;
const CLAIM_GRACE_MS = 1_000;

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
      { ok: false, error: "Only players can claim inactivity wins" },
      { status: 403 }
    );
  }

  if (game.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Game is not active" },
      { status: 400 }
    );
  }

  const currentTurn = getTurnFromFen(game.currentFen);

  if (currentTurn === playerSide) {
    return NextResponse.json(
      {
        ok: false,
        error: "Claim is only available when it is your opponent's turn",
      },
      { status: 400 }
    );
  }

  if (!game.turnStartedAt) {
    return NextResponse.json(
      {
        ok: false,
        error: "Turn timer is not available",
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const turnStartedAtMs = new Date(game.turnStartedAt).getTime();
  const elapsedMs = now.getTime() - turnStartedAtMs;
  const availableInMs = Math.max(0, CLAIM_AFTER_MS - elapsedMs);

  if (elapsedMs + CLAIM_GRACE_MS < CLAIM_AFTER_MS) {
    return NextResponse.json(
      {
        ok: false,
        error: "Claim is not available yet",
        availableInMs,
      },
      { status: 400 }
    );
  }

  const result = playerSide === "white" ? "1-0" : "0-1";

  let nextPgn: string;
  try {
    nextPgn = buildGamePgn({
      initialFen: game.initialFen,
      moves: game.moves.map((m) => ({ uci: m.uci })),
      whiteName: game.whitePlayer?.username,
      blackName: game.blackPlayer?.username,
      result,
      createdAt: game.createdAt,
    });
  } catch (error) {
    console.error("Failed to build PGN on inactivity claim", {
      gameId: game.id,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to save PGN for inactivity claim" },
      { status: 500 }
    );
  }

  const updatedGame = await prisma.game.update({
    where: { id: game.id },
    data: {
      status: "finished",
      result,
      pgn: nextPgn,
      finishedAt: now,
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

  emitGameUpdated(id, updatedGame);

  return NextResponse.json({
    ok: true,
    game: updatedGame,
  });
}