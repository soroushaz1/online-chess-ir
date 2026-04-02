"use client";

import { useEffect, useReducer, useRef } from "react";

const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type CachedAnalysis = {
  depthReached: number;
  scoreCp: number | null;
  mate: number | null;
  bestMove: string | null;
  pv: string[];
};

type AnalysisState = {
  engineReady: boolean;
  analyzing: boolean;
  depthReached: number;
  scoreCp: number | null;
  mate: number | null;
  bestMove: string | null;
  pv: string[];
  error: string | null;
};

type Action =
  | { type: "reset" }
  | { type: "ready" }
  | { type: "start" }
  | {
      type: "info";
      depthReached?: number;
      scoreCp?: number | null;
      mate?: number | null;
      pv?: string[];
    }
  | { type: "bestmove"; bestMove: string | null }
  | { type: "hydrate"; payload: CachedAnalysis }
  | { type: "error"; error: string };

const initialState: AnalysisState = {
  engineReady: false,
  analyzing: false,
  depthReached: 0,
  scoreCp: null,
  mate: null,
  bestMove: null,
  pv: [],
  error: null,
};

function reducer(state: AnalysisState, action: Action): AnalysisState {
  switch (action.type) {
    case "reset":
      return initialState;

    case "ready":
      return {
        ...state,
        engineReady: true,
        error: null,
      };

    case "start":
      return {
        ...state,
        analyzing: true,
        depthReached: 0,
        scoreCp: null,
        mate: null,
        bestMove: null,
        pv: [],
        error: null,
      };

    case "info":
      return {
        ...state,
        analyzing: true,
        depthReached: action.depthReached ?? state.depthReached,
        scoreCp:
          action.scoreCp !== undefined ? action.scoreCp : state.scoreCp,
        mate: action.mate !== undefined ? action.mate : state.mate,
        pv: action.pv ?? state.pv,
      };

    case "bestmove":
      return {
        ...state,
        analyzing: false,
        bestMove: action.bestMove,
      };

    case "hydrate":
      return {
        ...state,
        analyzing: false,
        depthReached: action.payload.depthReached,
        scoreCp: action.payload.scoreCp,
        mate: action.payload.mate,
        bestMove: action.payload.bestMove,
        pv: action.payload.pv,
        error: null,
      };

    case "error":
      return {
        ...state,
        analyzing: false,
        error: action.error,
      };

    default:
      return state;
  }
}

function normalizeFen(fen: string) {
  return fen === "start" ? STANDARD_START_FEN : fen;
}

export function useStockfishAnalysis({
  enabled,
  fen,
  depth,
  movetimeMs,
}: {
  enabled: boolean;
  fen: string;
  depth?: number;
  movetimeMs?: number;
}) {
  const workerRef = useRef<Worker | null>(null);
  const cacheRef = useRef<Map<string, CachedAnalysis>>(new Map());
  const currentCacheKeyRef = useRef<string | null>(null);
  const currentAnalysisRef = useRef<CachedAnalysis>({
    depthReached: 0,
    scoreCp: null,
    mate: null,
    bestMove: null,
    pv: [],
  });

  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    dispatch({ type: "reset" });

    const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    workerRef.current = worker;

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

        const nextDepth = depthMatch
          ? Number(depthMatch[1])
          : currentAnalysisRef.current.depthReached;

        const nextScoreCp = cpMatch
          ? Number(cpMatch[1])
          : currentAnalysisRef.current.scoreCp;

        const nextMate = mateMatch
          ? Number(mateMatch[1])
          : currentAnalysisRef.current.mate;

        const nextPv = pvMatch
          ? pvMatch[1].trim().split(/\s+/)
          : currentAnalysisRef.current.pv;

        currentAnalysisRef.current = {
          ...currentAnalysisRef.current,
          depthReached: nextDepth,
          scoreCp: nextScoreCp,
          mate: nextMate,
          pv: nextPv,
        };

        dispatch({
          type: "info",
          depthReached: nextDepth,
          scoreCp: nextScoreCp,
          mate: nextMate,
          pv: nextPv,
        });

        return;
      }

      if (line.startsWith("bestmove ")) {
        const bestMove = line.split(/\s+/)[1] ?? null;

        currentAnalysisRef.current = {
          ...currentAnalysisRef.current,
          bestMove,
        };

        if (currentCacheKeyRef.current) {
          cacheRef.current.set(currentCacheKeyRef.current, {
            ...currentAnalysisRef.current,
          });
        }

        dispatch({ type: "bestmove", bestMove });
      }
    };

    worker.onerror = () => {
      dispatch({
        type: "error",
        error: "Stockfish worker crashed",
      });
    };

    worker.postMessage("uci");

    return () => {
      try {
        worker.postMessage("stop");
        worker.postMessage("quit");
      } catch {}

      worker.terminate();
      workerRef.current = null;
      currentCacheKeyRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    const worker = workerRef.current;

    if (!enabled || !worker || !state.engineReady) {
      return;
    }

    const normalizedFen = normalizeFen(fen);
    const modeKey =
      typeof depth === "number"
        ? `depth:${depth}`
        : `movetime:${movetimeMs ?? 1500}`;

    const cacheKey = `${modeKey}::${normalizedFen}`;
    currentCacheKeyRef.current = cacheKey;

    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      currentAnalysisRef.current = { ...cached };
      dispatch({
        type: "hydrate",
        payload: cached,
      });
      return;
    }

    currentAnalysisRef.current = {
      depthReached: 0,
      scoreCp: null,
      mate: null,
      bestMove: null,
      pv: [],
    };

    dispatch({ type: "start" });

    worker.postMessage("stop");
    worker.postMessage("ucinewgame");
    worker.postMessage(`position fen ${normalizedFen}`);

    if (typeof depth === "number") {
      worker.postMessage(`go depth ${depth}`);
    } else {
      worker.postMessage(`go movetime ${movetimeMs ?? 1500}`);
    }
  }, [enabled, fen, depth, movetimeMs, state.engineReady]);

  return enabled ? state : initialState;
}