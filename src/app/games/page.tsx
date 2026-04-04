import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getRequestI18n } from "@/lib/request-i18n";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GamesPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/auth/phone");
  }

  const { t, language } = await getRequestI18n();

  const games = await prisma.game.findMany({
    where: {
      status: "finished",
      OR: [{ whitePlayerId: currentUser.id }, { blackPlayerId: currentUser.id }],
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

  const dateFormatter = new Intl.DateTimeFormat(
    language === "fa" ? "fa-IR" : "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-white hover:text-gray-900"
            >
              {t.home.title}
            </Link>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">
              {t.gamesHistory.title}
            </h1>
          </div>
        </div>

        {games.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-gray-600 shadow-sm ring-1 ring-gray-200">
            {t.gamesHistory.empty}
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => {
              const whiteName = game.whitePlayer?.username ?? t.gamesHistory.waiting;
              const blackName = game.blackPlayer?.username ?? t.gamesHistory.waiting;

              return (
                <div
                  key={game.id}
                  className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
                >
                  <h2 className="text-xl font-semibold text-gray-900">
                    {whiteName} vs {blackName}
                  </h2>

                  <div className="mt-3 space-y-1 text-sm text-gray-600">
                    <p>
                      {t.gamesHistory.result}: {game.result ?? t.gamesHistory.unknown}
                    </p>
                    <p>
                      {t.gamesHistory.moves}: {game.moves.length}
                    </p>
                    {game.finishedAt ? (
                      <p>
                        {t.gamesHistory.finishedAt}:{" "}
                        {dateFormatter.format(new Date(game.finishedAt))}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <Link
                      href={`/game/${game.id}`}
                      className="inline-flex rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
                    >
                      {t.gamesHistory.review}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}