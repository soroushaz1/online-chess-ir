import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { Chess, type Square } from "chess.js";
import { prisma } from "@/lib/prisma";

const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type EngineResult = {
  depthReached: number;
  scoreCp: number | null;
  mate: number | null;
  bestMove: string | null;
  pv: string[];
};

type MoveInput = {
  id: string;
  moveNumber: number;
  san: string;
  uci: string;
  fenAfter: string;
};

function normalizeFen(fen: string) {
  return fen === "start" ? STANDARD_START_FEN : fen;
}

function createChessFromFen(fen: string) {
  return fen === "start" ? new Chess() : new Chess(fen);
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
    return {
      classification: "Brilliant" as const,
      evalLossCp: loss,
    };
  }

  if (params.playedMove.uci === params.beforeAnalysis.bestMove) {
    return {
      classification: "Best" as const,
      evalLossCp: loss,
    };
  }

  if (loss <= 40) {
    return { classification: "Good" as const, evalLossCp: loss };
  }

  if (loss <= 120) {
    return { classification: "Inaccuracy" as const, evalLossCp: loss };
  }

  if (loss <= 260) {
    return { classification: "Mistake" as const, evalLossCp: loss };
  }

  return { classification: "Blunder" as const, evalLossCp: loss };
}

class UciEngine {
  private process: ChildProcessWithoutNullStreams;
  private uciReadyResolver: (() => void) | null = null;
  private readyResolver: (() => void) | null = null;
  private currentAnalysis:
    | {
        resolve: (value: EngineResult) => void;
        reject: (reason?: unknown) => void;
        latest: EngineResult;
      }
    | null = null;

