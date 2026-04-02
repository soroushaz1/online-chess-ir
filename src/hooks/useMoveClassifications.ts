"use client";

import { useEffect, useReducer, useRef } from "react";
import { Chess, type Square } from "chess.js";

const STANDARD_START_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type MoveInput = {
    id: string;
    moveNumber: number;
    san: string;
    uci: string;
    fenAfter: string;
};

type EngineResult = {
    depthReached: number;
    scoreCp: number | null;
    mate: number | null;
    bestMove: string | null;
    pv: string[];
};

type MoveTag =
    | "Brilliant"
    | "Best"
    | "Good"
    | "Inaccuracy"
    | "Mistake"
    | "Blunder";

type ClassificationRecord = Record<string, MoveTag>;

type State = {
    ready: boolean;
    running: boolean;
    progress: number;
    total: number;
    tags: ClassificationRecord;
    error: string | null;
};

type Action =
    | { type: "reset"; total: number }
    | { type: "ready" }
    | { type: "set-tag"; moveId: string; tag: MoveTag; progress: number }
    | { type: "done" }
    | { type: "error"; error: string };

const initialState: State = {
    ready: false,
    running: false,
    progress: 0,
    total: 0,
    tags: {},
    error: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case "reset":
            return {
                ready: false,
                running: true,
                progress: 0,
                total: action.total,
                tags: {},
                error: null,
            };

        case "ready":
            return {
                ...state,
                ready: true,
            };

        case "set-tag":
            return {
                ...state,
                running: true,
                progress: action.progress,
                tags: {
                    ...state.tags,
                    [action.moveId]: action.tag,
                },
            };

        case "done":
            return {
                ...state,
                running: false,
            };

        case "error":
            return {
                ...state,
                running: false,
                error: action.error,
            };

        default:
            return state;
    }
}

function normalizeFen(fen: string) {
    return fen === "start" ? STANDARD_START_FEN : fen;
}

function getTurnFromFen(fen: string) {
    if (fen === "start") return "white";
    return fen.split(" ")[1] === "b" ? "black" : "white";
}

function parseUciMove(uci: string) {
    const normalized = uci.trim().toLowerCase();

    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) {
        return null;
    }

    return {
        from: normalized.slice(0, 2) as Square,
        to: normalized.slice(2, 4) as Square,
        promotion:
            normalized.length === 5
                ? (normalized[4] as "q" | "r" | "b" | "n")
                : undefined,
    };
}

