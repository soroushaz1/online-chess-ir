"use client";

import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useStockfishAnalysis } from "@/hooks/useStockfishAnalysis";
import { useMoveClassifications } from "@/hooks/useMoveClassifications";

type Move = {
  id: string;
  moveNumber: number;
  san: string;
  uci: string;
  fenAfter: string;
};

type GameReview = {
  id: string;
  initialFen: string;
  result: string | null;
  status: string;
  pgn: string | null;
  whitePlayer: {
    username: string;
  } | null;
  blackPlayer: {
    username: string;
  } | null;
  moves: Move[];
};

type AnalysisMode = "depth" | "fast" | "normal" | "deep";

function createChessFromFen(fen: string) {
  return fen === "start" ? new Chess() : new Chess(fen);
}

function parseUciMove(uci: string) {
  const normalized = uci.trim().toLowerCase();

  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) {
    return null;
  }

  return {
    from: normalized.slice(0, 2),
    to: normalized.slice(2, 4),
    promotion:
      normalized.length === 5
        ? (normalized[4] as "q" | "r" | "b" | "n")
        : undefined,
  };
}

function formatEngineScore(scoreCp: number | null, mate: number | null) {
  if (mate !== null) {
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  }

  if (scoreCp === null) {
    return "—";
  }

  const pawns = scoreCp / 100;
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

function getTurnFromFen(fen: string) {
  if (fen === "start") return "white";
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

function toWhitePerspective(
  fen: string,
  scoreCp: number | null,
  mate: number | null
) {
  const multiplier = getTurnFromFen(fen) === "white" ? 1 : -1;

  return {
    scoreCp: scoreCp === null ? null : scoreCp * multiplier,
    mate: mate === null ? null : mate * multiplier,
  };
}

function uciToSan(fen: string, uci: string | null) {
  if (!uci) return null;

  try {
    const chess = createChessFromFen(fen);
    const parsed = parseUciMove(uci);

    if (!parsed) return uci;

    const move = chess.move(parsed);
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

function pvToSan(fen: string, pv: string[]) {
  if (pv.length === 0) return "";

  try {
    const chess = createChessFromFen(fen);

    return pv
      .map((uci) => {
        const parsed = parseUciMove(uci);
        if (!parsed) return uci;

        const move = chess.move(parsed);
        return move?.san ?? uci;
      })
      .join(" ");
  } catch {
    return pv.join(" ");
  }
}

function evalToWhiteBarPercent(
  whiteScoreCp: number | null,
  whiteMate: number | null
) {
  if (whiteMate !== null) {
    return whiteMate > 0 ? 100 : 0;
  }

  if (whiteScoreCp === null) {
    return 50;
  }

  const clamped = Math.max(-1200, Math.min(1200, whiteScoreCp));
  const normalized = Math.tanh(clamped / 400);

  return 50 + normalized * 50;
}

function getTimePresetMs(mode: AnalysisMode) {
  if (mode === "fast") return 800;
  if (mode === "normal") return 1500;
  if (mode === "deep") return 3000;
  return null;
}

function getTagClasses(tag?: string) {
  if (tag === "Brilliant") return "bg-fuchsia-600 text-white";
  if (tag === "Best") return "bg-green-600 text-white";
  if (tag === "Good") return "bg-emerald-100 text-emerald-800";
  if (tag === "Inaccuracy") return "bg-yellow-100 text-yellow-800";
  if (tag === "Mistake") return "bg-orange-100 text-orange-800";
  if (tag === "Blunder") return "bg-red-600 text-white";
  return "bg-white hover:bg-gray-200";
}

export default function GameReviewBoard({ game }: { game: GameReview }) {
  const [currentPly, setCurrentPly] = useState(game.moves.length);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("normal");
  const [analysisDepth, setAnalysisDepth] = useState(14);
  const [classifyMovesEnabled, setClassifyMovesEnabled] = useState(false);

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

  const whiteName = game.whitePlayer?.username ?? "White";
  const blackName = game.blackPlayer?.username ?? "Black";

  const movetimeMs = getTimePresetMs(analysisMode);

  const analysis = useStockfishAnalysis({
    enabled: analysisEnabled,
    fen: currentFen,
    depth: analysisMode === "depth" ? analysisDepth : undefined,
    movetimeMs: analysisMode === "depth" ? undefined : movetimeMs ?? undefined,
  });

  const whitePerspectiveEval = useMemo(
    () => toWhitePerspective(currentFen, analysis.scoreCp, analysis.mate),
    [currentFen, analysis.scoreCp, analysis.mate]
  );

  const bestMoveSan = useMemo(
    () => uciToSan(currentFen, analysis.bestMove),
    [currentFen, analysis.bestMove]
  );

  const pvSan = useMemo(
    () => pvToSan(currentFen, analysis.pv),
    [currentFen, analysis.pv]
  );

  const whiteBarPercent = useMemo(
    () =>
      evalToWhiteBarPercent(
        whitePerspectiveEval.scoreCp,
        whitePerspectiveEval.mate
      ),
    [whitePerspectiveEval]
  );

  const blackBarPercent = 100 - whiteBarPercent;

  const classification = useMoveClassifications({
    enabled: classifyMovesEnabled,
    initialFen: game.initialFen,
    moves: game.moves,
    movetimeMs: 900,
  });

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

  async function handleCopyPgn() {
    if (!game.pgn) return;

    try {
      await navigator.clipboard.writeText(game.pgn);
      alert("PGN copied");
    } catch (error) {
      console.error("Failed to copy PGN", error);
      alert("Failed to copy PGN");
    }
  }

  function handleDownloadPgn() {
    if (!game.pgn) return;

    const safeWhite = whiteName.replace(/[^a-z0-9_-]+/gi, "-");
    const safeBlack = blackName.replace(/[^a-z0-9_-]+/gi, "-");
    const filename = `${safeWhite}-vs-${safeBlack}-${game.id}.pgn`;

    const blob = new Blob([game.pgn], { type: "application/x-chess-pgn" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Game Review</h1>
        <p className="mt-1 text-sm text-gray-600">
          {whiteName} vs {blackName}
        </p>
        <p className="mt-2 text-sm text-gray-700">
          Result: {game.result ?? "Unknown"}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyPgn}
            disabled={!game.pgn}
            className="rounded-xl border px-4 py-2 disabled:opacity-50"
          >
            Copy PGN
          </button>

          <button
            onClick={handleDownloadPgn}
            disabled={!game.pgn}
            className="rounded-xl border px-4 py-2 disabled:opacity-50"
          >
            Download PGN
          </button>

          <button
            onClick={() => setAnalysisEnabled((value) => !value)}
            className="rounded-xl border px-4 py-2"
          >
            {analysisEnabled ? "Stop Analysis" : "Analyze Position"}
          </button>

          <button
            onClick={() => setClassifyMovesEnabled((value) => !value)}
            className="rounded-xl border px-4 py-2"
          >
            {classifyMovesEnabled ? "Stop Move Labels" : "Label Moves"}
          </button>

          <div className="ml-2 flex items-center gap-2">
            <label className="text-sm text-gray-700">Mode</label>
            <select
              value={analysisMode}
              onChange={(e) => setAnalysisMode(e.target.value as AnalysisMode)}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <option value="depth">Depth</option>
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="deep">Deep</option>
            </select>
          </div>

          {analysisMode === "depth" ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Depth</label>
              <select
                value={analysisDepth}
                onChange={(e) => setAnalysisDepth(Number(e.target.value))}
                className="rounded-xl border px-3 py-2 text-sm"
              >
                <option value={10}>10</option>
                <option value={12}>12</option>
                <option value={14}>14</option>
                <option value={16}>16</option>
                <option value={18}>18</option>
              </select>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              {analysisMode === "fast" && "≈ 0.8s per position"}
              {analysisMode === "normal" && "≈ 1.5s per position"}
              {analysisMode === "deep" && "≈ 3s per position"}
            </p>
          )}

          {classifyMovesEnabled ? (
            <p className="text-sm text-gray-600">
              Labeling: {classification.progress}/{classification.total}
              {classification.running ? "..." : " done"}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-stretch gap-4">
            <div className="flex w-10 shrink-0 flex-col items-center">
              <div className="relative h-full min-h-[420px] w-6 overflow-hidden rounded-xl border bg-black">
                <div
                  className="absolute inset-x-0 bottom-0 bg-white transition-all duration-300"
                  style={{ height: `${whiteBarPercent}%` }}
                />
              </div>

              <div className="mt-2 text-center text-[11px] font-semibold text-gray-700">
                <div>W {Math.round(whiteBarPercent)}%</div>
                <div>B {Math.round(blackBarPercent)}%</div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <Chessboard position={currentFen} arePiecesDraggable={false} />
            </div>
          </div>

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
              {currentPly === 0
                ? "Start position"
                : `${currentPly}. ${currentMove?.san}`}
            </p>
            <p className="mt-1 break-all">
              <span className="font-semibold">FEN:</span> {currentFen}
            </p>
          </div>

          <div className="mt-4 rounded-xl bg-gray-100 p-3 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Stockfish</p>
              <p className="text-xs text-gray-500">
                {analysisEnabled
                  ? analysis.engineReady
                    ? analysis.analyzing
                      ? "Analyzing..."
                      : "Ready / Cached when available"
                    : "Loading engine..."
                  : "Disabled"}
              </p>
            </div>

            <div className="mt-3 grid gap-2 text-sm">
              <p>
                <span className="font-semibold">Depth reached:</span>{" "}
                {analysis.depthReached || 0}
              </p>
              <p>
                <span className="font-semibold">Eval:</span>{" "}
                {formatEngineScore(
                  whitePerspectiveEval.scoreCp,
                  whitePerspectiveEval.mate
                )}
              </p>
              <p>
                <span className="font-semibold">Best move:</span>{" "}
                {bestMoveSan ?? analysis.bestMove ?? "—"}
              </p>
              <p className="break-words">
                <span className="font-semibold">PV:</span> {pvSan || "—"}
              </p>
              {analysis.error ? (
                <p className="text-sm text-red-600">{analysis.error}</p>
              ) : null}
              {classification.error ? (
                <p className="text-sm text-red-600">{classification.error}</p>
              ) : null}
            </div>
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

                  const whiteTag = row.white
                    ? classification.tags[row.white.id]
                    : undefined;

                  const blackTag = row.black
                    ? classification.tags[row.black.id]
                    : undefined;

                  return (
                    <div
                      key={row.turn}
                      className="grid grid-cols-[48px_1fr_1fr] items-start gap-2 text-sm"
                    >
                      <div className="pt-1 font-semibold text-gray-500">
                        {row.turn}.
                      </div>

                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() =>
                            row.white && setCurrentPly(row.white.moveNumber)
                          }
                          className={`w-full rounded-lg px-2 py-1 text-left ${
                            whiteSelected
                              ? "bg-black text-white"
                              : getTagClasses(whiteTag)
                          }`}
                        >
                          {row.white?.san ?? "-"}
                        </button>
                        {whiteTag ? (
                          <div className="px-1 text-[11px] font-semibold text-gray-600">
                            {whiteTag}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() =>
                            row.black && setCurrentPly(row.black.moveNumber)
                          }
                          className={`w-full rounded-lg px-2 py-1 text-left ${
                            blackSelected
                              ? "bg-black text-white"
                              : getTagClasses(blackTag)
                          }`}
                        >
                          {row.black?.san ?? "-"}
                        </button>
                        {blackTag ? (
                          <div className="px-1 text-[11px] font-semibold text-gray-600">
                            {blackTag}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {game.pgn ? (
            <div className="mt-4 rounded-xl bg-gray-100 p-3">
              <p className="mb-2 text-sm font-semibold text-gray-700">PGN</p>
              <pre className="whitespace-pre-wrap break-words text-xs text-gray-700">
                {game.pgn}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}