  constructor(binaryPath = process.env.STOCKFISH_PATH || "stockfish") {
    this.process = spawn(binaryPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    stdout.on("line", (line) => {
      this.handleLine(line.trim());
    });

    const stderr = readline.createInterface({
      input: this.process.stderr,
      crlfDelay: Infinity,
    });

    stderr.on("line", (line) => {
      console.error("[stockfish]", line);
    });

    this.process.on("error", (error) => {
      this.currentAnalysis?.reject(error);
      this.currentAnalysis = null;
    });

    this.process.on("exit", (code, signal) => {
      if (this.currentAnalysis) {
        this.currentAnalysis.reject(
          new Error(`Stockfish exited early (code=${code}, signal=${signal})`)
        );
        this.currentAnalysis = null;
      }
    });
  }

  private send(command: string) {
    this.process.stdin.write(`${command}\n`);
  }

  private handleLine(line: string) {
    if (line === "uciok") {
      this.uciReadyResolver?.();
      this.uciReadyResolver = null;
      return;
    }

    if (line === "readyok") {
      this.readyResolver?.();
      this.readyResolver = null;
      return;
    }

    if (line.startsWith("info ") && this.currentAnalysis) {
      const multipvMatch = line.match(/\bmultipv (\d+)\b/);
      if (multipvMatch && multipvMatch[1] !== "1") {
        return;
      }

      const depthMatch = line.match(/\bdepth (\d+)\b/);
      const cpMatch = line.match(/\bscore cp (-?\d+)\b/);
      const mateMatch = line.match(/\bscore mate (-?\d+)\b/);
      const pvMatch = line.match(/\bpv (.+)$/);

      this.currentAnalysis.latest = {
        ...this.currentAnalysis.latest,
        depthReached: depthMatch
          ? Number(depthMatch[1])
          : this.currentAnalysis.latest.depthReached,
        scoreCp: cpMatch
          ? Number(cpMatch[1])
          : this.currentAnalysis.latest.scoreCp,
        mate: mateMatch
          ? Number(mateMatch[1])
          : this.currentAnalysis.latest.mate,
        pv: pvMatch
          ? pvMatch[1].trim().split(/\s+/)
          : this.currentAnalysis.latest.pv,
      };

      return;
    }

    if (line.startsWith("bestmove ") && this.currentAnalysis) {
      const bestMove = line.split(/\s+/)[1] ?? null;

      const result: EngineResult = {
        ...this.currentAnalysis.latest,
        bestMove,
      };

      this.currentAnalysis.resolve(result);
      this.currentAnalysis = null;
    }
  }

  async init() {
    await new Promise<void>((resolve) => {
      this.uciReadyResolver = resolve;
      this.send("uci");
    });

    await new Promise<void>((resolve) => {
      this.readyResolver = resolve;
      this.send("setoption name UCI_AnalyseMode value true");
      this.send("setoption name MultiPV value 1");
      this.send("isready");
    });
  }

  async analyzeFen(
    fen: string,
    options: {
      movetimeMs?: number;
      depth?: number;
    } = {}
  ) {
    if (this.currentAnalysis) {
      throw new Error("Concurrent Stockfish analysis is not supported");
    }

    const normalizedFen = normalizeFen(fen);

    return new Promise<EngineResult>((resolve, reject) => {
      this.currentAnalysis = {
        resolve,
        reject,
        latest: {
          depthReached: 0,
          scoreCp: null,
          mate: null,
          bestMove: null,
          pv: [],
        },
      };

      this.send("stop");
      this.send("ucinewgame");
      this.send(`position fen ${normalizedFen}`);

      if (typeof options.depth === "number") {
        this.send(`go depth ${options.depth}`);
      } else {
        this.send(`go movetime ${options.movetimeMs ?? 1200}`);
      }
    });
  }

  async close() {
    try {
      this.send("stop");
      this.send("quit");
    } catch {}

    if (!this.process.killed) {
      this.process.kill();
    }
  }
}

type AnalysisGlobalState = {
  runningGameIds: Set<string>;
};

const globalAnalysis = globalThis as typeof globalThis & {
  __gameAnalysisState?: AnalysisGlobalState;
};

const analysisState =
  globalAnalysis.__gameAnalysisState ??
  (globalAnalysis.__gameAnalysisState = {
    runningGameIds: new Set<string>(),
  });

export function queueGameAnalysis(gameId: string) {
  if (analysisState.runningGameIds.has(gameId)) {
    return;
  }

  analysisState.runningGameIds.add(gameId);

  void runGameAnalysis(gameId).finally(() => {
    analysisState.runningGameIds.delete(gameId);
  });
}

async function runGameAnalysis(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      whitePlayer: {
        select: { username: true },
      },
      blackPlayer: {
        select: { username: true },
      },
      moves: {
        orderBy: {
          moveNumber: "asc",
        },
      },
    },
  });

  if (!game || game.status !== "finished") {
    return;
  }

  await prisma.$transaction([
    prisma.gameAnalysisMove.deleteMany({
      where: { gameId },
    }),
    prisma.gameAnalysisPosition.deleteMany({
      where: { gameId },
    }),
    prisma.game.update({
      where: { id: gameId },
      data: {
        analysisStatus: "running",
        analysisStartedAt: new Date(),
        analysisCompletedAt: null,
        analysisError: null,
      },
    }),
  ]);

  if (game.moves.length === 0) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        analysisStatus: "completed",
        analysisCompletedAt: new Date(),
      },
    });
    return;
  }

  const engine = new UciEngine();
  const cache = new Map<string, EngineResult>();

  try {
    await engine.init();

    const positions = [
      { ply: 0, fen: game.initialFen },
      ...game.moves.map((move, index) => ({
        ply: index + 1,
        fen: move.fenAfter,
      })),
    ];

    async function analyzeCached(fen: string) {
      const normalizedFen = normalizeFen(fen);
      const cached = cache.get(normalizedFen);
      if (cached) return cached;

      const result = await engine.analyzeFen(fen, { movetimeMs: 1200 });
      cache.set(normalizedFen, result);
      return result;
    }

    const positionResults: EngineResult[] = [];

    for (const position of positions) {
      const analysis = await analyzeCached(position.fen);
      positionResults[position.ply] = analysis;

      await prisma.gameAnalysisPosition.upsert({
        where: {
          gameId_ply: {
            gameId,
            ply: position.ply,
          },
        },
        create: {
          gameId,
          ply: position.ply,
          fen: normalizeFen(position.fen),
          depthReached: analysis.depthReached,
          scoreCp: analysis.scoreCp,
          mate: analysis.mate,
          bestMoveUci: analysis.bestMove,
          bestMoveSan: uciToSan(position.fen, analysis.bestMove),
          pv: analysis.pv.join(" "),
        },
        update: {
          fen: normalizeFen(position.fen),
          depthReached: analysis.depthReached,
          scoreCp: analysis.scoreCp,
          mate: analysis.mate,
          bestMoveUci: analysis.bestMove,
          bestMoveSan: uciToSan(position.fen, analysis.bestMove),
          pv: analysis.pv.join(" "),
        },
      });
    }

    const moveRows = game.moves.map((move, index) => {
      const beforeFen = index === 0 ? game.initialFen : game.moves[index - 1].fenAfter;
      const beforeAnalysis = positionResults[index];
      const afterAnalysis = positionResults[index + 1];

      const { classification, evalLossCp } = classifyMove({
        beforeFen,
        playedMove: move,
        beforeAnalysis,
        afterAnalysis,
      });

      return {
        gameId,
        moveId: move.id,
        moveNumber: move.moveNumber,
        classification,
        evalLossCp,
      };
    });

    if (moveRows.length > 0) {
      await prisma.gameAnalysisMove.createMany({
        data: moveRows,
      });
    }

    await prisma.game.update({
      where: { id: gameId },
      data: {
        analysisStatus: "completed",
        analysisCompletedAt: new Date(),
        analysisError: null,
      },
    });
  } catch (error) {
    console.error("Game analysis failed", { gameId, error });

    await prisma.game.update({
      where: { id: gameId },
      data: {
        analysisStatus: "failed",
        analysisCompletedAt: new Date(),
        analysisError:
          error instanceof Error ? error.message : "Unknown analysis error",
      },
    });
  } finally {
    await engine.close();
  }
}