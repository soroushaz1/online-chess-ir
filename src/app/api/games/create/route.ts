import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Chess } from "chess.js";
import crypto from "node:crypto";

function createJoinToken() {
  return crypto.randomBytes(16).toString("hex");
}

export async function POST() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (users.length < 2) {
    return NextResponse.json(
      {
        ok: false,
        error: "You need at least 2 users in the database.",
      },
      { status: 400 }
    );
  }

  const chess = new Chess();
  const timeControlMs = 10 * 60 * 1000;
  const incrementSeconds = 0;

  const game = await prisma.game.create({
    data: {
      whitePlayerId: users[0].id,
      blackPlayerId: users[1].id,
      whiteJoinToken: createJoinToken(),
      blackJoinToken: createJoinToken(),
      initialFen: "start",
      currentFen: chess.fen(),
      pgn: chess.pgn(),
      status: "waiting",
      whiteConnected: false,
      blackConnected: false,
      rated: false,
      timeControlMs,
      incrementSeconds,
      whiteTimeMs: timeControlMs,
      blackTimeMs: timeControlMs,
      turnStartedAt: null,
    },
    include: {
      whitePlayer: {
        select: { id: true, username: true, email: true },
      },
      blackPlayer: {
        select: { id: true, username: true, email: true },
      },
      moves: {
        orderBy: { moveNumber: "asc" },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    game,
    links: {
      white: `/game/${game.id}?token=${game.whiteJoinToken}`,
      black: `/game/${game.id}?token=${game.blackJoinToken}`,
      spectator: `/game/${game.id}`,
    },
  });
}