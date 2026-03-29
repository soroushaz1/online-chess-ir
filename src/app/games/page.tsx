import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    orderBy: { createdAt: "desc" },
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
      <h1 className="text-3xl font-bold">Games</h1>

      <div className="mt-6 space-y-4">
        {games.length === 0 ? (
          <p>No games yet.</p>
        ) : (
          games.map((game) => (
            <div key={game.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="font-semibold">
                {game.whitePlayer.username} vs {game.blackPlayer.username}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Status: {game.status} | Result: {game.result ?? "in progress"}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Moves: {game.moves.length}
              </p>
              <p className="mt-1 text-xs text-gray-500 break-all">
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
          ))
        )}
      </div>
    </main>
  );
}