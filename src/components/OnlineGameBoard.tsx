"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { getSocket } from "@/lib/socket";

type Player = {
  id: string;
  username: string;
  phoneNumber: string;
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
type PromotionPiece = "q" | "r" | "b" | "n";
type SoundName = "move" | "capture" | "check" | "gameEnd";

type CurrentUser = {
  id: string;
  username: string;
  phoneNumber: string;
};

type Game = {
  id: string;
  currentFen: string;
  pgn: string;
  status: string;
  result: string | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  turnStartedAt: string | null;
  whiteJoinToken: string | null;
  blackJoinToken: string | null;
  whiteConnected: boolean;
  blackConnected: boolean;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  whitePlayer: Player | null;
  blackPlayer: Player | null;
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

type MeResponse = {
  ok: boolean;
  user: CurrentUser | null;
};

type HighlightedMove = {
  square: string;
  isCapture: boolean;
};

function getTurnFromFen(fen: string): Side {
  return fen.split(" ")[1] === "b" ? "black" : "white";
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
  if (turn !== side) return base;

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

function hasSideMoved(moves: Move[], side: Side) {
  return moves.some((move) =>
    side === "white" ? move.moveNumber % 2 === 1 : move.moveNumber % 2 === 0
  );
}

function canPlayerInteract(
  game: Game | null,
  playerSide: Side | null,
  isSubmitting: boolean
) {
  if (!game || !playerSide || isSubmitting) return false;
  if (game.status !== "active") return false;
  return getTurnFromFen(game.currentFen) === playerSide;
}

function isBoardSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

function getPromotionFromUci(uci: string): PromotionPiece | undefined {
  const promotion = uci[4];
  if (
    promotion === "q" ||
    promotion === "r" ||
    promotion === "b" ||
    promotion === "n"
  ) {
    return promotion;
  }
  return undefined;
}

function getSoundForGameUpdate(
  previousGame: Game,
  nextGame: Game
): SoundName | null {
  if (nextGame.moves.length > previousGame.moves.length) {
    const lastMove = nextGame.moves[nextGame.moves.length - 1];

    try {
      const chess = new Chess(previousGame.currentFen);
      const move = chess.move({
        from: lastMove.uci.slice(0, 2),
        to: lastMove.uci.slice(2, 4),
        promotion: getPromotionFromUci(lastMove.uci),
      });

      if (!move) {
        return nextGame.status === "finished" ? "gameEnd" : "move";
      }

      if (move.san.includes("#") || nextGame.status === "finished") {
        return "gameEnd";
      }

      if (move.san.includes("+")) {
        return "check";
      }

      if (move.captured) {
        return "capture";
      }

      return "move";
    } catch {
      return nextGame.status === "finished" ? "gameEnd" : "move";
    }
  }

  if (previousGame.status !== "finished" && nextGame.status === "finished") {
    return "gameEnd";
  }

  return null;
}

export default function OnlineGameBoard({ gameId }: { gameId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [boardFen, setBoardFen] = useState("start");
  const [statusMessage, setStatusMessage] = useState("Loading game...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setTick] = useState(0);

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [highlightedMoves, setHighlightedMoves] = useState<HighlightedMove[]>(
    []
  );
  const [soundEnabled, setSoundEnabled] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const hasSeenInitialGameRef = useRef(false);
  const previousGameRef = useRef<Game | null>(null);

  const playerSide = useMemo<Side | null>(() => {
    if (!game || !currentUser) return null;
    if (game.whitePlayerId === currentUser.id) return "white";
    if (game.blackPlayerId === currentUser.id) return "black";
    return null;
  }, [game, currentUser]);

  const boardIsInteractive = useMemo(
    () => canPlayerInteract(game, playerSide, isSubmitting),
    [game, playerSide, isSubmitting]
  );

  const clearMoveHighlights = useCallback(() => {
    setSelectedSquare(null);
    setHighlightedMoves([]);
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;

    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playSound = useCallback(
    async (sound: SoundName) => {
      if (!soundEnabled) return;

      const context = await ensureAudioContext();
      if (!context) return;

      const now = context.currentTime + 0.01;

      const scheduleTone = (
        frequency: number,
        start: number,
        duration: number,
        type: OscillatorType,
        volume: number
      ) => {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);

        gainNode.gain.setValueAtTime(0.0001, start);
        gainNode.gain.exponentialRampToValueAtTime(volume, start + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          start + duration
        );

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      };

      if (sound === "move") {
        scheduleTone(660, now, 0.06, "sine", 0.03);
        scheduleTone(880, now + 0.07, 0.08, "sine", 0.025);
        return;
      }

      if (sound === "capture") {
        scheduleTone(440, now, 0.07, "square", 0.04);
        scheduleTone(220, now + 0.08, 0.12, "square", 0.035);
        return;
      }

      if (sound === "check") {
        scheduleTone(740, now, 0.06, "triangle", 0.03);
        scheduleTone(880, now + 0.08, 0.06, "triangle", 0.03);
        scheduleTone(1047, now + 0.16, 0.1, "triangle", 0.035);
        return;
      }

      scheduleTone(523, now, 0.12, "sine", 0.03);
      scheduleTone(392, now + 0.14, 0.12, "sine", 0.03);
      scheduleTone(262, now + 0.28, 0.22, "sine", 0.035);
    },
    [ensureAudioContext, soundEnabled]
  );

  const loadGame = useCallback(async () => {
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
  }, [gameId]);

  const tryJoinGame = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`/api/games/${gameId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data: ActionResponse = await response.json();

      if (!response.ok || !data.ok || !data.game) {
        setStatusMessage(data.error ?? "Failed to join game");
        return;
      }

      setGame(data.game);
      setBoardFen(data.game.currentFen);
      setStatusMessage(getStatusMessage(data.game));
    } catch (error) {
      console.error("join failed", error);
      setStatusMessage("Failed to join game");
    }
  }, [gameId, token]);

  const updatePresence = useCallback(
    async (connected: boolean) => {
      if (!playerSide) return;

      try {
        const response = await fetch(`/api/games/${gameId}/presence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connected,
          }),
        });

        const data: ActionResponse = await response.json();

        if (response.ok && data.ok && data.game) {
          setGame(data.game);
          setBoardFen(data.game.currentFen);
          setStatusMessage(getStatusMessage(data.game));
          return;
        }

        await loadGame();
      } catch {
        await loadGame();
      }
    },
    [playerSide, gameId, loadGame]
  );

  const showLegalMovesForSquare = useCallback(
    (square: string) => {
      if (!boardIsInteractive || !game || !playerSide) {
        clearMoveHighlights();
        return;
      }

      if (!isBoardSquare(square)) {
        clearMoveHighlights();
        return;
      }

      const piece = getPieceAtSquare(game.currentFen, square);

      if (!piece || !isPieceOfSide(piece, playerSide)) {
        clearMoveHighlights();
        return;
      }

      const chess = new Chess(game.currentFen);
      const moves = chess.moves({ square, verbose: true });

      if (!moves.length) {
        clearMoveHighlights();
        return;
      }

      setSelectedSquare(square);
      setHighlightedMoves(
        moves.map((move) => ({
          square: move.to,
          isCapture: Boolean(move.captured),
        }))
      );
    },
    [boardIsInteractive, game, playerSide, clearMoveHighlights]
  );

  const moveHighlightStyles = useMemo<Record<string, CSSProperties>>(() => {
    const styles: Record<string, CSSProperties> = {};

    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: "rgba(250, 204, 21, 0.45)",
        boxShadow: "inset 0 0 0 3px rgba(202, 138, 4, 0.9)",
      };
    }

    for (const move of highlightedMoves) {
      styles[move.square] = move.isCapture
        ? {
          backgroundColor: "rgba(34, 197, 94, 0.18)",
          boxShadow: "inset 0 0 0 4px rgba(34, 197, 94, 0.85)",
        }
        : {
          background:
            "radial-gradient(circle, rgba(34, 197, 94, 0.45) 20%, transparent 22%)",
        };
    }

    return styles;
  }, [selectedSquare, highlightedMoves]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        "online-chess-sound-enabled"
      );
      if (saved !== null) {
        setSoundEnabled(saved === "true");
      }
    } catch { }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "online-chess-sound-enabled",
        String(soundEnabled)
      );
    } catch { }
  }, [soundEnabled]);

  useEffect(() => {
    async function initializePage() {
      try {
        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const meData: MeResponse = await meResponse.json();

        setCurrentUser(meData.user);

        if (meData.user && token) {
          await tryJoinGame();
        }

        await loadGame();
      } catch (error) {
        console.error("initializePage failed", error);
        setStatusMessage("Failed to initialize game");
      }
    }

    void initializePage();
  }, [gameId, token, tryJoinGame, loadGame]);

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

    let active = true;

    void (async () => {
      if (!active) return;
      await updatePresence(true);
    })();

    return () => {
      active = false;
      void updatePresence(false);
    };
  }, [playerSide, gameId, updatePresence]);

  useEffect(() => {
    clearMoveHighlights();
  }, [boardFen, clearMoveHighlights]);

  useEffect(() => {
    if (!boardIsInteractive) {
      clearMoveHighlights();
    }
  }, [boardIsInteractive, clearMoveHighlights]);

  useEffect(() => {
    if (!game) return;

    if (!hasSeenInitialGameRef.current) {
      hasSeenInitialGameRef.current = true;
      previousGameRef.current = game;
      return;
    }

    const previousGame = previousGameRef.current;

    if (!previousGame) {
      previousGameRef.current = game;
      return;
    }

    const soundToPlay = getSoundForGameUpdate(previousGame, game);

    if (soundToPlay) {
      void playSound(soundToPlay);
    }

    previousGameRef.current = game;
  }, [game, playSound]);

  useEffect(() => {
    return () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;

      if (context) {
        void context.close().catch(() => { });
      }
    };
  }, []);

  const submitMove = useCallback(
    async (from: string, to: string) => {
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
    },
    [gameId, loadGame]
  );

  async function handleResign() {
    if (!playerSide || !game) return;

    void ensureAudioContext();

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

    void ensureAudioContext();

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

  const attemptMove = useCallback(
    (sourceSquare: string, targetSquare: string) => {
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

      let move;
      try {
        move = chess.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch {
        setStatusMessage("Illegal move");
        return false;
      }

      if (!move) {
        setStatusMessage("Illegal move");
        return false;
      }

      clearMoveHighlights();
      setIsSubmitting(true);
      setBoardFen(chess.fen());
      setStatusMessage("Submitting move...");
      void submitMove(sourceSquare, targetSquare);

      return true;
    },
    [game, isSubmitting, playerSide, clearMoveHighlights, submitMove]
  );

  function onPieceDrop(sourceSquare: string, targetSquare: string) {
    void ensureAudioContext();
    return attemptMove(sourceSquare, targetSquare);
  }

  function handleSquareClick(square: string) {
    void ensureAudioContext();

    if (!game || isSubmitting) return;

    if (selectedSquare) {
      if (square === selectedSquare) {
        clearMoveHighlights();
        return;
      }

      const isHighlightedTarget = highlightedMoves.some(
        (move) => move.square === square
      );

      if (isHighlightedTarget) {
        attemptMove(selectedSquare, square);
        return;
      }
    }

    showLegalMovesForSquare(square);
  }

  function handlePieceDragBegin(_piece: string, sourceSquare: string) {
    void ensureAudioContext();
    showLegalMovesForSquare(sourceSquare);
  }

  async function handleToggleSound() {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);

    if (nextValue) {
      await ensureAudioContext();
      void playSound("move");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Online Chess IR</h1>
        <p className="mt-1 text-sm text-gray-600">Live database-backed game</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <Chessboard
            id="online-game-board"
            position={boardFen}
            onPieceDrop={onPieceDrop}
            onSquareClick={handleSquareClick}
            onPieceDragBegin={handlePieceDragBegin}
            customSquareStyles={moveHighlightStyles}
            arePiecesDraggable={boardIsInteractive}
            boardOrientation={playerSide ?? "white"}
          />
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Game Info</h2>

          <div className="mt-4 space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-semibold">Logged in as:</span>{" "}
              {currentUser?.username ?? "Guest"}
            </p>
            <p>
              <span className="font-semibold">You are:</span>{" "}
              {getSideLabel(playerSide)}
            </p>
            <p>
              <span className="font-semibold">White:</span>{" "}
              {game?.whitePlayer?.username ?? "Waiting..."}
            </p>
            <p>
              <span className="font-semibold">Black:</span>{" "}
              {game?.blackPlayer?.username ?? "Waiting..."}
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
            <div className="flex items-center justify-between">
              <span className="text-sm">
                <span className="font-semibold">Sound:</span>{" "}
                {soundEnabled ? "On" : "Off"}
              </span>

              <button
                type="button"
                onClick={handleToggleSound}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? "Turn sound off" : "Turn sound on"}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${soundEnabled ? "bg-blue-600" : "bg-gray-300"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${soundEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                />
              </button>
            </div>
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
              disabled={
                !playerSide ||
                game?.status === "finished" ||
                (game ? hasSideMoved(game.moves, playerSide) : false)
              }
              className="rounded-xl bg-gray-700 px-4 py-2 text-white disabled:opacity-50"
            >
              Abort
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-100 p-3 text-sm">
            <p className="font-semibold">Seat assignment</p>
            <p className="mt-2">
              The creator gets a random color. The invite link lets another
              logged-in player claim the open seat.
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