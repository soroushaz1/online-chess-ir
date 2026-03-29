"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { getSocket } from "@/lib/socket";

type Player = {
  id: string;
  username: string;
  email: string;
};

type Move = {
  id: string;
  moveNumber: number;
  san: string;
  uci: string;
  fenAfter: string;
  createdAt: string;
};

type Side = "white" | "black";

type Game = {
  id: string;
  currentFen: string;
  pgn: string;
  status: string;
  result: string | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  turnStartedAt: string | null;
  whiteJoinToken: string;
  blackJoinToken: string;
  whiteConnected: boolean;
  blackConnected: boolean;
  whitePlayer: Player;
  blackPlayer: Player;
  moves: Move[];
};

type GameResponse = {
  ok: boolean;
  game?: Game;
  error?: string;
};

type ActionResponse = {
  ok: boolean;
  error?: string;
  game?: Game;
};

function getTurnFromFen(fen: string): Side {
  const parts = fen.split(" ");
  return parts[1] === "b" ? "black" : "white";
}

function getTurnTextFromFen(fen: string) {
  return getTurnFromFen(fen) === "white" ? "White" : "Black";
}

function getPieceAtSquare(fen: string, square: string): string | null {
  const boardPart = fen.split(" ")[0];
  const rows = boardPart.split("/");

  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]);
  const rowIndex = 8 - rank;

  let col = 0;

  for (const char of rows[rowIndex]) {
    if (!Number.isNaN(Number(char))) {
      col += Number(char);
    } else {
      if (col === file) return char;
      col += 1;
    }
  }

  return null;
}

function isPieceOfSide(piece: string, side: Side) {
  const isWhitePiece = piece === piece.toUpperCase();
  return side === "white" ? isWhitePiece : !isWhitePiece;
}

function getSideLabel(side: Side | null) {
  if (side === "white") return "White";
  if (side === "black") return "Black";
  return "Spectator";
}

