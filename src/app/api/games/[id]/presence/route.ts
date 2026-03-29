import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const body = await request.json();
  const { side, connected } = body as {
    side?: "white" | "black";
    connected?: boolean;
  };

  if (!side || typeof connected !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Missing side or connected" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { id },
  });

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  const nextWhiteConnected =
    side === "white" ? connected : game.whiteConnected;
  const nextBlackConnected =
    side === "black" ? connected : game.blackConnected;

  const shouldActivate =
    game.status === "waiting" && nextWhiteConnected && nextBlackConnected;

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      whiteConnected: nextWhiteConnected,
      blackConnected: nextBlackConnected,
      status: shouldActivate ? "active" : game.status,
      turnStartedAt: shouldActivate ? new Date() : game.turnStartedAt,
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