import { Chess } from "chess.js";

const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type UciMoveInput = {
  uci: string;
};

type PgnGameInput = {
  initialFen: string | null;
  moves: UciMoveInput[];
  whiteName?: string | null;
  blackName?: string | null;
  result?: string | null;
  createdAt?: Date | string | null;
  site?: string;
};

function formatPgnDate(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}.${mm}.${dd}`;
}

function isStandardStartPosition(initialFen?: string | null) {
  return (
    !initialFen ||
    initialFen === "start" ||
    initialFen === STANDARD_START_FEN
  );
}

function createChessFromInitialFen(initialFen?: string | null) {
  if (isStandardStartPosition(initialFen)) {
    return new Chess();
  }

  return new Chess(initialFen as string);
}

function parseUciMove(uci: string) {
  const normalized = uci.trim().toLowerCase();

  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) {
    throw new Error(`Invalid UCI move: ${uci}`);
  }

  const from = normalized.slice(0, 2);
  const to = normalized.slice(2, 4);
  const promotion =
    normalized.length === 5
      ? (normalized[4] as "q" | "r" | "b" | "n")
      : undefined;

  return { from, to, promotion };
}

export function replayGameFromInitialFen(
  initialFen: string | null | undefined,
  moves: UciMoveInput[]
) {
  const chess = createChessFromInitialFen(initialFen);

  for (const move of moves) {
    const parsedMove = parseUciMove(move.uci);
    const result = chess.move(parsedMove);

    if (!result) {
      throw new Error(`Invalid move while replaying game: ${move.uci}`);
    }
  }

  return chess;
}

export function buildGamePgn(input: PgnGameInput) {
  const chess = createChessFromInitialFen(input.initialFen);

  for (const move of input.moves) {
    const parsedMove = parseUciMove(move.uci);
    const result = chess.move(parsedMove);

    if (!result) {
      throw new Error(`Invalid move while building PGN: ${move.uci}`);
    }
  }

  chess.setHeader("Event", "Online Chess IR");
  chess.setHeader("Site", input.site ?? "https://playonlinechess.ir");
  chess.setHeader("Date", formatPgnDate(input.createdAt));
  chess.setHeader("Round", "-");
  chess.setHeader("White", input.whiteName?.trim() || "White");
  chess.setHeader("Black", input.blackName?.trim() || "Black");
  chess.setHeader("Result", input.result ?? "*");

  if (!isStandardStartPosition(input.initialFen)) {
    chess.setHeader("SetUp", "1");
    chess.setHeader("FEN", input.initialFen as string);
  }

  return chess.pgn();
}