function formatClock(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getLiveClockMs(game: Game, side: Side) {
  const base = side === "white" ? game.whiteTimeMs : game.blackTimeMs;

  if (game.status !== "active" || !game.turnStartedAt) {
    return base;
  }

  const turn = getTurnFromFen(game.currentFen);

  if (turn !== side) {
    return base;
  }

  const elapsed = Date.now() - new Date(game.turnStartedAt).getTime();
  return Math.max(0, base - elapsed);
}

function getStatusMessage(game: Game) {
  if (game.status === "waiting") {
    return "Waiting for both players to join";
  }

  if (game.status === "finished") {
    return `Game finished${game.result ? `: ${game.result}` : ""}`;
  }

  return `${getTurnTextFromFen(game.currentFen)} to move`;
}

export default function OnlineGameBoard({ gameId }: { gameId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [game, setGame] = useState<Game | null>(null);
  const [boardFen, setBoardFen] = useState("start");
  const [statusMessage, setStatusMessage] = useState("Loading game...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setTick] = useState(0);

  const playerSide = useMemo<Side | null>(() => {
    if (!game || !token) return null;
    if (token === game.whiteJoinToken) return "white";
    if (token === game.blackJoinToken) return "black";
    return null;
  }, [game, token]);

  async function loadGame() {
    try {
      const response = await fetch(`/api/games/${gameId}`, {
        cache: "no-store",
      });

      const data: GameResponse = await response.json();

      if (!response.ok || !data.ok || !data.game) {
        setStatusMessage(data.error ?? "Failed to load game");
        return;
      }

      setGame(data.game);
      setBoardFen(data.game.currentFen);
      setStatusMessage(getStatusMessage(data.game));
    } catch {
      setStatusMessage("Failed to load game");
    }
  }

  async function updatePresence(connected: boolean) {
    if (!playerSide) return;

    try {
      await fetch(`/api/games/${gameId}/presence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          side: playerSide,
          connected,
        }),
      });
    } catch {
      // ignore presence update failure for now
    }
  }

  useEffect(() => {
    loadGame();
  }, [gameId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((value) => value + 1);
    }, 250);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = getSocket();

    socket.emit("game:join", gameId);

    const handleGameUpdated = (payload: { gameId: string; game: Game }) => {
      if (payload.gameId !== gameId) return;

      setGame(payload.game);
      setBoardFen(payload.game.currentFen);
      setStatusMessage(getStatusMessage(payload.game));
      setIsSubmitting(false);
    };

    socket.on("game:updated", handleGameUpdated);

    return () => {
      socket.emit("game:leave", gameId);
      socket.off("game:updated", handleGameUpdated);
    };
  }, [gameId]);

  useEffect(() => {
    if (!playerSide) return;

    void updatePresence(true);

    return () => {
      void updatePresence(false);
    };
  }, [playerSide, gameId]);

  async function submitMove(from: string, to: string) {
    try {
      const response = await fetch(`/api/games/${gameId}/move`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          promotion: "q",
        }),
      });

      const data: ActionResponse = await response.json();

      if (!response.ok || !data.ok || !data.game) {
        await loadGame();
        setStatusMessage(data.error ?? "Move failed");
        return;
      }

      setGame(data.game);
      setBoardFen(data.game.currentFen);
      setStatusMessage(getStatusMessage(data.game));
    } catch {
      await loadGame();
      setStatusMessage("Move failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResign() {
    if (!playerSide || !game) return;

    try {
      const response = await fetch(`/api/games/${gameId}/resign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          side: playerSide,
        }),
      });

      const data: ActionResponse = await response.json();

      if (!response.ok || !data.ok || !data.game) {
        setStatusMessage(data.error ?? "Failed to resign");
        return;
      }

      setGame(data.game);
      setBoardFen(data.game.currentFen);
      setStatusMessage(getStatusMessage(data.game));
    } catch {
      setStatusMessage("Failed to resign");
    }
  }

  async function handleAbort() {
  if (!playerSide || !game) return;

  try {
    const response = await fetch(`/api/games/${gameId}/abort`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        side: playerSide,
      }),
    });

    const data: ActionResponse = await response.json();

    if (!response.ok || !data.ok || !data.game) {
      setStatusMessage(data.error ?? "Failed to abort");
      return;
    }

    setGame(data.game);
    setBoardFen(data.game.currentFen);
    setStatusMessage(getStatusMessage(data.game));
    } catch {
    setStatusMessage("Failed to abort");
    }
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string) {
    if (!game || isSubmitting) return false;

    if (!playerSide) {
      setStatusMessage("Spectators cannot move pieces");
      return false;
    }

    if (game.status !== "active") {
      setStatusMessage("Game has not started yet");
      return false;
    }

    const currentTurn = getTurnFromFen(game.currentFen);

    if (currentTurn !== playerSide) {
      setStatusMessage("It is not your turn");
      return false;
    }

    const piece = getPieceAtSquare(game.currentFen, sourceSquare);

    if (!piece) {
      setStatusMessage("No piece on that square");
      return false;
    }

    if (!isPieceOfSide(piece, playerSide)) {
      setStatusMessage("You can only move your own pieces");
      return false;
    }

    const chess = new Chess(game.currentFen);
    const move = chess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });

    if (!move) {
      setStatusMessage("Illegal move");
      return false;
    }

    setIsSubmitting(true);
    setBoardFen(chess.fen());
    setStatusMessage("Submitting move...");
    void submitMove(sourceSquare, targetSquare);

    return true;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Online Chess IR</h1>
        <p className="mt-1 text-sm text-gray-600">Live database-backed game</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <Chessboard position={boardFen} onPieceDrop={onPieceDrop} />
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Game Info</h2>

          <div className="mt-4 space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-semibold">You are:</span>{" "}
              {getSideLabel(playerSide)}
            </p>
            <p>
              <span className="font-semibold">White:</span>{" "}
              {game?.whitePlayer.username ?? "..."}
            </p>
            <p>
              <span className="font-semibold">Black:</span>{" "}
              {game?.blackPlayer.username ?? "..."}
            </p>
            <p>
              <span className="font-semibold">White connected:</span>{" "}
              {game ? (game.whiteConnected ? "Yes" : "No") : "..."}
            </p>
            <p>
              <span className="font-semibold">Black connected:</span>{" "}
              {game ? (game.blackConnected ? "Yes" : "No") : "..."}
            </p>
            <p>
              <span className="font-semibold">White clock:</span>{" "}
              {game ? formatClock(getLiveClockMs(game, "white")) : "..."}
            </p>
            <p>
              <span className="font-semibold">Black clock:</span>{" "}
              {game ? formatClock(getLiveClockMs(game, "black")) : "..."}
            </p>
            <p>
              <span className="font-semibold">Status:</span> {statusMessage}
            </p>
            <p>
              <span className="font-semibold">Game ID:</span> {gameId}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={handleResign}
              disabled={!playerSide || game?.status === "finished"}
              className="rounded-xl bg-red-600 px-4 py-2 text-white disabled:opacity-50"
            >
              Resign
            </button>

            <button
              onClick={handleAbort}
              disabled={!playerSide || game?.status === "finished"}
              className="rounded-xl bg-gray-700 px-4 py-2 text-white disabled:opacity-50"
            >
              Abort
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-100 p-3 text-sm">
            <p className="font-semibold">How access works</p>
            <p className="mt-2">
              White and Black sides are determined by the private token in the
              URL. Opening the game without a token makes you a spectator.
            </p>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold">PGN</h3>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-gray-100 p-3 text-xs">
              {game?.pgn ?? "Loading..."}
            </pre>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold">Moves</h3>
            <div className="mt-2 max-h-64 overflow-auto rounded-xl bg-gray-100 p-3 text-sm">
              {game?.moves?.length ? (
                <ol className="space-y-1">
                  {game.moves.map((move) => (
                    <li key={move.id}>
                      {move.moveNumber}. {move.san} ({move.uci})
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No moves yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}