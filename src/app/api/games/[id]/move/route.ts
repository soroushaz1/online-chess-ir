import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildGamePgn, replayGameFromInitialFen } from "@/lib/pgn";
import { queueGameAnalysis } from "@/lib/game-analysis";

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
  const { from, to, promotion } = body as {
    from?: string;
    to?: string;
    promotion?: "q" | "r" | "b" | "n";
  };

  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: "Missing 'from' or 'to'" },
      { status: 400 }
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
      { ok: false, error: "Only players can make moves" },
      { status: 403 }
    );
  }

  if (game.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Game is not active" },
      { status: 400 }
    );
  }

  const movingSide = getTurnFromFen(game.currentFen);

  if (movingSide !== playerSide) {
    return NextResponse.json(
      { ok: false, error: "It is not your turn" },
      { status: 403 }
    );
  }

  let chess;
  try {
    chess = replayGameFromInitialFen(
      game.initialFen,
      game.moves.map((m) => ({ uci: m.uci }))
    );
  } catch (error) {
    console.error("Failed to replay game before move", {
      gameId: game.id,
      initialFen: game.initialFen,
      existingMoves: game.moves.map((m) => m.uci),
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Stored game history is invalid" },
      { status: 500 }
    );
  }

  const now = new Date();
  const turnStartedAt = game.turnStartedAt ?? game.createdAt;
  const elapsedMs = Math.max(
    0,
    now.getTime() - new Date(turnStartedAt).getTime()
  );

  let nextWhiteTimeMs = game.whiteTimeMs;
  let nextBlackTimeMs = game.blackTimeMs;

  if (movingSide === "white") {
    nextWhiteTimeMs = Math.max(0, game.whiteTimeMs - elapsedMs);
  } else {
    nextBlackTimeMs = Math.max(0, game.blackTimeMs - elapsedMs);
  }

  if (nextWhiteTimeMs <= 0 || nextBlackTimeMs <= 0) {
    const result = nextWhiteTimeMs <= 0 ? "0-1" : "1-0";

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
      console.error("Failed to build PGN on timeout", {
        gameId: game.id,
        initialFen: game.initialFen,
        existingMoves: game.moves.map((m) => m.uci),
        error,
      });

      return NextResponse.json(
        { ok: false, error: "Failed to save PGN on timeout" },
        { status: 500 }
      );
    }

    const timedOutGame = await prisma.game.update({
      where: { id: game.id },
      data: {
        whiteTimeMs: nextWhiteTimeMs,
        blackTimeMs: nextBlackTimeMs,
        status: "finished",
        result,
        pgn: timeoutPgn,
        finishedAt: now,
        turnStartedAt: null,
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
      io.to(`game:${game.id}`).emit("game:updated", {
        gameId: game.id,
        game: timedOutGame,
      });
    }

    queueGameAnalysis(game.id);

    return NextResponse.json(
      { ok: false, error: "Time out", game: timedOutGame },
      { status: 400 }
    );
  }

  const move = chess.move({
    from,
    to,
    promotion: promotion ?? "q",
  });

  if (!move) {
    return NextResponse.json(
      { ok: false, error: "Illegal move" },
      { status: 400 }
    );
  }

  if (movingSide === "white") {
    nextWhiteTimeMs += game.incrementSeconds * 1000;
  } else {
    nextBlackTimeMs += game.incrementSeconds * 1000;
  }

  const nextStatus = chess.isGameOver() ? "finished" : "active";

  const nextResult = chess.isCheckmate()
    ? chess.turn() === "w"
      ? "0-1"
      : "1-0"
    : chess.isDraw()
      ? "1/2-1/2"
      : null;

  const moveNumber = game.moves.length + 1;

  let nextPgn: string;

  try {
    nextPgn = buildGamePgn({
      initialFen: game.initialFen,
      moves: [
        ...game.moves.map((m) => ({ uci: m.uci })),
        { uci: move.from + move.to + (move.promotion ?? "") },
      ],
      whiteName: game.whitePlayer?.username,
      blackName: game.blackPlayer?.username,
      result: nextResult ?? "*",
      createdAt: game.createdAt,
    });
  } catch (error) {
    console.error("Failed to build PGN in move route", {
      gameId: game.id,
      initialFen: game.initialFen,
      move: move.from + move.to + (move.promotion ?? ""),
      existingMoves: game.moves.map((m) => m.uci),
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to save PGN for this move" },
      { status: 500 }
    );
  }

  await prisma.$transaction([
    prisma.move.create({
      data: {
        gameId: game.id,
        moveNumber,
        san: move.san,
        uci: move.from + move.to + (move.promotion ?? ""),
        fenAfter: chess.fen(),
      },
    }),
    prisma.game.update({
      where: { id: game.id },
      data: {
        currentFen: chess.fen(),
        pgn: nextPgn,
        status: nextStatus,
        result: nextResult,
        finishedAt: nextStatus === "finished" ? now : null,
        whiteTimeMs: nextWhiteTimeMs,
        blackTimeMs: nextBlackTimeMs,
        turnStartedAt: nextStatus === "active" ? now : null,
      },
    }),
  ]);

  const updatedGame = await prisma.game.findUnique({
    where: { id: game.id },
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

  if (io && updatedGame) {
    io.to(`game:${game.id}`).emit("game:updated", {
      gameId: game.id,
      game: updatedGame,
    });
  }

  if (updatedGame?.status === "finished") {
    queueGameAnalysis(updatedGame.id);
  }

  return NextResponse.json({
    ok: true,
    move: {
      san: move.san,
      uci: move.from + move.to + (move.promotion ?? ""),
      fen: chess.fen(),
      pgn: nextPgn,
    },
    game: updatedGame,
  });
}