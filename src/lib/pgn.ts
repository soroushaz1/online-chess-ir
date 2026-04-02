import { Chess } from "chess.js";

const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type PgnGameInput = {
  initialFen: string;
  moves: Array<{
    uci: string;
  }>;
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

export function buildGamePgn(input: PgnGameInput) {
  const chess =
    input.initialFen && input.initialFen !== STANDARD_START_FEN
      ? new Chess(input.initialFen)
      : new Chess();

  for (const move of input.moves) {
    const ok = chess.move(move.uci);
    if (!ok) {
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

  if (input.initialFen && input.initialFen !== STANDARD_START_FEN) {
    chess.setHeader("SetUp", "1");
    chess.setHeader("FEN", input.initialFen);
  }

  return chess.pgn();
}