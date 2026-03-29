import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Chess } from "chess.js";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/auth";

function createJoinToken() {
  return crypto.randomBytes(16).toString("hex");
}

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

  const chess = new Chess();
  const creatorSide = pickRandomSide();
  const timeControlMs = 10 * 60 * 1000;
  const incrementSeconds = 0;

  const whitePlayerId = creatorSide === "white" ? currentUser.id : null;
  const blackPlayerId = creatorSide === "black" ? currentUser.id : null;

  const whiteJoinToken = creatorSide === "black" ? createJoinToken() : null;
  const blackJoinToken = creatorSide === "white" ? createJoinToken() : null;

  const game = await prisma.game.create({
    data: {
      whitePlayerId,
      blackPlayerId,
      whiteJoinToken,
      blackJoinToken,
      initialFen: "start",
      currentFen: chess.fen(),
      pgn: chess.pgn(),
      status: "waiting",
      rated: false,
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
        select: { id: true, username: true, phoneNumber: true },
      },
      blackPlayer: {
        select: { id: true, username: true, phoneNumber: true },
      },
      moves: {
        orderBy: { moveNumber: "asc" },
      },
    },
  });

  const yourLink = `/game/${game.id}`;
  const inviteLink =
    creatorSide === "white"
      ? `/game/${game.id}?token=${game.blackJoinToken}`
      : `/game/${game.id}?token=${game.whiteJoinToken}`;


  console.log("created game", {
    gameId: game.id,
    creatorSide,
    whitePlayerId: game.whitePlayerId,
    blackPlayerId: game.blackPlayerId,
    whiteJoinToken: game.whiteJoinToken,
    blackJoinToken: game.blackJoinToken,
  });

  return NextResponse.json({
    ok: true,
    game,
    creatorSide,
    links: {
      yourGame: yourLink,
      invite: inviteLink,
      spectator: `/game/${game.id}`,
    },
  });
}