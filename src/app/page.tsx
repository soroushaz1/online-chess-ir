"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";

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

type CreatedGameInfo = {
  gameId: string;
  creatorSide: "white" | "black";
  yourGame: string;
  invite: string;
  spectator: string;
};

export default function HomePage() {
  const { t, language } = useI18n();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [gameInfo, setGameInfo] = useState<CreatedGameInfo | null>(null);

  const wasSearchingRef = useRef(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data: MeResponse = await response.json();
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

      if (data.hasActiveGame && data.activeGameId) {
        setActiveGameId(data.activeGameId);

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

      if (
        !response.ok ||
        !data.ok ||
        !data.links ||
        !data.creatorSide ||
        !data.game
      ) {
        setError(data.error ?? t.home.createGameFailed);
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
      setError(t.home.createGameFailed);
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

      if (!response.ok || !data.ok) {
        wasSearchingRef.current = false;
        setError(data.error ?? t.home.joinMatchmakingFailed);
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
      setError(t.home.joinMatchmakingFailed);
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
      setError(t.home.leaveMatchmakingFailed);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      window.location.href = "/";
    } catch (err) {
      console.error("failed to log out", err);
    }
  }

  const assignedSideLabel =
    gameInfo?.creatorSide === "white" ? t.home.white : t.home.black;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-start justify-center p-4 pt-24">
      <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
        <div className={language === "fa" ? "text-right" : "text-left"}>
          <h1 className="text-4xl font-bold">{t.home.title}</h1>
          <p className="mt-2 text-gray-600">{t.home.subtitle}</p>
        </div>

        <div
          className={`mt-6 space-y-3 text-sm text-gray-700 ${
            language === "fa" ? "text-right" : "text-left"
          }`}
        >
          {loadingUser ? (
            <p>{t.common.loading}</p>
          ) : user ? (
            <>
              <p>
                <span className="font-semibold">{t.home.loggedInAs}:</span>{" "}
                {user.username}
              </p>

              <p>
                <span className="font-semibold">{t.home.rating}:</span>{" "}
                {user.rating}
              </p>

              <div
                className={`mt-4 flex flex-wrap gap-3 ${
                  language === "fa" ? "justify-end" : "justify-start"
                }`}
              >
                <button
                  onClick={handlePlayRated}
                  disabled={isSearching}
                  className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
                >
                  {isSearching ? t.home.searching : t.home.playRated}
                </button>

                {isSearching ? (
                  <button
                    onClick={handleCancelSearch}
                    className="rounded-xl border px-5 py-3"
                  >
                    {t.home.cancelSearch}
                  </button>
                ) : null}

                <button
                  onClick={handleCreateGame}
                  disabled={isCreating}
                  className="rounded-xl border px-5 py-3 disabled:opacity-50"
                >
                  {isCreating ? t.common.loading : t.home.createPrivateGame}
                </button>

                <button
                  onClick={handleLogout}
                  className="rounded-xl border px-5 py-3"
                >
                  {t.home.logout}
                </button>
              </div>
            </>
          ) : (
            <div className={language === "fa" ? "text-right" : "text-left"}>
              <Link
                href="/auth/phone"
                className="inline-flex rounded-xl bg-black px-5 py-3 text-white"
              >
                {t.home.signInWithPhone}
              </Link>
            </div>
          )}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          ) : null}

          {activeGameId && !isSearching ? (
            <div className="rounded-xl bg-gray-100 p-4">
              <p className="font-semibold">{t.home.ongoingGame}</p>

              <div className="mt-3">
                <Link
                  href={`/game/${activeGameId}`}
                  className="text-blue-600 underline"
                >
                  {t.home.resumeCurrentGame}
                </Link>
              </div>
            </div>
          ) : null}

          {gameInfo ? (
            <div className="rounded-xl bg-gray-100 p-4">
              <p>
                <span className="font-semibold">{t.home.assignedSide}:</span>{" "}
                {assignedSideLabel}
              </p>

              <p className="mt-2">
                <span className="font-semibold">{t.home.gameId}:</span>{" "}
                {gameInfo.gameId}
              </p>

              <div className="mt-4 space-y-3 break-all">
                <div>
                  <p className="font-semibold">{t.home.yourGameLink}</p>
                  <a
                    href={origin + gameInfo.yourGame}
                    className="text-blue-600 underline"
                  >
                    {origin + gameInfo.yourGame}
                  </a>
                </div>

                <div>
                  <p className="font-semibold">{t.home.inviteLink}</p>
                  <a
                    href={origin + gameInfo.invite}
                    className="text-blue-600 underline"
                  >
                    {origin + gameInfo.invite}
                  </a>
                </div>

                <div>
                  <p className="font-semibold">{t.home.spectatorLink}</p>
                  <a
                    href={origin + gameInfo.spectator}
                    className="text-blue-600 underline"
                  >
                    {origin + gameInfo.spectator}
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          <div className={language === "fa" ? "text-right" : "text-left"}>
            <Link href="/games" className="text-blue-600 underline">
              {t.home.viewGameHistory}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}