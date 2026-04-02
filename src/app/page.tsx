"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type CurrentUser = {
  id: string;
  username: string;
  phoneNumber: string;
  rating: number;
};

type MeResponse = {
  ok: boolean;
  user: CurrentUser | null;
};

type MatchmakingStatusResponse = {
  ok: boolean;
  loggedIn: boolean;
  status: "idle" | "searching";
  gameId: string | null;
  hasActiveGame: boolean;
  activeGameId: string | null;
};

type MatchmakingJoinResponse = {
  ok: boolean;
  error?: string;
  status?: "searching" | "matched";
  gameId?: string;
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
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [gameInfo, setGameInfo] = useState<null | {
    gameId: string;
    creatorSide: "white" | "black";
    yourGame: string;
    invite: string;
    spectator: string;
  }>(null);

  const wasSearchingRef = useRef(false);

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

  useEffect(() => {
    if (!user) return;

    async function checkStatus() {
      const response = await fetch("/api/matchmaking/status", {
        cache: "no-store",
      });
      const data: MatchmakingStatusResponse = await response.json();

      console.log("matchmaking status", data);

      if (data.hasActiveGame && data.activeGameId) {
        setActiveGameId(data.activeGameId);

        // Auto-redirect only if this user was actively searching
        if (wasSearchingRef.current) {
          window.location.href = `/game/${data.activeGameId}`;
          return;
        }
      } else {
        setActiveGameId(null);
      }

      if (data.status === "searching") {
        setIsSearching(true);
        wasSearchingRef.current = true;
      } else {
        setIsSearching(false);
      }
    }

    void checkStatus();
    const interval = window.setInterval(checkStatus, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user]);

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

      if (
        !response.ok ||
        !data.ok ||
        !data.links ||
        !data.creatorSide ||
        !data.game
      ) {
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

  async function handlePlayRated() {
    try {
      setError("");
      setGameInfo(null);
      wasSearchingRef.current = true;

      const response = await fetch("/api/matchmaking/join", {
        method: "POST",
      });

      const data: MatchmakingJoinResponse = await response.json();

      console.log("matchmaking join response", data);

      if (!response.ok || !data.ok) {
        wasSearchingRef.current = false;
        setError(data.error ?? "Failed to join matchmaking");
        return;
      }

      if (data.status === "matched" && data.gameId) {
        window.location.href = `/game/${data.gameId}`;
        return;
      }

      setIsSearching(true);
    } catch (err) {
      wasSearchingRef.current = false;
      console.error("failed to join matchmaking", err);
      setError("Failed to join matchmaking");
    }
  }

  async function handleCancelSearch() {
    try {
      await fetch("/api/matchmaking/leave", {
        method: "POST",
      });
      setIsSearching(false);
      wasSearchingRef.current = false;
    } catch (err) {
      console.error("failed to leave matchmaking", err);
      setError("Failed to leave matchmaking");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-6 p-6 py-10">
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
              <p className="text-sm text-gray-700">
                Rating: <span className="font-semibold">{user.rating}</span>
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handlePlayRated}
                  disabled={isSearching || !!activeGameId}
                  className="rounded-xl bg-black px-6 py-3 text-white disabled:opacity-50"
                >
                  {isSearching ? "Searching..." : "Play Rated 10+0"}
                </button>

                {isSearching ? (
                  <button
                    onClick={handleCancelSearch}
                    className="rounded-xl border px-6 py-3"
                  >
                    Cancel Search
                  </button>
                ) : null}

                <button
                  onClick={handleCreateGame}
                  disabled={isCreating || isSearching || !!activeGameId}
                  className="rounded-xl border px-6 py-3 disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create Private Game"}
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

        {activeGameId && !isSearching ? (
          <div className="mt-6 rounded-xl bg-gray-100 p-4 text-sm">
            <p className="font-semibold">You already have an ongoing game</p>
            <a
              className="mt-2 inline-block break-all text-blue-600 underline"
              href={`/game/${activeGameId}`}
            >
              Resume current game
            </a>
          </div>
        ) : null}

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
                  href={origin + gameInfo.yourGame}
                >
                  {origin + gameInfo.yourGame}
                </a>
              </div>

              <div>
                <p className="font-medium">Invite link for opponent</p>
                <a
                  className="break-all text-blue-600 underline"
                  href={origin + gameInfo.invite}
                >
                  {origin + gameInfo.invite}
                </a>
              </div>

              <div>
                <p className="font-medium">Spectator link</p>
                <a
                  className="break-all text-blue-600 underline"
                  href={origin + gameInfo.spectator}
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