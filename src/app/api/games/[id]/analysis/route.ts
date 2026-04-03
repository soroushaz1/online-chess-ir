import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queueGameAnalysis } from "@/lib/game-analysis";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  const { id } = await params;

  const game = await prisma.game.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      whitePlayerId: true,
      blackPlayerId: true,
      analysisStatus: true,
      analysisStartedAt: true,
      analysisCompletedAt: true,
      analysisError: true,
      moves: {
        orderBy: { moveNumber: "asc" },
        select: { id: true },
      },
      analysisPositions: {
        orderBy: { ply: "asc" },
        select: {
          ply: true,
          fen: true,
          depthReached: true,
          scoreCp: true,
          mate: true,
          bestMoveUci: true,
          bestMoveSan: true,
          pv: true,
        },
      },
      analysisMoves: {
        orderBy: { moveNumber: "asc" },
        select: {
          moveId: true,
          moveNumber: true,
          classification: true,
          evalLossCp: true,
        },
      },
    },
  });

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  const canAccess =
    game.whitePlayerId === currentUser.id || game.blackPlayerId === currentUser.id;

  if (!canAccess) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this game" },
      { status: 403 }
    );
  }

  if (game.status !== "finished") {
    return NextResponse.json(
      { ok: false, error: "Game is not finished yet" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    analysis: {
      status: game.analysisStatus,
      startedAt: game.analysisStartedAt,
      completedAt: game.analysisCompletedAt,
      error: game.analysisError,
      totalPositions: game.moves.length + 1,
      analyzedPositions: game.analysisPositions.length,
      totalMoves: game.moves.length,
      analyzedMoves: game.analysisMoves.length,
      positions: game.analysisPositions,
      moves: game.analysisMoves,
    },
  });
}

export async function POST(_request: NextRequest, { params }: Params) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  const { id } = await params;

  const game = await prisma.game.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      whitePlayerId: true,
      blackPlayerId: true,
    },
  });

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  const canAccess =
    game.whitePlayerId === currentUser.id || game.blackPlayerId === currentUser.id;

  if (!canAccess) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this game" },
      { status: 403 }
    );
  }

  if (game.status !== "finished") {
    return NextResponse.json(
      { ok: false, error: "Game is not finished yet" },
      { status: 400 }
    );
  }

  queueGameAnalysis(id);

  return NextResponse.json({
    ok: true,
    queued: true,
  });
}