function createChessFromFen(fen: string) {
    return fen === "start" ? new Chess() : new Chess(fen);
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

function evalToNumeric(scoreCp: number | null, mate: number | null) {
    if (mate !== null) {
        return mate > 0
            ? 100000 - Math.min(Math.abs(mate), 999)
            : -100000 + Math.min(Math.abs(mate), 999);
    }

    return scoreCp ?? 0;
}

function getMoverPerspectiveEval(
    mover: "white" | "black",
    whitePerspectiveValue: number
) {
    return mover === "white" ? whitePerspectiveValue : -whitePerspectiveValue;
}

function materialValue(type: string) {
    if (type === "p") return 1;
    if (type === "n") return 3;
    if (type === "b") return 3;
    if (type === "r") return 5;
    if (type === "q") return 9;
    return 0;
}

function getMaterialBalance(chess: Chess) {
    let white = 0;
    let black = 0;

    for (const row of chess.board()) {
        for (const piece of row) {
            if (!piece) continue;
            const value = materialValue(piece.type);
            if (piece.color === "w") white += value;
            else black += value;
        }
    }

    return { white, black };
}

function isApproxBrilliant(
    beforeFen: string,
    playedUci: string,
    bestMove: string | null,
    mover: "white" | "black",
    moverBestEval: number,
    moverPlayedEval: number
) {
    if (!bestMove || playedUci !== bestMove) return false;

    try {
        const chess = createChessFromFen(beforeFen);
        const beforeMaterial = getMaterialBalance(chess);
        const parsed = parseUciMove(playedUci);
        if (!parsed) return false;

        const movingPiece = chess.get(parsed.from);
        if (!movingPiece) return false;

        if (movingPiece.type === "p" || movingPiece.type === "k") {
            return false;
        }

        const move = chess.move(parsed);
        if (!move) return false;

        const afterMaterial = getMaterialBalance(chess);

        const beforeMoverMaterial =
            mover === "white" ? beforeMaterial.white : beforeMaterial.black;

        const afterMoverMaterial =
            mover === "white" ? afterMaterial.white : afterMaterial.black;

        const materialSacrifice = beforeMoverMaterial - afterMoverMaterial >= 2;
        const evalStayedStrong = moverPlayedEval >= moverBestEval - 30;

        return materialSacrifice && evalStayedStrong;
    } catch {
        return false;
    }
}

function classifyMove(params: {
    beforeFen: string;
    playedMove: MoveInput;
    beforeAnalysis: EngineResult;
    afterAnalysis: EngineResult;
}) {
    const mover = getTurnFromFen(params.beforeFen);

    const beforeWhite = toWhitePerspective(
        params.beforeFen,
        params.beforeAnalysis.scoreCp,
        params.beforeAnalysis.mate
    );

    const afterWhite = toWhitePerspective(
        params.playedMove.fenAfter,
        params.afterAnalysis.scoreCp,
        params.afterAnalysis.mate
    );

    const moverBestEval = getMoverPerspectiveEval(
        mover,
        evalToNumeric(beforeWhite.scoreCp, beforeWhite.mate)
    );

    const moverPlayedEval = getMoverPerspectiveEval(
        mover,
        evalToNumeric(afterWhite.scoreCp, afterWhite.mate)
    );

    const loss = Math.max(0, moverBestEval - moverPlayedEval);

    if (
        isApproxBrilliant(
            params.beforeFen,
            params.playedMove.uci,
            params.beforeAnalysis.bestMove,
            mover,
            moverBestEval,
            moverPlayedEval
        )
    ) {
        return "Brilliant" as const;
    }

    if (params.playedMove.uci === params.beforeAnalysis.bestMove) {
        return "Best" as const;
    }

    if (loss <= 40) return "Good" as const;
    if (loss <= 120) return "Inaccuracy" as const;
    if (loss <= 260) return "Mistake" as const;
    return "Blunder" as const;
}

export function useMoveClassifications({
    enabled,
    initialFen,
    moves,
    movetimeMs = 1000,
}: {
    enabled: boolean;
    initialFen: string;
    moves: MoveInput[];
    movetimeMs?: number;
}) {
    const workerRef = useRef<Worker | null>(null);
    const cacheRef = useRef<Map<string, EngineResult>>(new Map());
    const readyResolveRef = useRef<(() => void) | null>(null);
    const pendingResolveRef = useRef<((value: EngineResult) => void) | null>(null);
    const pendingRejectRef = useRef<((reason?: unknown) => void) | null>(null);
    const latestInfoRef = useRef<EngineResult>({
        depthReached: 0,
        scoreCp: null,
        mate: null,
        bestMove: null,
        pv: [],
    });

    const [state, dispatch] = useReducer(reducer, initialState);

    useEffect(() => {
        if (!enabled) return;

        dispatch({ type: "reset", total: moves.length });

        const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
        workerRef.current = worker;

        const readyPromise = new Promise<void>((resolve) => {
            readyResolveRef.current = resolve;
        });

        worker.onmessage = (event: MessageEvent<string>) => {
            const line =
                typeof event.data === "string" ? event.data : String(event.data);

            if (line === "uciok") {
                worker.postMessage("setoption name UCI_AnalyseMode value true");
                worker.postMessage("setoption name MultiPV value 1");
                worker.postMessage("isready");
                return;
            }

            if (line === "readyok") {
                dispatch({ type: "ready" });
                readyResolveRef.current?.();
                readyResolveRef.current = null;
                return;
            }

            if (line.startsWith("info ")) {
                const multipvMatch = line.match(/\bmultipv (\d+)\b/);
                if (multipvMatch && multipvMatch[1] !== "1") {
                    return;
                }

                const depthMatch = line.match(/\bdepth (\d+)\b/);
                const cpMatch = line.match(/\bscore cp (-?\d+)\b/);
                const mateMatch = line.match(/\bscore mate (-?\d+)\b/);
                const pvMatch = line.match(/\bpv (.+)$/);

                latestInfoRef.current = {
                    ...latestInfoRef.current,
                    depthReached: depthMatch
                        ? Number(depthMatch[1])
                        : latestInfoRef.current.depthReached,
                    scoreCp: cpMatch
                        ? Number(cpMatch[1])
                        : latestInfoRef.current.scoreCp,
                    mate: mateMatch ? Number(mateMatch[1]) : latestInfoRef.current.mate,
                    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : latestInfoRef.current.pv,
                };

                return;
            }

            if (line.startsWith("bestmove ")) {
                const bestMove = line.split(/\s+/)[1] ?? null;
                const result: EngineResult = {
                    ...latestInfoRef.current,
                    bestMove,
                };

                pendingResolveRef.current?.(result);
                pendingResolveRef.current = null;
                pendingRejectRef.current = null;
            }
        };

        worker.onerror = () => {
            pendingRejectRef.current?.(new Error("Stockfish worker crashed"));
            pendingResolveRef.current = null;
            pendingRejectRef.current = null;
            dispatch({ type: "error", error: "Stockfish worker crashed" });
        };

        worker.postMessage("uci");

        let cancelled = false;

        async function analyzePosition(fen: string) {
            const normalizedFen = normalizeFen(fen);
            const cacheKey = `${movetimeMs}::${normalizedFen}`;
            const cached = cacheRef.current.get(cacheKey);
            if (cached) return cached;

            const result = await new Promise<EngineResult>((resolve, reject) => {
                latestInfoRef.current = {
                    depthReached: 0,
                    scoreCp: null,
                    mate: null,
                    bestMove: null,
                    pv: [],
                };

                pendingResolveRef.current = (value) => {
                    cacheRef.current.set(cacheKey, value);
                    resolve(value);
                };

                pendingRejectRef.current = reject;

                worker.postMessage("stop");
                worker.postMessage("ucinewgame");
                worker.postMessage(`position fen ${normalizedFen}`);
                worker.postMessage(`go movetime ${movetimeMs}`);
            });

            return result;
        }

        async function run() {
            try {
                await readyPromise;

                for (let i = 0; i < moves.length; i += 1) {
                    if (cancelled) return;

                    const move = moves[i];
                    const beforeFen = i === 0 ? initialFen : moves[i - 1].fenAfter;

                    const beforeAnalysis = await analyzePosition(beforeFen);
                    const afterAnalysis = await analyzePosition(move.fenAfter);

                    const tag = classifyMove({
                        beforeFen,
                        playedMove: move,
                        beforeAnalysis,
                        afterAnalysis,
                    });

                    dispatch({
                        type: "set-tag",
                        moveId: move.id,
                        tag,
                        progress: i + 1,
                    });
                }

                if (!cancelled) {
                    dispatch({ type: "done" });
                }
            } catch (error) {
                if (!cancelled) {
                    dispatch({
                        type: "error",
                        error:
                            error instanceof Error
                                ? error.message
                                : "Failed to classify moves",
                    });
                }
            }
        }

        run();

        return () => {
            cancelled = true;

            try {
                worker.postMessage("stop");
                worker.postMessage("quit");
            } catch { }

            worker.terminate();
            workerRef.current = null;
            readyResolveRef.current = null;
            pendingResolveRef.current = null;
            pendingRejectRef.current = null;
        };
    }, [enabled, initialFen, moves, movetimeMs]);

    return state;
}