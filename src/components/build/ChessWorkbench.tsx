"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Bot,
  Check,
  Copy,
  Cpu,
  Grid2x2,
  Play,
  RotateCcw,
  Sparkles,
  Undo2,
  Zap,
} from "lucide-react";
import { Window } from "@/components/Window";
import {
  applyMove,
  bitAt,
  CHESS_PRESETS,
  divideWithTiming,
  formatBitboardHex,
  getBitboards,
  getGameStatus,
  getLegalMoves,
  magicHashBreakdown,
  makeSquare,
  parseFen,
  pieceAttacksFromSquare,
  pieceColor,
  popcountBB,
  rankOf,
  searchBestMove,
  squareToCoord,
  STARTPOS_FEN,
  toFen,
  type ChessMove,
  type ChessState,
  type DivideEntry,
  type PieceChar,
  type PromoPiece,
  type SearchResult,
  type Square,
} from "@/lib/chess-browser";
import { cn } from "@/lib/utils";

type InspectorTab = "position" | "bitboards" | "magic" | "perft";
type BitboardLayer =
  | "selected"
  | "whiteAttacked"
  | "blackAttacked"
  | "allOccupancy"
  | "whiteOccupancy"
  | "blackOccupancy"
  | "none";

interface HistoryStep {
  move: ChessMove;
  fenAfter: string;
  stateAfter: ChessState;
}

const PROMO_OPTIONS: { type: PromoPiece; label: string }[] = [
  { type: "q", label: "Queen" },
  { type: "r", label: "Rook" },
  { type: "b", label: "Bishop" },
  { type: "n", label: "Knight" },
];

const BITBOARD_LAYERS: { id: BitboardLayer; label: string }[] = [
  { id: "selected", label: "Piece Attacks" },
  { id: "whiteAttacked", label: "White Attacks" },
  { id: "blackAttacked", label: "Black Attacks" },
  { id: "allOccupancy", label: "All Occ" },
  { id: "whiteOccupancy", label: "White Occ" },
  { id: "blackOccupancy", label: "Black Occ" },
  { id: "none", label: "Off" },
];

const PIECE_NAMES: Record<PieceChar, string> = {
  P: "White Pawn",
  N: "White Knight",
  B: "White Bishop",
  R: "White Rook",
  Q: "White Queen",
  K: "White King",
  p: "Black Pawn",
  n: "Black Knight",
  b: "Black Bishop",
  r: "Black Rook",
  q: "Black Queen",
  k: "Black King",
};

/** Clean Staunton-inspired vector silhouettes on a 45x45 viewBox. */
function ChessPieceSvg({
  piece,
  x,
  y,
  size,
}: {
  piece: PieceChar;
  x: number;
  y: number;
  size: number;
}) {
  const isWhite = pieceColor(piece) === "w";
  const type = piece.toLowerCase();
  const fill = isWhite ? "#fbfaf6" : "#1a1f2c";
  const stroke = isWhite ? "#1a1f2c" : "#0b0f18";
  const detailStroke = isWhite ? "#1a1f2c" : "#e5e9f2";

  return (
    <g
      transform={`translate(${x}, ${y}) scale(${size / 45})`}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none select-none"
    >
      {type === "p" && (
        <path
          d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
          fill={fill}
          stroke={stroke}
          strokeWidth={1.6}
        />
      )}
      {type === "n" && (
        <g>
          <path
            d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path
            d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <circle cx="15" cy="15.5" r="0.9" fill={detailStroke} />
          <path
            d="M9.5 25.5a0.5 0.5 0 1 1-1 0 0.5 0.5 0 1 1 1 0z"
            fill={detailStroke}
          />
        </g>
      )}
      {type === "b" && (
        <g>
          <path
            d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path
            d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <circle cx="22.5" cy="8" r="2.5" fill={fill} stroke={stroke} strokeWidth={1.5} />
          <path
            d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"
            fill="none"
            stroke={detailStroke}
            strokeWidth={1.4}
          />
        </g>
      )}
      {type === "r" && (
        <g>
          <path
            d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path d="M34 14l-3 3H14l-3-3" fill={fill} stroke={stroke} strokeWidth={1.6} />
          <path
            d="M31 17v12.5H14V17"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" fill={fill} stroke={stroke} strokeWidth={1.6} />
          <path d="M11 14h23" fill="none" stroke={detailStroke} strokeWidth={1.3} />
          {!isWhite && (
            <path
              d="M14 29.5h17M14 17h17M12 35.5h21"
              fill="none"
              stroke={detailStroke}
              strokeWidth={1.1}
            />
          )}
        </g>
      )}
      {type === "q" && (
        <g>
          <circle cx="6" cy="12" r="2.5" fill={fill} stroke={stroke} strokeWidth={1.4} />
          <circle cx="14" cy="9" r="2.5" fill={fill} stroke={stroke} strokeWidth={1.4} />
          <circle cx="22.5" cy="8" r="2.5" fill={fill} stroke={stroke} strokeWidth={1.4} />
          <circle cx="31" cy="9" r="2.5" fill={fill} stroke={stroke} strokeWidth={1.4} />
          <circle cx="39" cy="12" r="2.5" fill={fill} stroke={stroke} strokeWidth={1.4} />
          <path
            d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path
            d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path
            d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"
            fill="none"
            stroke={detailStroke}
            strokeWidth={1.3}
          />
        </g>
      )}
      {type === "k" && (
        <g>
          <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeWidth={1.7} />
          <path
            d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path
            d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"
            fill={fill}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <path
            d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"
            fill="none"
            stroke={detailStroke}
            strokeWidth={1.3}
          />
        </g>
      )}
    </g>
  );
}

