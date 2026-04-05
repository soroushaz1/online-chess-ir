import { prisma } from "@/lib/prisma";

type RatedResult = "1-0" | "0-1" | "1/2-1/2";

const RATED_RESULTS = new Set<RatedResult>(["1-0", "0-1", "1/2-1/2"]);

function expectedScore(playerRating: number, opponentRating: number) {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

function getScores(result: RatedResult) {
  if (result === "1-0") {
    return { whiteScore: 1, blackScore: 0 };
  }

  if (result === "0-1") {
    return { whiteScore: 0, blackScore: 1 };
  }

  return { whiteScore: 0.5, blackScore: 0.5 };
}

function getKFactor() {
  return 32;
}

export async function applyRatingForFinishedGame(gameId: string) {
  return prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        whitePlayer: {
          select: {
            id: true,
            username: true,
            phoneNumber: true,
            rating: true,
          },
        },
        blackPlayer: {
          select: {
            id: true,
            username: true,
            phoneNumber: true,
            rating: true,
          },
        },
        moves: {
          orderBy: { moveNumber: "asc" },
        },
      },
    });

    if (!game) {
      throw new Error("Game not found");
    }

    if (
      !game.rated ||
      game.status !== "finished" ||
      !game.result ||
      !RATED_RESULTS.has(game.result as RatedResult) ||
      !game.whitePlayerId ||
      !game.blackPlayerId ||
      !game.whitePlayer ||
      !game.blackPlayer ||
      game.ratingProcessedAt
    ) {
      return game;
    }

    const result = game.result as RatedResult;

    const whiteBefore = game.whiteRatingBefore ?? game.whitePlayer.rating;
    const blackBefore = game.blackRatingBefore ?? game.blackPlayer.rating;

    const { whiteScore } = getScores(result);

    const whiteExpected = expectedScore(whiteBefore, blackBefore);
    const whiteDelta = Math.round(getKFactor() * (whiteScore - whiteExpected));
    const blackDelta = -whiteDelta;

    const whiteAfter = Math.max(100, whiteBefore + whiteDelta);
    const blackAfter = Math.max(100, blackBefore + blackDelta);

    await tx.user.update({
      where: { id: game.whitePlayerId },
      data: { rating: whiteAfter },
    });

    await tx.user.update({
      where: { id: game.blackPlayerId },
      data: { rating: blackAfter },
    });

    return tx.game.update({
      where: { id: game.id },
      data: {
        whiteRatingBefore: whiteBefore,
        blackRatingBefore: blackBefore,
        whiteRatingAfter: whiteAfter,
        blackRatingAfter: blackAfter,
        whiteRatingDelta: whiteDelta,
        blackRatingDelta: blackDelta,
        ratingProcessedAt: new Date(),
      },
      include: {
        whitePlayer: {
          select: {
            id: true,
            username: true,
            phoneNumber: true,
            rating: true,
          },
        },
        blackPlayer: {
          select: {
            id: true,
            username: true,
            phoneNumber: true,
            rating: true,
          },
        },
        moves: {
          orderBy: { moveNumber: "asc" },
        },
      },
    });
  });
}