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
  const { side } = body as {
    side?: "white" | "black";
  };

  if (!side) {
    return NextResponse.json(
      { ok: false, error: "Missing side" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { id },
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

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  if (game.status !== "active" && game.status !== "waiting") {
    return NextResponse.json(
      { ok: false, error: "Game cannot be resigned" },
      { status: 400 }
    );
  }

  const result = side === "white" ? "0-1" : "1-0";

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      status: "finished",
      result,
      finishedAt: new Date(),
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