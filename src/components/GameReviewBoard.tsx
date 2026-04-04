"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useI18n } from "@/components/LanguageProvider";
import Link from "next/link";

type Move = {
  id: string;
  moveNumber: number;
  san: string;
  uci: string;
  fenAfter: string;
};

type AnalysisPosition = {
  ply: number;
  fen: string;
  depthReached: number;
  scoreCp: number | null;
  mate: number | null;
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  pv: string | null;
};

type AnalysisMove = {
  moveId: string;
  moveNumber: number;
  classification: string | null;
  evalLossCp: number | null;
};

type GameReview = {
  id: string;
  initialFen: string;
  result: string | null;
  status: string;
  pgn: string | null;
  analysisStatus: string;
  analysisError: string | null;
  whitePlayer: {
    username: string;
  } | null;
  blackPlayer: {
    username: string;
  } | null;
  moves: Move[];
  analysisPositions: AnalysisPosition[];
  analysisMoves: AnalysisMove[];
};

type AnalysisResponse = {
  ok: boolean;
  analysis?: {
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
    totalPositions: number;
    analyzedPositions: number;
    totalMoves: number;
    analyzedMoves: number;
    positions: AnalysisPosition[];
    moves: AnalysisMove[];
  };
  error?: string;
};

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

function getTagClasses(tag?: string | null) {
  if (tag === "Brilliant") return "bg-fuchsia-600 text-white";
  if (tag === "Best") return "bg-green-600 text-white";
  if (tag === "Good") return "bg-emerald-100 text-emerald-800";
  if (tag === "Inaccuracy") return "bg-yellow-100 text-yellow-800";
  if (tag === "Mistake") return "bg-orange-100 text-orange-800";
  if (tag === "Blunder") return "bg-red-600 text-white";
  return "bg-white hover:bg-gray-200";
}

function getAnalysisStatusText(
  status: string,
  error: string | null,
  tReview: {
    ready: string;
    analyzing: string;
    queued: string;
    failed: string;
  }
) {
  if (status === "completed") return tReview.ready;
  if (status === "running") return tReview.analyzing;
  if (status === "idle") return tReview.queued;
  if (status === "failed") return error ?? tReview.failed;
  return tReview.queued;
}

