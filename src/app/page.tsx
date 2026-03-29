"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CurrentUser = {
  id: string;
  username: string;
  phoneNumber: string;
};

type MeResponse = {
  ok: boolean;
  user: CurrentUser | null;
};

type CreateGameResponse = {
  ok: boolean;
  error?: string;
  creatorSide?: "white" | "black";
  game?: {
    id: string;
  };
  links?: {
    yourGame: string;
    invite: string;
    spectator: string;
  };
};

export default function HomePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [gameInfo, setGameInfo] = useState<null | {
    gameId: string;
    creatorSide: "white" | "black";
    yourGame: string;
    invite: string;
    spectator: string;
  }>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data: MeResponse = await response.json();

        console.log("me response", data);

        setUser(data.user);
      } catch (err) {
        console.error("failed to load current user", err);
      } finally {
        setLoadingUser(false);
      }
    }

    void loadUser();
  }, []);

  async function handleCreateGame() {
    try {
      setIsCreating(true);
      setError("");
      setGameInfo(null);

      const response = await fetch("/api/games/create", {
        method: "POST",
      });

      const data: CreateGameResponse = await response.json();

      console.log("create game response", data);

      if (!response.ok || !data.ok || !data.links || !data.creatorSide || !data.game) {
        setError(data.error ?? "Failed to create game");
        return;
      }

      setGameInfo({
        gameId: data.game.id,
        creatorSide: data.creatorSide,
        yourGame: data.links.yourGame,
        invite: data.links.invite,
        spectator: data.links.spectator,
      });
    } catch (err) {
      console.error("failed to create game", err);
      setError("Failed to create game");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-6">
      <div className="w-full rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-bold">Online Chess IR</h1>
        <p className="mt-3 text-gray-600">
          Multiplayer chess for Iranian players.
        </p>

        <div className="mt-6 space-y-4">
          {loadingUser ? (
            <p>Loading...</p>
          ) : user ? (
            <>
              <p className="text-sm text-gray-700">
                Logged in as <span className="font-semibold">{user.username}</span>
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleCreateGame}
                  disabled={isCreating}
                  className="rounded-xl bg-black px-6 py-3 text-white disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create Game"}
                </button>

                <form action="/api/auth/logout" method="post">
                  <button className="rounded-xl border px-6 py-3">
                    Log out
                  </button>
                </form>
              </div>
            </>
          ) : (
            <Link
              href="/auth/phone"
              className="inline-block rounded-xl bg-black px-6 py-3 text-white"
            >
              Sign in with phone
            </Link>
          )}
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {gameInfo ? (
          <div className="mt-6 rounded-2xl bg-gray-100 p-4 text-sm">
            <p className="font-semibold">
              You were assigned: {gameInfo.creatorSide === "white" ? "White" : "Black"}
            </p>

            <p className="mt-2 break-all text-xs text-gray-600">
              Game ID: {gameInfo.gameId}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <p className="font-medium">Your game link</p>
                <a
                  className="break-all text-blue-600 underline"
                  href={gameInfo.yourGame}
                >
                  {origin + gameInfo.yourGame}
                </a>
              </div>

              <div>
                <p className="font-medium">Invite link for opponent</p>
                <a
                  className="break-all text-blue-600 underline"
                  href={gameInfo.invite}
                >
                  {origin + gameInfo.invite}
                </a>
              </div>

              <div>
                <p className="font-medium">Spectator link</p>
                <a
                  className="break-all text-blue-600 underline"
                  href={gameInfo.spectator}
                >
                  {origin + gameInfo.spectator}
                </a>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <Link href="/games" className="text-blue-600 underline">
            View game history
          </Link>
        </div>
      </div>
    </main>
  );
}