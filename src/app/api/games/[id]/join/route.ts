import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

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
  const { token } = body as {
    token?: string;
  };

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing token" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { id },
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

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  if (game.status === "finished") {
    return NextResponse.json(
      { ok: false, error: "Game already finished" },
      { status: 400 }
    );
  }

  if (game.whitePlayerId === currentUser.id || game.blackPlayerId === currentUser.id) {
    return NextResponse.json({
      ok: true,
      game,
    });
  }

  let data:
    | {
        whitePlayerId?: string;
        blackPlayerId?: string;
        status?: string;
        turnStartedAt?: Date | null;
      }
    | null = null;

  if (game.whiteJoinToken && token === game.whiteJoinToken) {
    if (game.whitePlayerId) {
      return NextResponse.json(
        { ok: false, error: "White seat already taken" },
        { status: 400 }
      );
    }

    data = {
      whitePlayerId: currentUser.id,
    };
  } else if (game.blackJoinToken && token === game.blackJoinToken) {
    if (game.blackPlayerId) {
      return NextResponse.json(
        { ok: false, error: "Black seat already taken" },
        { status: 400 }
      );
    }

    data = {
      blackPlayerId: currentUser.id,
    };
  } else {
    return NextResponse.json(
      { ok: false, error: "Invalid invite token" },
      { status: 400 }
    );
  }

  const nextWhitePlayerId = data.whitePlayerId ?? game.whitePlayerId;
  const nextBlackPlayerId = data.blackPlayerId ?? game.blackPlayerId;
  const shouldActivate = !!nextWhitePlayerId && !!nextBlackPlayerId;

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      ...data,
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