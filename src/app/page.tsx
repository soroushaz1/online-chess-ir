"use client";

import { useState } from "react";

type CreateGameResponse = {
  ok: boolean;
  game?: {
    id: string;
  };
  links?: {
    white: string;
    black: string;
    spectator: string;
  };
  error?: string;
};

export default function HomePage() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<null | {
    white: string;
    black: string;
    spectator: string;
  }>(null);

  async function handleCreateGame() {
    try {
      setIsCreating(true);
      setError("");
      setLinks(null);

      const response = await fetch("/api/games/create", {
        method: "POST",
      });

      const data: CreateGameResponse = await response.json();

      if (!response.ok || !data.ok || !data.links) {
        setError(data.error ?? "Failed to create game");
        return;
      }

      setLinks(data.links);
    } catch {
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
          Create a game and open the private join links for each side.
        </p>

        <button
          onClick={handleCreateGame}
          disabled={isCreating}
          className="mt-6 rounded-xl bg-black px-6 py-3 text-white disabled:opacity-60"
        >
          {isCreating ? "Creating game..." : "Create New Game"}
        </button>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {links ? (
          <div className="mt-6 rounded-2xl bg-gray-100 p-4 text-sm">
            <p className="font-semibold">Game links</p>

            <div className="mt-4 space-y-3">
              <div>
                <p className="font-medium">White</p>
                <a className="break-all text-blue-600 underline" href={links.white}>
                  {links.white}
                </a>
              </div>

              <div>
                <p className="font-medium">Black</p>
                <a className="break-all text-blue-600 underline" href={links.black}>
                  {links.black}
                </a>
              </div>

              <div>
                <p className="font-medium">Spectator</p>
                <a
                  className="break-all text-blue-600 underline"
                  href={links.spectator}
                >
                  {links.spectator}
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}