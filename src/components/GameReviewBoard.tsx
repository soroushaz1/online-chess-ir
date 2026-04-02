"use client";

import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";

type Move = {
  id: string;
  moveNumber: number;
  san: string;
  uci: string;
  fenAfter: string;
//   createdAt: Date;
};

type GameReview = {
  id: string;
  initialFen: string;
  result: string | null;
  status: string;
  whitePlayer: {
    username: string;
  } | null;
  blackPlayer: {
    username: string;
  } | null;
  moves: Move[];
};

export default function GameReviewBoard({ game }: { game: GameReview }) {
  const [currentPly, setCurrentPly] = useState(game.moves.length);

  const currentFen =
    currentPly === 0 ? game.initialFen : game.moves[currentPly - 1].fenAfter;

  const currentMove = currentPly === 0 ? null : game.moves[currentPly - 1];

  const moveRows = useMemo(() => {
    const rows: Array<{
      turn: number;
      white?: Move;
      black?: Move;
    }> = [];

    for (let i = 0; i < game.moves.length; i += 2) {
      rows.push({
        turn: Math.floor(i / 2) + 1,
        white: game.moves[i],
        black: game.moves[i + 1],
      });
    }

    return rows;
  }, [game.moves]);

  function goToStart() {
    setCurrentPly(0);
  }

  function goToPrevious() {
    setCurrentPly((value) => Math.max(0, value - 1));
  }

  function goToNext() {
    setCurrentPly((value) => Math.min(game.moves.length, value + 1));
  }

  function goToEnd() {
    setCurrentPly(game.moves.length);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Game Review</h1>
        <p className="mt-1 text-sm text-gray-600">
          {game.whitePlayer?.username ?? "White"} vs{" "}
          {game.blackPlayer?.username ?? "Black"}
        </p>
        <p className="mt-2 text-sm text-gray-700">
          Result: {game.result ?? "Unknown"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <Chessboard position={currentFen} arePiecesDraggable={false} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={goToStart}
              disabled={currentPly === 0}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {"<<"}
            </button>

            <button
              onClick={goToPrevious}
              disabled={currentPly === 0}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {"<"}
            </button>

            <button
              onClick={goToNext}
              disabled={currentPly === game.moves.length}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {">"}
            </button>

            <button
              onClick={goToEnd}
              disabled={currentPly === game.moves.length}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {">>"}
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-100 p-3 text-sm text-gray-700">
            <p>
              <span className="font-semibold">Move:</span>{" "}
              {currentPly === 0 ? "Start position" : `${currentPly}. ${currentMove?.san}`}
            </p>
            <p className="mt-1 break-all">
              <span className="font-semibold">FEN:</span> {currentFen}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Moves</h2>

          <div className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-gray-100 p-3">
            {moveRows.length === 0 ? (
              <p className="text-sm text-gray-600">No moves recorded.</p>
            ) : (
              <div className="space-y-2">
                {moveRows.map((row) => {
                  const whiteSelected = row.white?.moveNumber === currentPly;
                  const blackSelected = row.black?.moveNumber === currentPly;

                  return (
                    <div
                      key={row.turn}
                      className="grid grid-cols-[48px_1fr_1fr] items-center gap-2 text-sm"
                    >
                      <div className="font-semibold text-gray-500">
                        {row.turn}.
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          row.white && setCurrentPly(row.white.moveNumber)
                        }
                        className={`rounded-lg px-2 py-1 text-left ${
                          whiteSelected
                            ? "bg-black text-white"
                            : "bg-white hover:bg-gray-200"
                        }`}
                      >
                        {row.white?.san ?? "-"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          row.black && setCurrentPly(row.black.moveNumber)
                        }
                        className={`rounded-lg px-2 py-1 text-left ${
                          blackSelected
                            ? "bg-black text-white"
                            : "bg-white hover:bg-gray-200"
                        }`}
                      >
                        {row.black?.san ?? "-"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}