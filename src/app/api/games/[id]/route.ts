import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
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

  return NextResponse.json({
    ok: true,
    game,
  });
}