"use client";

import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

export default function LocalChessBoard() {
  const chess = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(chess.fen());
  const [status, setStatus] = useState("White to move");

  function updateStatus() {
    if (chess.isCheckmate()) {
      setStatus(`Checkmate. ${chess.turn() === "w" ? "Black" : "White"} wins.`);
      return;
    }

    if (chess.isDraw()) {
      setStatus("Draw.");
      return;
    }

    if (chess.inCheck()) {
      setStatus(`${chess.turn() === "w" ? "White" : "Black"} to move - Check!`);
      return;
    }

    setStatus(`${chess.turn() === "w" ? "White" : "Black"} to move`);
  }

  function resetGame() {
    chess.reset();
    setFen(chess.fen());
    setStatus("White to move");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Online Chess IR</h1>
        <p className="mt-1 text-sm text-gray-600">Local board prototype</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <Chessboard
            id="LocalBoard"
            position={fen}
            onPieceDrop={(sourceSquare, targetSquare) => {
              const move = chess.move({
                from: sourceSquare,
                to: targetSquare,
                promotion: "q",
              });

              if (!move) return false;

              setFen(chess.fen());
              updateStatus();
              return true;
            }}
            autoPromoteToQueen
          />
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Game Status</h2>
          <p className="mt-2 text-sm text-gray-700">{status}</p>

          <button
            onClick={resetGame}
            className="mt-4 rounded-xl bg-black px-4 py-2 text-white"
          >
            Reset game
          </button>

          <div className="mt-6">
            <h3 className="font-medium">FEN</h3>
            <p className="mt-2 break-all text-xs text-gray-600">{fen}</p>
          </div>
        </div>
      </div>
    </div>
  );
}