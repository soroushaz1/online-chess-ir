import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const MESSAGE_MAX_LENGTH = 300;

async function getAccessibleGame(id: string) {
  return prisma.game.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      whitePlayerId: true,
      blackPlayerId: true,
    },
  });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const game = await getAccessibleGame(id);

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  const currentUser = await getCurrentUser();

  const isPlayer =
    !!currentUser &&
    (game.whitePlayerId === currentUser.id ||
      game.blackPlayerId === currentUser.id);

  if (game.status === "finished" && !currentUser) {
    return NextResponse.json(
      { ok: false, error: "You must be logged in" },
      { status: 401 }
    );
  }

  if (game.status === "finished" && !isPlayer) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this chat" },
      { status: 403 }
    );
  }

  const messages = await prisma.gameChatMessage.findMany({
    where: { gameId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    messages: [...messages].reverse(),
  });
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

  const game = await getAccessibleGame(id);

  if (!game) {
    return NextResponse.json(
      { ok: false, error: "Game not found" },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
  };

  const text = body.text?.trim() ?? "";

  if (!text) {
    return NextResponse.json(
      { ok: false, error: "Message cannot be empty" },
      { status: 400 }
    );
  }

  if (text.length > MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Message is too long (max ${MESSAGE_MAX_LENGTH})` },
      { status: 400 }
    );
  }

  const message = await prisma.gameChatMessage.create({
    data: {
      gameId: id,
      userId: currentUser.id,
      text,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
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
    io.to(`game:${id}`).emit("chat:new-message", {
      gameId: id,
      message,
    });
  }

  return NextResponse.json({
    ok: true,
    message,
  });
}