import { notFound, redirect } from "next/navigation";
import GameReviewBoard from "@/components/GameReviewBoard";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReviewPage({ params }: PageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/auth/phone");
  }

  const { id } = await params;

  const game = await prisma.game.findUnique({
    where: { id },
    select: {
      id: true,
      initialFen: true,
      currentFen: true,
      status: true,
      result: true,
      pgn: true,
      analysisStatus: true,
      analysisError: true,
      whitePlayerId: true,
      blackPlayerId: true,
      whitePlayer: {
        select: {
          username: true,
        },
      },
      blackPlayer: {
        select: {
          username: true,
        },
      },
      moves: {
        orderBy: {
          moveNumber: "asc",
        },
        select: {
          id: true,
          moveNumber: true,
          san: true,
          uci: true,
          fenAfter: true,
        },
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
    notFound();
  }

  const canAccess =
    game.whitePlayerId === currentUser.id || game.blackPlayerId === currentUser.id;

  if (!canAccess) {
    redirect("/games");
  }

  if (game.status !== "finished") {
    redirect(`/game/${id}`);
  }

  return <GameReviewBoard key={game.id} game={game} />;
}