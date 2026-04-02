import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    where: {
      status: "finished",
    },
    orderBy: {
      finishedAt: "desc",
    },
    include: {
      whitePlayer: {
        select: { username: true },
      },
      blackPlayer: {
        select: { username: true },
      },
      moves: {
        orderBy: { moveNumber: "asc" },
      },
    },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">Game History</h1>

      <div className="mt-6 space-y-4">
        {games.length === 0 ? (
          <p>No finished games yet.</p>
        ) : (
          games.map((game) => {
            const whiteName = game.whitePlayer?.username ?? "Waiting...";
            const blackName = game.blackPlayer?.username ?? "Waiting...";

            return (
              <div
                key={game.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <p className="font-semibold">
                  {whiteName} vs {blackName}
                </p>

                <p className="mt-1 text-sm text-gray-600">
                  Status: {game.status} | Result: {game.result ?? "unknown"}
                </p>

                <p className="mt-1 text-sm text-gray-600">
                  Rated: {game.rated ? "Yes" : "No"} | Moves: {game.moves.length}
                </p>

                <p className="mt-1 break-all text-xs text-gray-500">
                  Game ID: {game.id}
                </p>

                <div className="mt-3">
                  <Link
                    className="text-blue-600 underline"
                    href={`/game/${game.id}`}
                  >
                    Open as spectator
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