export default function GameReviewBoard({ game }: { game: GameReview }) {
  const { t, language } = useI18n();

  const [currentPly, setCurrentPly] = useState(game.moves.length);
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState(game.analysisStatus);
  const [analysisError, setAnalysisError] = useState<string | null>(
    game.analysisError
  );
  const [analysisPositions, setAnalysisPositions] = useState<AnalysisPosition[]>(
    game.analysisPositions ?? []
  );
  const [analysisMoves, setAnalysisMoves] = useState<AnalysisMove[]>(
    game.analysisMoves ?? []
  );

  const contentAlignClass = language === "fa" ? "text-right" : "text-left";

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

  const whiteName = game.whitePlayer?.username ?? t.game.white;
  const blackName = game.blackPlayer?.username ?? t.game.black;

  const analysisByPly = useMemo(() => {
    return new Map(analysisPositions.map((item) => [item.ply, item]));
  }, [analysisPositions]);

  const moveTagsById = useMemo(() => {
    return new Map(
      analysisMoves.map((item) => [item.moveId, item.classification ?? undefined])
    );
  }, [analysisMoves]);

  const currentAnalysis = analysisByPly.get(currentPly);

  const whitePerspectiveEval = useMemo(
    () =>
      toWhitePerspective(
        currentFen,
        currentAnalysis?.scoreCp ?? null,
        currentAnalysis?.mate ?? null
      ),
    [currentFen, currentAnalysis]
  );

  const bestMoveSan =
    currentAnalysis?.bestMoveSan ??
    uciToSan(currentFen, currentAnalysis?.bestMoveUci ?? null);

  const pvSan = currentAnalysis?.pv
    ? pvToSan(currentFen, currentAnalysis.pv.trim().split(/\s+/))
    : "";

  const whiteBarPercent = useMemo(
    () =>
      evalToWhiteBarPercent(
        whitePerspectiveEval.scoreCp,
        whitePerspectiveEval.mate
      ),
    [whitePerspectiveEval]
  );

  const blackBarPercent = 100 - whiteBarPercent;

  async function loadAnalysis() {
    try {
      const response = await fetch(`/api/games/${game.id}/analysis`, {
        cache: "no-store",
      });

      const data: AnalysisResponse = await response.json();

      if (!response.ok || !data.ok || !data.analysis) {
        setAnalysisError(data.error ?? t.review.loadFailed);
        return;
      }

      setAnalysisStatus(data.analysis.status);
      setAnalysisError(data.analysis.error ?? null);
      setAnalysisPositions(data.analysis.positions ?? []);
      setAnalysisMoves(data.analysis.moves ?? []);
    } catch {
      setAnalysisError(t.review.loadFailed);
    }
  }

  async function handleToggleAnalysis() {
    if (analysisVisible) {
      setAnalysisVisible(false);
      return;
    }

    setAnalysisVisible(true);

    if (analysisStatus === "completed" || analysisStatus === "running") {
      await loadAnalysis();
      return;
    }

    try {
      const response = await fetch(`/api/games/${game.id}/analysis`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setAnalysisStatus("failed");
        setAnalysisError(data.error ?? t.review.queueFailed);
        return;
      }

      setAnalysisStatus("running");
      setAnalysisError(null);
      await loadAnalysis();
    } catch {
      setAnalysisStatus("failed");
      setAnalysisError(t.review.queueFailed);
    }
  }

  useEffect(() => {
    if (!analysisVisible) return;
    if (analysisStatus !== "running") return;

    let cancelled = false;

    const interval = setInterval(async () => {
      if (cancelled) return;

      try {
        const response = await fetch(`/api/games/${game.id}/analysis`, {
          cache: "no-store",
        });

        const data: AnalysisResponse = await response.json();

        if (!response.ok || !data.ok || !data.analysis || cancelled) {
          return;
        }

        setAnalysisStatus(data.analysis.status);
        setAnalysisError(data.analysis.error ?? null);
        setAnalysisPositions(data.analysis.positions ?? []);
        setAnalysisMoves(data.analysis.moves ?? []);
      } catch {
        if (!cancelled) {
          setAnalysisError(t.review.loadFailed);
        }
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [analysisVisible, analysisStatus, game.id, t.review]);

  async function handleCopyPgn() {
    if (!game.pgn) return;

    try {
      await navigator.clipboard.writeText(game.pgn);
    } catch { }
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
    <div className={`mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 ${contentAlignClass}`}>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-gray-50 text-xl hover:bg-gray-100"
            aria-label={
              language === "fa" ? "بازگشت به صفحه اصلی" : "Go to home page"
            }
            title={language === "fa" ? "صفحه اصلی" : "Home"}
          >
            ♟
          </Link>

          <div className={`flex-1 ${contentAlignClass}`}>
            <Link href="/games" className="inline-block hover:opacity-80">
              <h1 className="text-2xl font-bold">{t.review.title}</h1>
              <p className="mt-1 text-sm text-gray-600">
                {whiteName} vs {blackName}
              </p>
            </Link>
            <p className="mt-2 text-sm text-gray-700">
              {t.review.result}: {game.result ?? t.gamesHistory.unknown}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyPgn}
            disabled={!game.pgn}
            className="rounded-xl border px-4 py-2 disabled:opacity-50"
          >
            {t.review.copyPgn}
          </button>

          <button
            onClick={handleDownloadPgn}
            disabled={!game.pgn}
            className="rounded-xl border px-4 py-2 disabled:opacity-50"
          >
            {t.review.downloadPgn}
          </button>

          <button
            onClick={handleToggleAnalysis}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white"
          >
            {analysisVisible ? t.review.hideAnalysis : t.review.analyze}
          </button>

          <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
            {getAnalysisStatusText(analysisStatus, analysisError, t.review)}
          </div>
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

            <div className="min-w-0 flex-1" dir="ltr">
              <Chessboard position={currentFen} arePiecesDraggable={false} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setCurrentPly(0)}
              disabled={currentPly === 0}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {t.review.first}
            </button>

            <button
              onClick={() => setCurrentPly((value) => Math.max(0, value - 1))}
              disabled={currentPly === 0}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {t.review.previous}
            </button>

            <button
              onClick={() =>
                setCurrentPly((value) => Math.min(game.moves.length, value + 1))
              }
              disabled={currentPly === game.moves.length}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {t.review.next}
            </button>

            <button
              onClick={() => setCurrentPly(game.moves.length)}
              disabled={currentPly === game.moves.length}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {t.review.last}
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-100 p-3 text-sm text-gray-700">
            <p>
              <span className="font-semibold">{t.review.move}:</span>{" "}
              {currentPly === 0
                ? t.review.startPosition
                : `${currentPly}. ${currentMove?.san ?? ""}`}
            </p>
            <p className="mt-1 break-all">
              <span className="font-semibold">FEN:</span> {currentFen}
            </p>
          </div>

          {analysisVisible ? (
            <div className="mt-4 rounded-xl bg-gray-100 p-3 text-sm text-gray-700">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{t.review.stockfish}</p>
                <p className="text-xs text-gray-500">
                  {getAnalysisStatusText(analysisStatus, analysisError, t.review)}
                </p>
              </div>

              <div className="mt-3 grid gap-2 text-sm">
                <p>
                  <span className="font-semibold">{t.review.depthReached}:</span>{" "}
                  {currentAnalysis?.depthReached ?? 0}
                </p>
                <p>
                  <span className="font-semibold">{t.review.eval}:</span>{" "}
                  {formatEngineScore(
                    whitePerspectiveEval.scoreCp,
                    whitePerspectiveEval.mate
                  )}
                </p>
                <p>
                  <span className="font-semibold">{t.review.bestMove}:</span>{" "}
                  {bestMoveSan ?? "—"}
                </p>
                <p className="break-words">
                  <span className="font-semibold">{t.review.pv}:</span>{" "}
                  {pvSan || "—"}
                </p>
                {analysisError ? (
                  <p className="text-sm text-red-600">{analysisError}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">{t.review.moves}</h2>

          <div className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-gray-100 p-3">
            {moveRows.length === 0 ? (
              <p className="text-sm text-gray-600">{t.review.noMovesRecorded}</p>
            ) : (
              <div className="space-y-2">
                {moveRows.map((row) => {
                  const whiteSelected = row.white?.moveNumber === currentPly;
                  const blackSelected = row.black?.moveNumber === currentPly;

                  const whiteTag = row.white
                    ? moveTagsById.get(row.white.id)
                    : undefined;

                  const blackTag = row.black
                    ? moveTagsById.get(row.black.id)
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
                          className={`w-full rounded-lg px-2 py-1 text-left ${whiteSelected
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
                          className={`w-full rounded-lg px-2 py-1 text-left ${blackSelected
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