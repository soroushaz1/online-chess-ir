import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Chess } from "chess.js";
import { getCurrentUser } from "@/lib/auth";

function pickRandomSide(): "white" | "black" {
  return Math.random() < 0.5 ? "white" : "black";
}

export async function POST() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  const existingQueueEntry = await prisma.matchmakingQueue.findUnique({
    where: { userId: currentUser.id },
  });

  if (existingQueueEntry) {
    return NextResponse.json({
      ok: true,
      status: "searching",
    });
  }

  const alreadyActiveGame = await prisma.game.findFirst({
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
  });

  if (alreadyActiveGame) {
    return NextResponse.json(
      { ok: false, error: "You already have a game in progress" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
  });

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "User not found" },
      { status: 404 }
    );
  }

  await prisma.matchmakingQueue.create({
    data: {
      userId: user.id,
      ratingSnapshot: user.rating,
    },
  });

  const queue = await prisma.matchmakingQueue.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      user: true,
    },
  });

  if (queue.length < 2) {
    return NextResponse.json({
      ok: true,
      status: "searching",
    });
  }

  const opponentEntry = queue.find((entry) => entry.userId !== user.id);

  if (!opponentEntry) {
    return NextResponse.json({
      ok: true,
      status: "searching",
    });
  }

  const chess = new Chess();
  const creatorSide = pickRandomSide();
  const timeControlMs = 10 * 60 * 1000;
  const incrementSeconds = 0;

  const whitePlayerId =
    creatorSide === "white" ? user.id : opponentEntry.userId;
  const blackPlayerId =
    creatorSide === "black" ? user.id : opponentEntry.userId;

  const game = await prisma.game.create({
    data: {
      whitePlayerId,
      blackPlayerId,
      whiteJoinToken: null,
      blackJoinToken: null,
      initialFen: "start",
      currentFen: chess.fen(),
      pgn: chess.pgn(),
      status: "waiting",
      rated: true,
      timeControlMs,
      incrementSeconds,
      whiteTimeMs: timeControlMs,
      blackTimeMs: timeControlMs,
      whiteConnected: false,
      blackConnected: false,
      turnStartedAt: null,
    },
    include: {
      whitePlayer: {
        select: { id: true, username: true, phoneNumber: true, rating: true },
      },
      blackPlayer: {
        select: { id: true, username: true, phoneNumber: true, rating: true },
      },
      moves: {
        orderBy: { moveNumber: "asc" },
      },
    },
  });

  await prisma.matchmakingQueue.deleteMany({
    where: {
      userId: {
        in: [user.id, opponentEntry.userId],
      },
    },
  });

  const io = (globalThis as typeof globalThis & {
    io?: {
      emit: (event: string, payload: unknown) => void;
      to: (room: string) => {
        emit: (event: string, payload: unknown) => void;
      };
    };
  }).io;

  if (io) {
    io.emit("matchmaking:matched", {
      gameId: game.id,
      userIds: [user.id, opponentEntry.userId],
    });

    io.to(`game:${game.id}`).emit("game:updated", {
      gameId: game.id,
      game,
    });
  }

  return NextResponse.json({
    ok: true,
    status: "matched",
    gameId: game.id,
  });
}