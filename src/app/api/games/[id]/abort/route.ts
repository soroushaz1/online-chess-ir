import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

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

  if (game.moves.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Only games with no moves can be aborted" },
      { status: 400 }
    );
  }

  if (game.status === "finished") {
    return NextResponse.json(
      { ok: false, error: "Game already finished" },
      { status: 400 }
    );
  }

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      status: "finished",
      result: "aborted",
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