function initialStartState(): ChessState {
  const res = parseFen(STARTPOS_FEN);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

function formatScore(res: SearchResult, turn: "w" | "b"): string {
  if (res.mateIn !== undefined) {
    const abs = Math.abs(res.mateIn);
    return res.mateIn > 0
      ? `${turn === "w" ? "White" : "Black"} mates in ${abs}`
      : `${turn === "w" ? "Black" : "White"} mates in ${abs}`;
  }
  const whiteCp = turn === "w" ? res.scoreCp : -res.scoreCp;
  const pawns = whiteCp / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function ChessWorkbench() {
  const [presetId, setPresetId] = useState<string>("startpos");
  const [rootFen, setRootFen] = useState<string>(STARTPOS_FEN);
  const [rootState, setRootState] = useState<ChessState>(initialStartState);
  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [selectedSq, setSelectedSq] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [pendingPromo, setPendingPromo] = useState<{
    from: Square;
    to: Square;
    moves: ChessMove[];
  } | null>(null);

  const [tab, setTab] = useState<InspectorTab>("position");
  const [fenDraft, setFenDraft] = useState<string>(STARTPOS_FEN);
  const [fenError, setFenError] = useState<string>("");
  const [copiedWhich, setCopiedWhich] = useState<"fen" | "uci" | "bb" | null>(
    null
  );

  const [hoveredSq, setHoveredSq] = useState<Square | null>(null);
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);
  const [bbLayer, setBbLayer] = useState<BitboardLayer>("selected");
  const [bbView, setBbView] = useState<"register" | "matrix">("register");

  const [magicPiece, setMagicPiece] = useState<"rook" | "bishop">("rook");
  const [magicSq, setMagicSq] = useState<Square>(makeSquare(3, 3)); // d4
  const [magicOverlays, setMagicOverlays] = useState({
    mask: true,
    maskedOcc: true,
    attacks: true,
  });
  const [collisionPreviewIdx, setCollisionPreviewIdx] = useState<number | null>(
    null
  );

  const [perftDepth, setPerftDepth] = useState<1 | 2 | 3>(2);
  const [divideResult, setDivideResult] = useState<{
    fen: string;
    depth: number;
    entries: DivideEntry[];
    total: number;
    elapsedMs: number;
  } | null>(null);

  const [playVsEngine, setPlayVsEngine] = useState(false);
  const [searchDepth, setSearchDepth] = useState<3 | 4>(3);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [engineThinking, setEngineThinking] = useState(false);
  const engineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentState =
    history.length > 0 ? history[history.length - 1].stateAfter : rootState;
  const currentFen = useMemo(() => toFen(currentState), [currentState]);
  const lastMove =
    history.length > 0 ? history[history.length - 1].move : null;

  const legalMoves = useMemo(() => getLegalMoves(currentState), [currentState]);
  const status = useMemo(
    () => getGameStatus(currentState, legalMoves),
    [currentState, legalMoves]
  );
  const bitboards = useMemo(() => getBitboards(currentState), [currentState]);

  const legalTargets = useMemo(() => {
    const map = new Map<Square, ChessMove[]>();
    if (selectedSq === null) return map;
    for (const m of legalMoves) {
      if (m.from === selectedSq) {
        const list = map.get(m.to) ?? [];
        list.push(m);
        map.set(m.to, list);
      }
    }
    return map;
  }, [legalMoves, selectedSq]);

  const checkedKingSq = useMemo(() => {
    if (!status.inCheck) return null;
    const kingChar: PieceChar = currentState.turn === "w" ? "K" : "k";
    return currentState.board.findIndex((p) => p === kingChar);
  }, [status.inCheck, currentState.board, currentState.turn]);

  const activeBitboard = useMemo((): {
    bb: bigint;
    label: string;
  } => {
    switch (bbLayer) {
      case "selected": {
        if (selectedSq === null || !currentState.board[selectedSq]) {
          return {
            bb: BigInt(0),
            label: "Click any piece on the board to inspect its attack bitboard",
          };
        }
        const p = currentState.board[selectedSq]!;
        return {
          bb: pieceAttacksFromSquare(currentState, selectedSq),
          label: `${PIECE_NAMES[p]} on ${squareToCoord(selectedSq)} attacks`,
        };
      }
      case "whiteAttacked":
        return { bb: bitboards.whiteAttacked, label: "Squares attacked by White" };
      case "blackAttacked":
        return { bb: bitboards.blackAttacked, label: "Squares attacked by Black" };
      case "allOccupancy":
        return { bb: bitboards.allOccupancy, label: "All occupied squares" };
      case "whiteOccupancy":
        return { bb: bitboards.whiteOccupancy, label: "White piece occupancy" };
      case "blackOccupancy":
        return { bb: bitboards.blackOccupancy, label: "Black piece occupancy" };
      case "none":
        return { bb: BigInt(0), label: "Overlay hidden" };
    }
  }, [bbLayer, selectedSq, currentState, bitboards]);

  const baseMagicBreakdown = useMemo(
    () => magicHashBreakdown(magicSq, magicPiece, bitboards.allOccupancy),
    [magicSq, magicPiece, bitboards.allOccupancy]
  );

  const activeMagicOcc = useMemo(() => {
    if (
      collisionPreviewIdx !== null &&
      collisionPreviewIdx >= 0 &&
      collisionPreviewIdx < baseMagicBreakdown.sampleCollisions.length
    ) {
      return baseMagicBreakdown.sampleCollisions[collisionPreviewIdx];
    }
    return bitboards.allOccupancy;
  }, [collisionPreviewIdx, baseMagicBreakdown.sampleCollisions, bitboards.allOccupancy]);

  const activeMagicBreakdown = useMemo(() => {
    if (collisionPreviewIdx === null) return baseMagicBreakdown;
    return magicHashBreakdown(magicSq, magicPiece, activeMagicOcc);
  }, [collisionPreviewIdx, baseMagicBreakdown, magicSq, magicPiece, activeMagicOcc]);

  const sliderQuickSquares = useMemo(() => {
    const items: { sq: Square; piece: PieceChar; kind: "rook" | "bishop" }[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = currentState.board[sq];
      if (!p) continue;
      const low = p.toLowerCase();
      if (low === "r") items.push({ sq, piece: p, kind: "rook" });
      else if (low === "b") items.push({ sq, piece: p, kind: "bishop" });
    }
    return items.slice(0, 6);
  }, [currentState.board]);

  useEffect(() => {
    return () => {
      if (engineTimerRef.current) clearTimeout(engineTimerRef.current);
    };
  }, []);

  function cancelPendingEngine() {
    if (engineTimerRef.current) {
      clearTimeout(engineTimerRef.current);
      engineTimerRef.current = null;
    }
    setEngineThinking(false);
  }

  function loadPosition(fen: string, newPresetId: string) {
    const parsed = parseFen(fen);
    if (!parsed.ok) {
      setFenError(parsed.error);
      return;
    }
    cancelPendingEngine();
    const canonical = toFen(parsed.state);
    setPresetId(newPresetId);
    setRootFen(canonical);
    setRootState(parsed.state);
    setHistory([]);
    setSelectedSq(null);
    setPendingPromo(null);
    setCollisionPreviewIdx(null);
    setFenDraft(canonical);
    setFenError("");
    setDivideResult(null);
    setSearchResult(null);
  }

  function commitMove(move: ChessMove, fromUser: boolean) {
    const nextState = applyMove(currentState, move);
    const nextFen = toFen(nextState);
    setHistory((prev) => [
      ...prev,
      { move, fenAfter: nextFen, stateAfter: nextState },
    ]);
    setSelectedSq(null);
    setPendingPromo(null);
    setCollisionPreviewIdx(null);
    setFenDraft(nextFen);
    setFenError("");
    setDivideResult(null);

    if (fromUser && playVsEngine) {
      const nextStatus = getGameStatus(nextState);
      if (!nextStatus.isGameOver) {
        setEngineThinking(true);
        if (engineTimerRef.current) clearTimeout(engineTimerRef.current);
        engineTimerRef.current = setTimeout(() => {
          const res = searchBestMove(nextState, {
            maxDepth: searchDepth,
            timeLimitMs: 160,
          });
          setSearchResult(res);
          setEngineThinking(false);
          if (res.bestMove) {
            const afterEngine = applyMove(nextState, res.bestMove);
            const afterFen = toFen(afterEngine);
            setHistory((prev) => [
              ...prev,
              {
                move: res.bestMove!,
                fenAfter: afterFen,
                stateAfter: afterEngine,
              },
            ]);
            setFenDraft(afterFen);
          }
        }, 40);
      }
    }
  }

  function undoMove() {
    if (history.length === 0) return;
    cancelPendingEngine();
    const stepBack = playVsEngine && history.length >= 2 ? 2 : 1;
    const nextHistory = history.slice(0, history.length - stepBack);
    const targetFen =
      nextHistory.length > 0
        ? nextHistory[nextHistory.length - 1].fenAfter
        : rootFen;
    setHistory(nextHistory);
    setSelectedSq(null);
    setPendingPromo(null);
    setCollisionPreviewIdx(null);
    setFenDraft(targetFen);
    setFenError("");
    setDivideResult(null);
    setSearchResult(null);
  }

  function jumpToPly(count: number) {
    cancelPendingEngine();
    const nextHistory = history.slice(0, count);
    const targetFen =
      nextHistory.length > 0
        ? nextHistory[nextHistory.length - 1].fenAfter
        : rootFen;
    setHistory(nextHistory);
    setSelectedSq(null);
    setPendingPromo(null);
    setCollisionPreviewIdx(null);
    setFenDraft(targetFen);
    setFenError("");
    setDivideResult(null);
    setSearchResult(null);
  }

  function handleTabChange(nextTab: InspectorTab) {
    setTab(nextTab);
    if (nextTab === "magic") {
      setCollisionPreviewIdx(null);
      if (selectedSq !== null) {
        setMagicSq(selectedSq);
        const p = currentState.board[selectedSq]?.toLowerCase();
        if (p === "r") setMagicPiece("rook");
        else if (p === "b") setMagicPiece("bishop");
      }
    }
  }

  function handleSquareClick(sq: Square) {
    if (engineThinking) return;
    if (pendingPromo) {
      setPendingPromo(null);
      return;
    }

    const piece = currentState.board[sq];
    if (tab === "magic") {
      setSelectedSq(sq);
      setMagicSq(sq);
      setCollisionPreviewIdx(null);
      const low = piece?.toLowerCase();
      if (low === "r") setMagicPiece("rook");
      else if (low === "b") setMagicPiece("bishop");
      return;
    }

    if (tab === "bitboards" && bbLayer === "selected") {
      setSelectedSq(selectedSq === sq ? null : sq);
      return;
    }

    // If a move target was clicked, execute it
    const movesToSq = legalTargets.get(sq);
    if (movesToSq && movesToSq.length > 0) {
      if (movesToSq.length > 1) {
        setPendingPromo({ from: selectedSq!, to: sq, moves: movesToSq });
      } else {
        commitMove(movesToSq[0], true);
      }
      return;
    }

    if (piece && pieceColor(piece) === currentState.turn && !status.isGameOver) {
      setSelectedSq(selectedSq === sq ? null : sq);
    } else if (piece && tab === "bitboards") {
      setSelectedSq(sq);
    } else {
      setSelectedSq(null);
    }
  }

  function runPerftDivide(depth: 1 | 2 | 3) {
    setPerftDepth(depth);
    const { entries, total, elapsedMs } = divideWithTiming(currentState, depth);
    setDivideResult({
      fen: currentFen,
      depth,
      entries,
      total,
      elapsedMs,
    });
  }

  function runSearch(andPlay = false) {
    if (status.isGameOver) return;
    cancelPendingEngine();
    const res = searchBestMove(currentState, {
      maxDepth: searchDepth,
      timeLimitMs: 180,
    });
    setSearchResult(res);
    if (andPlay && res.bestMove) {
      commitMove(res.bestMove, false);
    }
  }

  async function copyText(text: string, which: "fen" | "uci" | "bb") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhich(which);
      setTimeout(() => setCopiedWhich((c) => (c === which ? null : c)), 1500);
    } catch {
      // clipboard blocked
    }
  }

  const uciPositionCommand = useMemo(() => {
    const base =
      rootFen === STARTPOS_FEN ? "position startpos" : `position fen ${rootFen}`;
    if (history.length === 0) return base;
    return `${base} moves ${history.map((h) => h.move.uci).join(" ")}`;
  }, [rootFen, history]);

  const activePreset = CHESS_PRESETS.find((p) => p.id === presetId) ?? null;

  const statusLabel = status.isCheckmate
    ? `Checkmate — ${currentState.turn === "w" ? "Black" : "White"} wins`
    : status.isStalemate
      ? "Stalemate — Draw"
      : status.isFiftyMoveDraw
        ? "50-move rule — Draw"
        : status.isInsufficientMaterial
          ? "Insufficient material — Draw"
          : status.inCheck
            ? `${currentState.turn === "w" ? "White" : "Black"} to move (Check)`
            : `${currentState.turn === "w" ? "White" : "Black"} to move`;

  const showOverlay =
    tab === "bitboards" &&
    bbLayer !== "none" &&
    (bbLayer !== "selected" || selectedSq !== null);

  return (
    <Window
      as="section"
      aria-labelledby="workbench-heading"
      title="chess.workbench — interactive bitboard, perft & UCI inspector"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              status.isCheckmate
                ? "border-wrong/40 bg-wrong-wash text-wrong"
                : status.inCheck
                  ? "border-sun-deep/50 bg-sun-wash text-ink"
                  : "border-line bg-paper-sunk text-ink-soft"
            )}
          >
            {statusLabel}
          </span>
        </div>
      }
      bodyClassName="p-4 sm:p-6"
    >
      {/* Preset bar */}
      <div className="mb-5 space-y-2.5 border-b border-line pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="workbench-heading"
            className="font-display text-lg font-[450] tracking-[-0.015em] text-ink"
          >
            Test your engine&apos;s positions in the browser
          </h2>
          {activePreset ? (
            <span className="text-xs text-ink-soft">
              <span className="font-mono text-ink">{activePreset.stageTag}</span>{" "}
              · {activePreset.description}
            </span>
          ) : (
            <span className="text-xs text-ink-faint">Custom FEN position</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stage preset positions">
          {CHESS_PRESETS.map((p) => {
            const active = presetId === p.id && history.length === 0 && currentFen === p.fen;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => loadPosition(p.fen, p.id)}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? "border-ink bg-sun text-ink"
                    : "border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink"
                )}
              >
                <span>{p.label}</span>
                <span className={cn("font-mono text-[10px]", active ? "text-ink/75" : "text-ink-faint")}>
                  {p.stageTag.replace("Stage ", "S")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main 2-column workbench: Board (left) + Inspector (right) */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26.5rem)_minmax(0,1fr)]">
        {/* Left column: Board + controls */}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line-strong bg-paper-sunk p-2 shadow-sm">
            <svg
              viewBox="0 0 400 400"
              role="img"
              aria-label="Interactive chessboard"
              onMouseLeave={() => {
                setHoveredSq(null);
                setHoveredRank(null);
              }}
              className="block aspect-square w-full touch-manipulation select-none"
            >
              {Array.from({ length: 64 }, (_, visualIdx) => {
                const vCol = visualIdx & 7;
                const vRow = visualIdx >> 3; // 0 = top row
                const file = flipped ? 7 - vCol : vCol;
                const rank = flipped ? vRow : 7 - vRow;
                const sq = makeSquare(file, rank);
                const isLight = (file + rank) % 2 === 1;
                const x = vCol * 50;
                const y = vRow * 50;

                const isSelected = selectedSq === sq;
                const isMagicSq = tab === "magic" && magicSq === sq;
                const isLastFrom = lastMove?.from === sq;
                const isLastTo = lastMove?.to === sq;
                const isCheckSq = checkedKingSq === sq;
                const targets = legalTargets.get(sq);
                const isLegalDest = Boolean(targets && targets.length > 0);
                const isCaptureDest =
                  isLegalDest &&
                  Boolean(currentState.board[sq] || targets![0].isEnPassant);
                const isOverlayHit =
                  showOverlay && bitAt(activeBitboard.bb, sq);
                const isMagicMaskHit =
                  tab === "magic" &&
                  magicOverlays.mask &&
                  bitAt(activeMagicBreakdown.mask, sq);
                const isMagicOccHit =
                  tab === "magic" &&
                  magicOverlays.maskedOcc &&
                  bitAt(activeMagicBreakdown.maskedOcc, sq);
                const isMagicAttackHit =
                  tab === "magic" &&
                  magicOverlays.attacks &&
                  bitAt(activeMagicBreakdown.attacks, sq);
                const isHoveredRankSq =
                  hoveredRank !== null && rank === hoveredRank;
                const isHoveredSq = hoveredSq === sq;
                const piece = currentState.board[sq];
                const ghostMagicPiece: PieceChar | null =
                  isMagicSq && !piece
                    ? magicPiece === "rook"
                      ? "R"
                      : "B"
                    : null;

                return (
                  <g
                    key={sq}
                    onClick={() => handleSquareClick(sq)}
                    onMouseEnter={() => setHoveredSq(sq)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={y}
                      width={50}
                      height={50}
                      className={cn(
                        isLight
                          ? "fill-[#f6f1e2] dark:fill-[#222d48]"
                          : "fill-[#cbbda2] dark:fill-[#131b2e]"
                      )}
                    />
                    {(isLastFrom || isLastTo) && tab !== "magic" && (
                      <rect
                        x={x}
                        y={y}
                        width={50}
                        height={50}
                        fill="var(--sun)"
                        fillOpacity={0.28}
                      />
                    )}
                    {isHoveredRankSq && (
                      <rect
                        x={x}
                        y={y}
                        width={50}
                        height={50}
                        fill="var(--sun)"
                        fillOpacity={0.22}
                      />
                    )}
                    {(isSelected || isMagicSq) && (
                      <rect
                        x={x}
                        y={y}
                        width={50}
                        height={50}
                        fill="var(--sun)"
                        fillOpacity={0.5}
                      />
                    )}
                    {isCheckSq && (
                      <rect
                        x={x}
                        y={y}
                        width={50}
                        height={50}
                        fill="var(--wrong)"
                        fillOpacity={0.42}
                      />
                    )}
                    {isOverlayHit && (
                      <rect
                        x={x + 2}
                        y={y + 2}
                        width={46}
                        height={46}
                        rx={5}
                        fill="var(--code-blue)"
                        fillOpacity={0.32}
                        stroke="var(--code-blue)"
                        strokeWidth={1.6}
                      />
                    )}

                    {/* Magic & PEXT overlays */}
                    {isMagicAttackHit && (
                      <rect
                        x={x + 2}
                        y={y + 2}
                        width={46}
                        height={46}
                        rx={5}
                        fill="var(--code-blue)"
                        fillOpacity={0.26}
                        stroke="var(--code-blue)"
                        strokeWidth={1.25}
                      />
                    )}
                    {isMagicMaskHit && (
                      <rect
                        x={x + 3.5}
                        y={y + 3.5}
                        width={43}
                        height={43}
                        rx={5}
                        fill="var(--sun)"
                        fillOpacity={isMagicAttackHit ? 0.08 : 0.16}
                        stroke="var(--sun-deep)"
                        strokeWidth={1.8}
                        strokeDasharray="4 2.5"
                      />
                    )}
                    {isMagicOccHit && (
                      <rect
                        x={x + 5}
                        y={y + 5}
                        width={40}
                        height={40}
                        rx={6}
                        fill="var(--wrong)"
                        fillOpacity={0.2}
                        stroke="var(--wrong)"
                        strokeWidth={2.2}
                      />
                    )}

                    {/* File label along bottom row */}
                    {vRow === 7 && (
                      <text
                        x={x + 45}
                        y={y + 46}
                        textAnchor="end"
                        fontSize="9.5"
                        fontWeight="600"
                        className="pointer-events-none fill-ink/55 font-mono"
                      >
                        {"abcdefgh"[file]}
                      </text>
                    )}

                    {/* Rank label along left column */}
                    {vCol === 0 && (
                      <text
                        x={x + 4}
                        y={y + 12}
                        textAnchor="start"
                        fontSize="9.5"
                        fontWeight="600"
                        className="pointer-events-none fill-ink/55 font-mono"
                      >
                        {rank + 1}
                      </text>
                    )}

                    {piece && (
                      <ChessPieceSvg piece={piece} x={x + 2.5} y={y + 2.5} size={45} />
                    )}
                    {ghostMagicPiece && (
                      <g opacity={0.78}>
                        <ChessPieceSvg
                          piece={ghostMagicPiece}
                          x={x + 2.5}
                          y={y + 2.5}
                          size={45}
                        />
                      </g>
                    )}

                    {/* Magic attack center dot & simulated blocker pip */}
                    {isMagicAttackHit && !piece && !ghostMagicPiece && (
                      <circle
                        cx={x + 25}
                        cy={y + 25}
                        r={isMagicOccHit ? 7 : 5}
                        fill={isMagicOccHit ? "var(--wrong)" : "var(--code-blue)"}
                        fillOpacity={0.85}
                        className="pointer-events-none"
                      />
                    )}
                    {isMagicOccHit && !isMagicAttackHit && !piece && (
                      <circle
                        cx={x + 25}
                        cy={y + 25}
                        r={6}
                        fill="var(--wrong)"
                        fillOpacity={0.8}
                        className="pointer-events-none"
                      />
                    )}

                    {/* Legal move indicator */}
                    {tab !== "magic" && isLegalDest && !isCaptureDest && (
                      <circle
                        cx={x + 25}
                        cy={y + 25}
                        r={7}
                        fill="var(--ink)"
                        fillOpacity={0.28}
                        className="pointer-events-none"
                      />
                    )}
                    {tab !== "magic" && isLegalDest && isCaptureDest && (
                      <circle
                        cx={x + 25}
                        cy={y + 25}
                        r={21}
                        fill="none"
                        stroke="var(--ink)"
                        strokeOpacity={0.35}
                        strokeWidth={4}
                        className="pointer-events-none"
                      />
                    )}

                    {/* Synchronous hover ring */}
                    {isHoveredSq && (
                      <rect
                        x={x + 1.5}
                        y={y + 1.5}
                        width={47}
                        height={47}
                        rx={4}
                        fill="none"
                        stroke="var(--sun-deep)"
                        strokeWidth={2.5}
                        className="pointer-events-none"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Promotion chooser overlay */}
            {pendingPromo ? (
              <div
                role="dialog"
                aria-label="Choose promotion piece"
                className="absolute inset-0 z-10 flex items-center justify-center bg-paper/80 p-4 backdrop-blur-xs"
              >
                <div className="w-full max-w-xs rounded-[var(--radius-panel)] border border-line-strong bg-paper-raised p-4 shadow-float">
                  <p className="text-center text-sm font-medium text-ink">
                    Promote pawn on {squareToCoord(pendingPromo.to)}
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {PROMO_OPTIONS.map(({ type, label }) => {
                      const move = pendingPromo.moves.find(
                        (m) => m.promotion === type
                      );
                      if (!move) return null;
                      const glyph: PieceChar =
                        currentState.turn === "w"
                          ? (type.toUpperCase() as PieceChar)
                          : type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => commitMove(move, true)}
                          className="flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-chip)] border border-line bg-paper p-2 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-sun-wash"
                        >
                          <svg viewBox="0 0 45 45" className="size-9">
                            <ChessPieceSvg piece={glyph} x={0} y={0} size={45} />
                          </svg>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingPromo(null)}
                    className="mt-3 w-full cursor-pointer rounded-full border border-line py-1.5 text-xs text-ink-soft hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Live Square <-> Bit Telemetry Pill */}
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-chip)] border border-line bg-paper px-3 py-1.5 font-mono text-[11px] text-ink-soft">
            {hoveredSq !== null ? (
              <span className="truncate text-ink">
                {squareToCoord(hoveredSq)} · bit {hoveredSq} · rank{" "}
                {rankOf(hoveredSq) + 1} byte
              </span>
            ) : hoveredRank !== null ? (
              <span className="truncate text-ink">
                Rank {hoveredRank + 1} · bits [{hoveredRank * 8 + 7}..
                {hoveredRank * 8}]
              </span>
            ) : selectedSq !== null ? (
              <span className="truncate">
                Selected: <span className="text-ink">{squareToCoord(selectedSq)}</span>{" "}
                · bit {selectedSq} · rank {rankOf(selectedSq) + 1} byte
              </span>
            ) : (
              <span className="truncate text-ink-faint">
                Hover square to map A1=0 .. H8=63
              </span>
            )}
            <span className="shrink-0 text-ink-faint tabular-nums">
              {tab === "magic"
                ? `${magicPiece === "rook" ? "Rook" : "Bishop"} @ ${squareToCoord(magicSq)}`
                : "uint64_t"}
            </span>
          </div>

          {/* Board controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-paper px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink"
            >
              <ArrowUpDown className="size-3.5" aria-hidden />
              Flip
            </button>
            <button
              type="button"
              onClick={undoMove}
              disabled={history.length === 0 || engineThinking}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-paper px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Undo2 className="size-3.5" aria-hidden />
              Undo
            </button>
            <button
              type="button"
              onClick={() =>
                loadPosition(
                  activePreset ? activePreset.fen : rootFen,
                  activePreset ? activePreset.id : "custom"
                )
              }
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-paper px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset
            </button>

            <button
              type="button"
              onClick={() => {
                setPlayVsEngine((v) => !v);
                cancelPendingEngine();
              }}
              aria-pressed={playVsEngine}
              className={cn(
                "ml-auto inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors",
                playVsEngine
                  ? "border-ink bg-sun text-ink"
                  : "border-line-strong bg-paper text-ink-soft hover:border-ink hover:text-ink"
              )}
            >
              <Bot className="size-3.5" aria-hidden />
              {engineThinking
                ? "Engine thinking..."
                : playVsEngine
                  ? "Playing vs Engine"
                  : "Play vs Engine"}
            </button>
          </div>
        </div>

        {/* Right column: Engine Inspector */}
        <div className="min-w-0 space-y-4">
          {/* Inspector tabs */}
          <div
            role="tablist"
            aria-label="Engine inspector"
            className="grid w-full grid-cols-2 gap-1 rounded-[var(--radius-panel)] border border-line bg-paper-sunk p-1 sm:flex"
          >
            {(
              [
                { id: "position", label: "Position & FEN", icon: Sparkles },
                { id: "bitboards", label: "Bitboards & Attacks", icon: Grid2x2 },
                { id: "magic", label: "Magic & PEXT", icon: Zap },
                { id: "perft", label: "Perft & Search", icon: Cpu },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => handleTabChange(id)}
                  className={cn(
                    "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-chip)] px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-paper-raised text-ink shadow-xs"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: Position & FEN */}
          {tab === "position" && (
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadPosition(fenDraft, "custom");
                }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="workbench-fen-input"
                    className="text-xs font-medium text-ink"
                  >
                    FEN string
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(currentFen, "fen")}
                      className="inline-flex cursor-pointer items-center gap-1 text-xs text-ink-soft hover:text-ink"
                    >
                      {copiedWhich === "fen" ? (
                        <Check className="size-3 text-[color:var(--right)]" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {copiedWhich === "fen" ? "Copied FEN" : "Copy FEN"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(uciPositionCommand, "uci")}
                      className="inline-flex cursor-pointer items-center gap-1 text-xs text-ink-soft hover:text-ink"
                    >
                      {copiedWhich === "uci" ? (
                        <Check className="size-3 text-[color:var(--right)]" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {copiedWhich === "uci" ? "Copied UCI" : "Copy UCI"}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    id="workbench-fen-input"
                    type="text"
                    value={fenDraft}
                    onChange={(e) => {
                      setFenDraft(e.target.value);
                      if (fenError) setFenError("");
                    }}
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-[var(--radius-chip)] border border-line-strong bg-paper px-3 py-2 font-mono text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-[var(--radius-chip)] border border-ink bg-ink px-3.5 text-xs font-medium text-paper transition-opacity hover:opacity-90"
                  >
                    Apply
                  </button>
                </div>
                {fenError ? (
                  <p role="alert" className="text-xs text-wrong">
                    {fenError}
                  </p>
                ) : null}
              </form>

              {/* State telemetry grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  {
                    label: "Side to move",
                    value: currentState.turn === "w" ? "White (w)" : "Black (b)",
                  },
                  {
                    label: "Castling",
                    value:
                      (currentState.castling.K ? "K" : "") +
                        (currentState.castling.Q ? "Q" : "") +
                        (currentState.castling.k ? "k" : "") +
                        (currentState.castling.q ? "q" : "") || "—",
                  },
                  {
                    label: "En passant",
                    value:
                      currentState.epSquare !== null
                        ? squareToCoord(currentState.epSquare)
                        : "—",
                  },
                  {
                    label: "Halfmove clock",
                    value: String(currentState.halfmove),
                  },
                  {
                    label: "Fullmove",
                    value: String(currentState.fullmove),
                  },
                  {
                    label: "Legal moves",
                    value: String(status.legalMoveCount),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[var(--radius-chip)] border border-line bg-paper px-3 py-2"
                  >
                    <div className="text-[11px] text-ink-faint">{item.label}</div>
                    <div className="mt-0.5 font-mono text-xs font-medium text-ink tabular-nums">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* UCI command preview */}
              <div className="rounded-[var(--radius-chip)] border border-line bg-paper-sunk/70 px-3 py-2">
                <div className="text-[11px] text-ink-faint">UCI position command</div>
                <code className="mt-0.5 block overflow-x-auto font-mono text-[11px] text-ink-body whitespace-nowrap">
                  {uciPositionCommand}
                </code>
              </div>

              {/* Playable Move History */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">Move history</span>
                  {history.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => jumpToPly(0)}
                      className="cursor-pointer text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink"
                    >
                      Jump to start
                    </button>
                  ) : null}
                </div>
                {history.length === 0 ? (
                  <p className="rounded-[var(--radius-chip)] border border-dashed border-line px-3 py-4 text-center text-xs text-ink-faint">
                    Click a piece on the board to make a move, or run Perft & Search.
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto rounded-[var(--radius-chip)] border border-line bg-paper p-2">
                    <div className="flex flex-wrap gap-1">
                      {history.map((step, idx) => {
                        const moveNum =
                          rootState.fullmove +
                          Math.floor(
                            (idx + (rootState.turn === "b" ? 1 : 0)) / 2
                          );
                        const showNum =
                          idx === 0 ||
                          (rootState.turn === "w" ? idx % 2 === 0 : idx % 2 === 1);
                        const prefix =
                          idx === 0 && rootState.turn === "b"
                            ? `${moveNum}...`
                            : showNum
                              ? `${moveNum}.`
                              : "";
                        return (
                          <button
                            key={`${idx}-${step.move.uci}`}
                            type="button"
                            onClick={() => jumpToPly(idx + 1)}
                            title={`Jump to ${step.move.san} (${step.move.uci})`}
                            className={cn(
                              "inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-chip)] px-2 py-1 font-mono text-xs transition-colors",
                              idx === history.length - 1
                                ? "bg-sun-wash font-semibold text-ink"
                                : "text-ink-body hover:bg-paper-sunk"
                            )}
                          >
                            {prefix ? (
                              <span className="text-ink-faint">{prefix}</span>
                            ) : null}
                            <span>{step.move.san}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Bitboards & Attacks */}
          {tab === "bitboards" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bitboard overlay layer">
                {BITBOARD_LAYERS.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setBbLayer(layer.id)}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-xs font-medium transition-colors",
                      bbLayer === layer.id
                        ? "border-ink bg-sun text-ink"
                        : "border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink"
                    )}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>

              <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink">
                    {activeBitboard.label}
                  </span>
                  <span className="rounded-[var(--radius-chip)] border border-line bg-paper-sunk px-2 py-0.5 font-mono text-xs text-ink tabular-nums">
                    popcount = {popcountBB(activeBitboard.bb)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/70 px-3 py-2">
                  <code className="min-w-0 truncate font-mono text-xs text-ink tabular-nums">
                    {formatBitboardHex(activeBitboard.bb)}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(formatBitboardHex(activeBitboard.bb), "bb")
                    }
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs text-ink-soft hover:text-ink"
                  >
                    {copiedWhich === "bb" ? (
                      <Check className="size-3 text-[color:var(--right)]" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    {copiedWhich === "bb" ? "Copied" : "Copy"}
                  </button>
                </div>

                {/* View switch & active hovered square/bit indicator */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 font-mono text-[11px] text-ink-soft">
                    {hoveredSq !== null ? (
                      <span className="text-ink">
                        {squareToCoord(hoveredSq)} · bit {hoveredSq} · rank{" "}
                        {rankOf(hoveredSq) + 1} byte (
                        {"0x" +
                          Number(
                            (activeBitboard.bb >> BigInt(rankOf(hoveredSq) * 8)) &
                              BigInt(0xff)
                          )
                            .toString(16)
                            .toUpperCase()
                            .padStart(2, "0")}
                        ) · val {bitAt(activeBitboard.bb, hoveredSq) ? 1 : 0}
                      </span>
                    ) : hoveredRank !== null ? (
                      <span className="text-ink">
                        Rank {hoveredRank + 1} byte · bits [
                        {hoveredRank * 8 + 7}..{hoveredRank * 8}] ·{" "}
                        {"0x" +
                          Number(
                            (activeBitboard.bb >> BigInt(hoveredRank * 8)) &
                              BigInt(0xff)
                          )
                            .toString(16)
                            .toUpperCase()
                            .padStart(2, "0")}
                      </span>
                    ) : (
                      <span className="text-ink-faint">
                        Hover bit cells or rank rows to highlight the board
                      </span>
                    )}
                  </div>

                  <div
                    role="group"
                    aria-label="Bitboard layout view"
                    className="inline-flex rounded-[var(--radius-chip)] border border-line bg-paper-sunk p-0.5 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => setBbView("register")}
                      className={cn(
                        "cursor-pointer rounded-[6px] px-2 py-0.5 font-medium transition-colors",
                        bbView === "register"
                          ? "bg-paper-raised text-ink shadow-xs"
                          : "text-ink-soft hover:text-ink"
                      )}
                    >
                      Register Bytes
                    </button>
                    <button
                      type="button"
                      onClick={() => setBbView("matrix")}
                      className={cn(
                        "cursor-pointer rounded-[6px] px-2 py-0.5 font-medium transition-colors",
                        bbView === "matrix"
                          ? "bg-paper-raised text-ink shadow-xs"
                          : "text-ink-soft hover:text-ink"
                      )}
                    >
                      8×8 Matrix
                    </button>
                  </div>
                </div>

                {bbView === "register" ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-ink-faint px-1">
                      <span>Rank Byte [MSB..LSB]</span>
                      <span>h..e · d..a</span>
                      <span>Byte Hex</span>
                    </div>
                    <div
                      onMouseLeave={() => {
                        setHoveredSq(null);
                        setHoveredRank(null);
                      }}
                      className="space-y-1 rounded-[var(--radius-chip)] border border-line bg-paper-sunk p-2 font-mono text-[11px]"
                    >
                      {Array.from({ length: 8 }, (_, i) => {
                        const r = 7 - i; // Rank 8 [63..56] down to Rank 1 [7..0]
                        const loBit = r * 8;
                        const hiBit = loBit + 7;
                        const byteVal = Number(
                          (activeBitboard.bb >> BigInt(loBit)) & BigInt(0xff)
                        );
                        const byteHex =
                          "0x" +
                          byteVal.toString(16).toUpperCase().padStart(2, "0");
                        const rowHighlighted =
                          hoveredRank === r ||
                          (hoveredSq !== null && rankOf(hoveredSq) === r);

                        return (
                          <div
                            key={r}
                            onMouseEnter={() => setHoveredRank(r)}
                            onMouseLeave={() =>
                              setHoveredRank((prev) => (prev === r ? null : prev))
                            }
                            className={cn(
                              "flex items-center gap-1.5 rounded-[6px] border px-1.5 py-1 transition-colors",
                              rowHighlighted
                                ? "border-sun-deep/50 bg-sun-wash/55"
                                : "border-transparent hover:border-line"
                            )}
                          >
                            <span className="w-[4.5rem] shrink-0 text-[10px] text-ink-soft tabular-nums">
                              <span className="font-semibold text-ink">
                                R{r + 1}
                              </span>{" "}
                              <span className="text-ink-faint">
                                [{hiBit}..{loBit}]
                              </span>
                            </span>

                            <div className="grid min-w-0 flex-1 grid-cols-8 gap-0.5">
                              {Array.from({ length: 8 }, (_, bitIdx) => {
                                const b = 7 - bitIdx; // MSB (h) -> LSB (a)
                                const sq = loBit + b;
                                const set = bitAt(activeBitboard.bb, sq);
                                const isHovered = hoveredSq === sq;
                                const isSel = selectedSq === sq;
                                return (
                                  <button
                                    key={sq}
                                    type="button"
                                    title={`${squareToCoord(sq)} · bit ${sq} · rank ${r + 1} byte`}
                                    onMouseEnter={() => setHoveredSq(sq)}
                                    onMouseLeave={() =>
                                      setHoveredSq((prev) =>
                                        prev === sq ? null : prev
                                      )
                                    }
                                    onClick={() =>
                                      setSelectedSq(selectedSq === sq ? null : sq)
                                    }
                                    className={cn(
                                      "flex h-6 min-w-0 cursor-pointer items-center justify-center rounded-[4px] tabular-nums transition-all",
                                      b === 3 && "ml-0.5",
                                      set
                                        ? "bg-[color:var(--code-blue)] font-semibold text-white dark:text-[#080d18]"
                                        : "bg-paper/85 text-ink-faint hover:text-ink",
                                      isHovered &&
                                        "relative z-10 ring-2 ring-[color:var(--sun-deep)]",
                                      !isHovered &&
                                        isSel &&
                                        "ring-1 ring-ink"
                                    )}
                                  >
                                    {set ? "1" : "0"}
                                  </button>
                                );
                              })}
                            </div>

                            <span className="w-9 shrink-0 text-right text-[11px] font-medium text-ink tabular-nums">
                              {byteHex}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* 8x8 Bit Matrix */
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-faint">
                      <span>64-bit layout (bit 0 = a1, bit 63 = h8)</span>
                      <span className="font-mono">uint64_t</span>
                    </div>
                    <div
                      onMouseLeave={() => setHoveredSq(null)}
                      className="grid grid-cols-8 gap-1 rounded-[var(--radius-chip)] border border-line bg-paper-sunk p-2 font-mono text-[11px]"
                    >
                      {Array.from({ length: 64 }, (_, idx) => {
                        const vCol = idx & 7;
                        const vRow = idx >> 3;
                        const file = flipped ? 7 - vCol : vCol;
                        const rank = flipped ? vRow : 7 - vRow;
                        const sq = makeSquare(file, rank);
                        const set = bitAt(activeBitboard.bb, sq);
                        const isHovered = hoveredSq === sq;
                        return (
                          <button
                            key={sq}
                            type="button"
                            title={`${squareToCoord(sq)} (bit ${sq})`}
                            onMouseEnter={() => setHoveredSq(sq)}
                            onMouseLeave={() =>
                              setHoveredSq((prev) =>
                                prev === sq ? null : prev
                              )
                            }
                            onClick={() =>
                              setSelectedSq(selectedSq === sq ? null : sq)
                            }
                            className={cn(
                              "flex aspect-square cursor-pointer items-center justify-center rounded-[4px] tabular-nums transition-all",
                              set
                                ? "bg-[color:var(--code-blue)] font-semibold text-white dark:text-[#080d18]"
                                : "bg-paper/75 text-ink-faint",
                              isHovered &&
                                "ring-2 ring-[color:var(--sun-deep)]"
                            )}
                          >
                            {set ? "1" : "0"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Magic & PEXT ("20ns -> 1ns") */}
          {tab === "magic" && (
            <div className="space-y-3.5">
              {/* Piece & Square selector + overlay toggles */}
              <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-full border border-line bg-paper-sunk p-0.5">
                    {(["rook", "bishop"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          setMagicPiece(kind);
                          setCollisionPreviewIdx(null);
                        }}
                        className={cn(
                          "cursor-pointer rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                          magicPiece === kind
                            ? "bg-sun text-ink shadow-xs"
                            : "text-ink-soft hover:text-ink"
                        )}
                      >
                        {kind}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="magic-square-select"
                      className="text-xs text-ink-soft"
                    >
                      Square:
                    </label>
                    <select
                      id="magic-square-select"
                      value={magicSq}
                      onChange={(e) => {
                        const nextSq = Number(e.target.value);
                        setMagicSq(nextSq);
                        setSelectedSq(nextSq);
                        setCollisionPreviewIdx(null);
                      }}
                      className="h-8 rounded-[var(--radius-chip)] border border-line-strong bg-paper-raised px-2 font-mono text-xs text-ink focus-visible:outline-2 focus-visible:outline-ink"
                    >
                      {Array.from({ length: 64 }, (_, sq) => (
                        <option key={sq} value={sq}>
                          {squareToCoord(sq)} (bit {sq})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {sliderQuickSquares.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-ink-faint">
                      On board:
                    </span>
                    {sliderQuickSquares.map((item) => (
                      <button
                        key={`${item.piece}-${item.sq}`}
                        type="button"
                        onClick={() => {
                          setMagicSq(item.sq);
                          setSelectedSq(item.sq);
                          setMagicPiece(item.kind);
                          setCollisionPreviewIdx(null);
                        }}
                        className={cn(
                          "inline-flex h-6 cursor-pointer items-center rounded-[var(--radius-chip)] border px-2 font-mono text-[11px] transition-colors",
                          magicSq === item.sq && magicPiece === item.kind
                            ? "border-ink bg-sun-wash font-semibold text-ink"
                            : "border-line bg-paper-sunk text-ink-soft hover:border-line-strong hover:text-ink"
                        )}
                      >
                        {item.piece}@{squareToCoord(item.sq)}
                      </button>
                    ))}
                    <span className="ml-auto text-[11px] text-ink-faint">
                      or click any square
                    </span>
                  </div>
                )}

                {/* Board overlay toggles */}
                <div
                  className="flex flex-wrap gap-1.5 border-t border-line pt-2.5"
                  role="group"
                  aria-label="Magic bitboard overlays"
                >
                  {(
                    [
                      {
                        key: "mask",
                        label: "Relevancy Mask",
                        swatch: "border-[color:var(--sun-deep)] bg-sun/35",
                      },
                      {
                        key: "maskedOcc",
                        label: "Masked Occ (occ & mask)",
                        swatch: "border-[color:var(--wrong)] bg-wrong/25",
                      },
                      {
                        key: "attacks",
                        label: "Resulting Attacks",
                        swatch:
                          "border-[color:var(--code-blue)] bg-[color:var(--code-blue)]/35",
                      },
                    ] as const
                  ).map(({ key, label, swatch }) => {
                    const active = magicOverlays[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setMagicOverlays((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                        className={cn(
                          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                          active
                            ? "border-ink bg-paper-raised text-ink"
                            : "border-line bg-paper-sunk text-ink-faint hover:text-ink"
                        )}
                      >
                        <span
                          className={cn(
                            "size-2.5 rounded-[3px] border",
                            swatch,
                            !active && "opacity-35"
                          )}
                          aria-hidden
                        />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step-by-step "20ns -> 1ns" breakdown card */}
              <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div>
                    <h3 className="text-sm font-medium text-ink">
                      From 20ns → 1ns ·{" "}
                      <span className="capitalize">{magicPiece}</span> on{" "}
                      <span className="font-mono">
                        {squareToCoord(magicSq)}
                      </span>
                    </h3>
                    <p className="text-[11px] text-ink-soft">
                      O(1) flat-table lookup replacing loop-based ray marching.
                    </p>
                  </div>
                  <span className="rounded-full border border-line bg-paper-sunk px-2.5 py-0.5 font-mono text-[11px] text-ink tabular-nums">
                    2^{activeMagicBreakdown.relevantBits} ={" "}
                    {activeMagicBreakdown.tableEntries.toLocaleString("en-US")}{" "}
                    slots
                  </span>
                </div>

                {/* Step 1: Relevancy Mask */}
                <div className="space-y-1.5 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/55 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-ink">
                      1. Relevancy Mask (inner blockers only)
                    </span>
                    <span className="font-mono text-[11px] text-ink-soft tabular-nums">
                      popcount = {activeMagicBreakdown.relevantBits} bits →{" "}
                      {activeMagicBreakdown.tableEntries.toLocaleString(
                        "en-US"
                      )}{" "}
                      occupancies vs 2⁶⁴ (9.44 ZB)
                    </span>
                  </div>
                  <code className="block truncate font-mono text-xs text-ink tabular-nums">
                    mask = {formatBitboardHex(activeMagicBreakdown.mask)}
                  </code>
                </div>

                {/* Step 2: Masked Occupancy */}
                <div className="space-y-1.5 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/55 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-ink">
                      2. Masked Occupancy (occ &amp; mask)
                    </span>
                    <span className="font-mono text-[11px] text-ink-soft tabular-nums">
                      {popcountBB(activeMagicBreakdown.maskedOcc)} relevant{" "}
                      {popcountBB(activeMagicBreakdown.maskedOcc) === 1
                        ? "blocker"
                        : "blockers"}
                    </span>
                  </div>
                  <code className="block truncate font-mono text-xs text-ink tabular-nums">
                    occ &amp; mask ={" "}
                    {formatBitboardHex(activeMagicBreakdown.maskedOcc)}
                  </code>
                  {collisionPreviewIdx !== null && (
                    <div className="rounded-[6px] border border-sun-deep/50 bg-sun-wash px-2.5 py-1 text-[11px] text-ink">
                      Previewing constructive collision #
                      {collisionPreviewIdx + 1} on the board — blocker squares
                      changed while attacks stay identical!
                    </div>
                  )}
                </div>

                {/* Step 3: Hardware PEXT vs Portable Magic Bitboard */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-ink">
                    3. Hardware PEXT vs Portable Magic Bitboard
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {/* Hardware PEXT */}
                    <div className="min-w-0 space-y-2 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/55 p-3">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[11px] font-semibold text-ink">
                          PEXT · _pext_u64
                        </span>
                        <span className="rounded bg-paper-raised px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink tabular-nums">
                          idx = {activeMagicBreakdown.pextIdx}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-ink-soft">
                        packed ({activeMagicBreakdown.relevantBits}b):{" "}
                        <span className="break-all font-semibold text-ink">
                          0b
                          {activeMagicBreakdown.pextIdx
                            .toString(2)
                            .padStart(
                              Math.max(1, activeMagicBreakdown.relevantBits),
                              "0"
                            )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {activeMagicBreakdown.pextBits.map((b) => (
                          <span
                            key={b.dstBit}
                            title={`bit ${b.srcBit} (${squareToCoord(b.srcBit)}) -> packed bit ${b.dstBit}`}
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                              b.value === 1
                                ? "bg-[color:var(--code-blue)] font-semibold text-white dark:text-[#080d18]"
                                : "border border-line bg-paper text-ink-faint"
                            )}
                          >
                            {squareToCoord(b.srcBit)}→b{b.dstBit}:{b.value}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Portable Magic */}
                    <div className="min-w-0 space-y-1.5 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/55 p-3 font-mono text-[11px]">
                      <div className="flex items-center justify-between gap-1 font-sans">
                        <span className="font-mono text-[11px] font-semibold text-ink">
                          Magic · (occ * magic) &gt;&gt; {activeMagicBreakdown.shift}
                        </span>
                        <span className="rounded bg-paper-raised px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink tabular-nums">
                          idx = {activeMagicBreakdown.magicIndex}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-ink-soft">
                        <span>magic:</span>
                        <span className="truncate text-ink tabular-nums">
                          {formatBitboardHex(activeMagicBreakdown.magic)}
                        </span>
                      </div>
                      <div className="text-[10px] text-ink-faint">
                        sparse popcount = {activeMagicBreakdown.magicPopcount}{" "}
                        bits set
                      </div>
                      <div className="flex items-center justify-between gap-2 text-ink-soft">
                        <span>64-bit prod:</span>
                        <span className="truncate text-ink tabular-nums">
                          {formatBitboardHex(activeMagicBreakdown.product)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-ink-soft">
                        <span>shift (&gt;&gt; {activeMagicBreakdown.shift}):</span>
                        <span className="font-semibold text-ink tabular-nums">
                          {activeMagicBreakdown.magicIndex} /{" "}
                          {activeMagicBreakdown.tableEntries - 1}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-chip)] border border-line bg-paper-sunk px-3 py-1.5 font-mono text-[11px]">
                    <span className="text-ink-soft">
                      attacks = {formatBitboardHex(activeMagicBreakdown.attacks)}
                    </span>
                    <span className="text-ink tabular-nums">
                      {popcountBB(activeMagicBreakdown.attacks)} attacked squares
                    </span>
                  </div>
                </div>

                {/* Step 4: Constructive Collisions */}
                <div className="space-y-2 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/55 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink">
                      4. Constructive Collisions
                    </span>
                    <span className="rounded bg-paper-raised px-2 py-0.5 font-mono text-[11px] text-ink tabular-nums">
                      {baseMagicBreakdown.constructiveCollisionCount.toLocaleString(
                        "en-US"
                      )}{" "}
                      equivalent{" "}
                      {baseMagicBreakdown.constructiveCollisionCount === 1
                        ? "pattern"
                        : "patterns"}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Blockers behind the nearest blocker along a ray do not
                    change the attack set, so distinct masked occupancies can
                    safely share the same flat-table entry
                    {baseMagicBreakdown.hashCollisionCount > 0
                      ? ` (${baseMagicBreakdown.hashCollisionCount} also hash directly to magic slot #${baseMagicBreakdown.magicIndex}).`
                      : "."}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={baseMagicBreakdown.sampleCollisions.length === 0}
                      onClick={() =>
                        setCollisionPreviewIdx((prev) =>
                          prev === null
                            ? 0
                            : (prev + 1) %
                              baseMagicBreakdown.sampleCollisions.length
                        )
                      }
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-ink bg-sun px-3 text-xs font-medium text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {collisionPreviewIdx === null
                        ? "Preview colliding occupancy"
                        : `Next collision (${collisionPreviewIdx + 1}/${baseMagicBreakdown.sampleCollisions.length})`}
                    </button>
                    {collisionPreviewIdx !== null && (
                      <button
                        type="button"
                        onClick={() => setCollisionPreviewIdx(null)}
                        className="inline-flex h-8 cursor-pointer items-center rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink hover:border-ink"
                      >
                        Restore board occupancy
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Perft & Search */}
          {tab === "perft" && (
            <div className="space-y-4">
              {/* Perft section */}
              <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-ink">
                      Perft &amp; Divide
                    </h3>
                    <p className="text-xs text-ink-soft">
                      Compare leaf counts against your C++ move generator.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {([1, 2, 3] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => runPerftDivide(d)}
                        className={cn(
                          "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 font-mono text-xs font-medium transition-colors",
                          divideResult?.depth === d &&
                            divideResult?.fen === currentFen
                            ? "border-ink bg-sun text-ink"
                            : "border-line-strong bg-paper-raised text-ink hover:border-ink"
                        )}
                      >
                        d{d}
                      </button>
                    ))}
                  </div>
                </div>

                {divideResult && divideResult.fen === currentFen ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/70 px-3 py-2 text-xs">
                      <span className="font-mono font-medium text-ink tabular-nums">
                        perft({divideResult.depth}) ={" "}
                        {divideResult.total.toLocaleString("en-US")} nodes
                      </span>
                      <span className="font-mono text-ink-faint tabular-nums">
                        {divideResult.entries.length} root moves ·{" "}
                        {divideResult.elapsedMs} ms
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded-[var(--radius-chip)] border border-line bg-paper-raised">
                      <table className="w-full text-left font-mono text-xs">
                        <thead className="sticky top-0 border-b border-line bg-paper-sunk text-[11px] text-ink-soft">
                          <tr>
                            <th className="px-3 py-1.5 font-medium">Move (UCI)</th>
                            <th className="px-3 py-1.5 font-medium">SAN</th>
                            <th className="px-3 py-1.5 text-right font-medium">
                              Nodes
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {divideResult.entries.map((entry) => (
                            <tr
                              key={entry.move.uci}
                              onClick={() => commitMove(entry.move, true)}
                              className="cursor-pointer transition-colors hover:bg-sun-wash/60"
                            >
                              <td className="px-3 py-1.5 text-ink">
                                {entry.move.uci}
                              </td>
                              <td className="px-3 py-1.5 text-ink-soft">
                                {entry.move.san}
                              </td>
                              <td className="px-3 py-1.5 text-right text-ink tabular-nums">
                                {entry.nodes.toLocaleString("en-US")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-ink-faint">
                      Tip: click any row above to play that move and inspect its subtree.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => runPerftDivide(perftDepth)}
                    className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line-strong bg-paper-raised text-xs font-medium text-ink transition-colors hover:border-ink"
                  >
                    <Play className="size-3.5" aria-hidden />
                    Run Perft Divide (depth {perftDepth})
                  </button>
                )}
              </div>

              {/* Search engine section */}
              <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-ink">
                      Alpha-Beta + Quiescence Engine
                    </h3>
                    <p className="text-xs text-ink-soft">
                      Client-side negamax search with MVV-LVA, killers, and PSTs.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {([3, 4] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSearchDepth(d)}
                        className={cn(
                          "inline-flex h-7 cursor-pointer items-center rounded-full border px-2.5 font-mono text-[11px] font-medium transition-colors",
                          searchDepth === d
                            ? "border-ink bg-ink text-paper"
                            : "border-line bg-paper-raised text-ink-soft hover:text-ink"
                        )}
                      >
                        d{d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={status.isGameOver || engineThinking}
                    onClick={() => runSearch(false)}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-ink bg-sun px-4 text-xs font-medium text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Cpu className="size-3.5" aria-hidden />
                    Best Move (Depth {searchDepth})
                  </button>
                  <button
                    type="button"
                    disabled={status.isGameOver || engineThinking}
                    onClick={() => runSearch(true)}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-4 text-xs font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Play className="size-3.5" aria-hidden />
                    Engine Move
                  </button>
                </div>

                {searchResult ? (
                  <div className="space-y-2 rounded-[var(--radius-chip)] border border-line bg-paper-sunk/70 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        Best:{" "}
                        <span className="font-mono">
                          {searchResult.bestMove
                            ? `${searchResult.bestMove.san} (${searchResult.bestMove.uci})`
                            : "none"}
                        </span>
                      </span>
                      <span className="rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-ink tabular-nums">
                        {formatScore(searchResult, currentState.turn)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft tabular-nums">
                      <span>depth {searchResult.depth}</span>
                      <span>{searchResult.nodes.toLocaleString("en-US")} nodes</span>
                      <span>{searchResult.elapsedMs} ms</span>
                    </div>
                    {searchResult.pv.length > 0 ? (
                      <div className="pt-1">
                        <span className="text-[11px] text-ink-faint">PV: </span>
                        <span className="font-mono text-ink-body">
                          {searchResult.pv.map((m) => m.san).join(" ")}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}
