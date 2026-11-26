export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceChar =
  | "P"
  | "N"
  | "B"
  | "R"
  | "Q"
  | "K"
  | "p"
  | "n"
  | "b"
  | "r"
  | "q"
  | "k";
export type PromoPiece = "n" | "b" | "r" | "q";

/** 0 = a1, 1 = b1, ..., 7 = h1, 56 = a8, 63 = h8 (matches C++ chess::Square). */
export type Square = number;

export interface CastlingRights {
  K: boolean;
  Q: boolean;
  k: boolean;
  q: boolean;
}

export interface ChessState {
  board: (PieceChar | null)[];
  turn: Color;
  castling: CastlingRights;
  epSquare: Square | null;
  halfmove: number;
  fullmove: number;
}

export interface ChessMove {
  from: Square;
  to: Square;
  piece: PieceChar;
  captured?: PieceChar;
  promotion?: PromoPiece;
  isEnPassant?: boolean;
  isCastle?: "K" | "Q" | "k" | "q";
  uci: string;
  san: string;
}

export interface ChessBitboards {
  whiteOccupancy: bigint;
  blackOccupancy: bigint;
  allOccupancy: bigint;
  byPiece: Record<PieceChar, bigint>;
  whiteAttacked: bigint;
  blackAttacked: bigint;
}

export interface GameStatus {
  inCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isFiftyMoveDraw: boolean;
  isInsufficientMaterial: boolean;
  isGameOver: boolean;
  legalMoveCount: number;
}

export interface DivideEntry {
  move: ChessMove;
  nodes: number;
}

export interface SearchResult {
  bestMove: ChessMove | null;
  scoreCp: number;
  mateIn?: number;
  depth: number;
  nodes: number;
  pv: ChessMove[];
  elapsedMs: number;
}

export interface ChessPreset {
  id: string;
  label: string;
  stageTag: string;
  description: string;
  fen: string;
}

export const STARTPOS_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const CHESS_PRESETS: ChessPreset[] = [
  {
    id: "startpos",
    label: "Startpos",
    stageTag: "Stage 1 & 4",
    description: "Standard opening position (Perft d1 = 20, d2 = 400, d3 = 8,902).",
    fen: STARTPOS_FEN,
  },
  {
    id: "kiwipete",
    label: "Kiwipete",
    stageTag: "Stage 4",
    description: "Classic Perft stress test with pins, promotions, and castling (d1 = 48, d2 = 2,039).",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  },
  {
    id: "ep-pin",
    label: "En Passant Pin",
    stageTag: "Stage 4",
    description: "Horizontal discovered-check pin: e5xd6 leaves White's king on a5 exposed to h5!",
    fen: "8/8/8/K2pP2r/8/8/8/7k w - d6 0 1",
  },
  {
    id: "pos3",
    label: "Pos 3 (Endgame)",
    stageTag: "Stage 4",
    description: "Endgame Perft benchmark testing promotions and exposed kings (d1 = 14, d2 = 191).",
    fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  },
  {
    id: "pos4",
    label: "Promo & Castling",
    stageTag: "Stage 4",
    description: "Perft Position 5: promotion on a8, castling rights, and discovered checks.",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
  },
  {
    id: "mate-in-2",
    label: "Mate in 2",
    stageTag: "Stage 6",
    description: "Paul Morphy's puzzle: quiet key move 1. Ra6! forces mate on move 2 regardless of Black's reply.",
    fen: "kbK5/pp6/1P6/8/8/8/8/R7 w - - 0 1",
  },
  {
    id: "quiescence-trap",
    label: "Quiescence Trap",
    stageTag: "Stage 7",
    description: "A poisoned pawn on d5: naive depth-1 evaluation grabs d5, while quiescence sees exd5 recapturing the queen.",
    fen: "3r2k1/1q3ppp/4p3/3p4/3P4/3Q4/2P2PPP/4R1K1 w - - 0 1",
  },
];

// ---------------------------------------------------------------------------
// Coordinate & piece helpers
// ---------------------------------------------------------------------------

const FILES = "abcdefgh";
const RANKS = "12345678";

export function fileOf(sq: Square): number {
  return sq & 7;
}

export function rankOf(sq: Square): number {
  return sq >> 3;
}

export function makeSquare(file: number, rank: number): Square {
  return (rank << 3) | file;
}

export function squareToCoord(sq: Square): string {
  if (sq < 0 || sq >= 64) return "-";
  return FILES[fileOf(sq)] + RANKS[rankOf(sq)];
}

export function coordToSquare(coord: string): Square | null {
  if (coord.length !== 2) return null;
  const f = FILES.indexOf(coord[0]);
  const r = RANKS.indexOf(coord[1]);
  if (f < 0 || r < 0) return null;
  return makeSquare(f, r);
}

export function pieceColor(p: PieceChar): Color {
  return p >= "A" && p <= "Z" ? "w" : "b";
}

export function pieceType(p: PieceChar): PieceType {
  return p.toLowerCase() as PieceType;
}

const VALID_PIECES = new Set<string>([
  "P",
  "N",
  "B",
  "R",
  "Q",
  "K",
  "p",
  "n",
  "b",
  "r",
  "q",
  "k",
]);

const PIECE_CHARS: readonly PieceChar[] = [
  "P",
  "N",
  "B",
  "R",
  "Q",
  "K",
  "p",
  "n",
  "b",
  "r",
  "q",
  "k",
];

// ---------------------------------------------------------------------------
// 64-bit Bitboard attack tables (BigInt)
// ---------------------------------------------------------------------------

const BB_ZERO = BigInt(0);
const BB_ONE = BigInt(1);
const BB_SIX = BigInt(6);
const BB_SEVEN = BigInt(7);
const BB_EIGHT = BigInt(8);
const BB_NINE = BigInt(9);
const BB_TEN = BigInt(10);
const BB_FIFTEEN = BigInt(15);
const BB_SEVENTEEN = BigInt(17);

const MASK64 = BigInt("0xffffffffffffffff");
const FILE_A = BigInt("0x0101010101010101");
const FILE_H = FILE_A << BB_SEVEN;
const NOT_A = MASK64 ^ FILE_A;
const NOT_H = MASK64 ^ FILE_H;
const NOT_AB = MASK64 ^ FILE_A ^ (FILE_A << BB_ONE);
const NOT_GH = MASK64 ^ FILE_H ^ (FILE_A << BB_SIX);

const WHITE_PAWN_ATTACKS: bigint[] = new Array(64).fill(BB_ZERO);
const BLACK_PAWN_ATTACKS: bigint[] = new Array(64).fill(BB_ZERO);
const KNIGHT_ATTACKS: bigint[] = new Array(64).fill(BB_ZERO);
const KING_ATTACKS: bigint[] = new Array(64).fill(BB_ZERO);

for (let sq = 0; sq < 64; sq++) {
  const b = BB_ONE << BigInt(sq);

  WHITE_PAWN_ATTACKS[sq] =
    (((b & NOT_A) << BB_SEVEN) | ((b & NOT_H) << BB_NINE)) & MASK64;
  BLACK_PAWN_ATTACKS[sq] =
    (((b & NOT_H) >> BB_SEVEN) | ((b & NOT_A) >> BB_NINE)) & MASK64;

  KNIGHT_ATTACKS[sq] =
    (((b & NOT_H) << BB_SEVENTEEN) |
      ((b & NOT_A) << BB_FIFTEEN) |
      ((b & NOT_GH) << BB_TEN) |
      ((b & NOT_AB) << BB_SIX) |
      ((b & NOT_A) >> BB_SEVENTEEN) |
      ((b & NOT_H) >> BB_FIFTEEN) |
      ((b & NOT_AB) >> BB_TEN) |
      ((b & NOT_GH) >> BB_SIX)) &
    MASK64;

  const ring = ((b & NOT_A) >> BB_ONE) | ((b & NOT_H) << BB_ONE) | b;
  KING_ATTACKS[sq] = (((ring << BB_EIGHT) | (ring >> BB_EIGHT) | ring) ^ b) & MASK64;
}

function slidingAttacks(
  sq: Square,
  occ: bigint,
  dirs: readonly [number, number][]
): bigint {
  let attacks = BB_ZERO;
  const f0 = fileOf(sq);
  const r0 = rankOf(sq);
  for (const [df, dr] of dirs) {
    let f = f0 + df;
    let r = r0 + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const target = makeSquare(f, r);
      const bit = BB_ONE << BigInt(target);
      attacks |= bit;
      if ((occ & bit) !== BB_ZERO) break;
      f += df;
      r += dr;
    }
  }
  return attacks;
}

const BISHOP_DIRS: readonly [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ROOK_DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function pawnAttacksBB(color: Color, sq: Square): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  return color === "w" ? WHITE_PAWN_ATTACKS[sq] : BLACK_PAWN_ATTACKS[sq];
}

export function knightAttacksBB(sq: Square): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  return KNIGHT_ATTACKS[sq];
}

export function kingAttacksBB(sq: Square): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  return KING_ATTACKS[sq];
}

export function bishopAttacksBB(sq: Square, occ: bigint): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  return slidingAttacks(sq, occ, BISHOP_DIRS);
}

export function rookAttacksBB(sq: Square, occ: bigint): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  return slidingAttacks(sq, occ, ROOK_DIRS);
}

export function queenAttacksBB(sq: Square, occ: bigint): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  return bishopAttacksBB(sq, occ) | rookAttacksBB(sq, occ);
}

export function formatBitboardHex(bb: bigint): string {
  return "0x" + BigInt.asUintN(64, bb).toString(16).toUpperCase().padStart(16, "0");
}

export function popcountBB(bb: bigint): number {
  let x = BigInt.asUintN(64, bb);
  let count = 0;
  while (x !== BB_ZERO) {
    x &= x - BB_ONE;
    count++;
  }
  return count;
}

export function bitAt(bb: bigint, sq: Square): boolean {
  if (sq < 0 || sq >= 64) return false;
  return ((bb >> BigInt(sq)) & BB_ONE) !== BB_ZERO;
}

// ---------------------------------------------------------------------------
// Magic Bitboards & Hardware PEXT Visualization Helpers (A1 = 0, H8 = 63)
// ---------------------------------------------------------------------------

export interface PextBitMapping {
  srcBit: number;
  dstBit: number;
  value: 0 | 1;
}

export interface PextExtractResult {
  index: number;
  bits: PextBitMapping[];
}

export interface MagicHashBreakdown {
  sq: Square;
  piece: "rook" | "bishop";
  mask: bigint;
  relevantBits: number;
  tableEntries: number;
  maskedOcc: bigint;
  magic: bigint;
  magicPopcount: number;
  shift: number;
  product: bigint;
  magicIndex: number;
  pextIdx: number;
  pextBits: PextBitMapping[];
  attacks: bigint;
  constructiveCollisionCount: number;
  hashCollisionCount: number;
  sampleCollisions: bigint[];
}

/** Verified 64-bit sparse rook magic multipliers matching challenges/chess/solution/include/chess/bitboard.hpp. */
export const ROOK_MAGICS: readonly bigint[] = [
  BigInt("0x01800010a0c00188"),
  BigInt("0x0040002000100048"),
  BigInt("0x2080200008100080"),
  BigInt("0x5280048148003000"),
  BigInt("0x0100100801000402"),
  BigInt("0x0200011002008408"),
  BigInt("0x0180048003000200"),
  BigInt("0x0100104100048822"),
  BigInt("0x8040800080400020"),
  BigInt("0x4820802000400090"),
  BigInt("0x0902001046002280"),
  BigInt("0x0000800800100080"),
  BigInt("0x0009001008010004"),
  BigInt("0x0040800200800400"),
  BigInt("0x0041000200010004"),
  BigInt("0x20410000b0420900"),
  BigInt("0x08008a8000400020"),
  BigInt("0x1050014040002000"),
  BigInt("0x0200c10013a00101"),
  BigInt("0x1008018050008008"),
  BigInt("0x0001010004080010"),
  BigInt("0x001a808004000200"),
  BigInt("0x0818040022019018"),
  BigInt("0x2200820000842051"),
  BigInt("0x0000400880008032"),
  BigInt("0x001002c440042000"),
  BigInt("0x1a44200480100080"),
  BigInt("0x0000080080100080"),
  BigInt("0x2000040080080080"),
  BigInt("0x0000040801402010"),
  BigInt("0x2400018400302208"),
  BigInt("0x0400a04200240081"),
  BigInt("0x8200804008800020"),
  BigInt("0x4001004001002081"),
  BigInt("0x0500110041002004"),
  BigInt("0x8000090021001000"),
  BigInt("0x0005004413000800"),
  BigInt("0x8002001182000408"),
  BigInt("0x0001020854000330"),
  BigInt("0x0410800040802100"),
  BigInt("0x0408c00462888000"),
  BigInt("0x001002e0104a4000"),
  BigInt("0x00b0001020008080"),
  BigInt("0x080801805001800a"),
  BigInt("0x4400080004008080"),
  BigInt("0x2002001024160008"),
  BigInt("0x4026002401420008"),
  BigInt("0xa840008049060004"),
  BigInt("0x0000634000801280"),
  BigInt("0x0010802108400100"),
  BigInt("0x8090080020040020"),
  BigInt("0x0000100008008080"),
  BigInt("0x0040100500080100"),
  BigInt("0x0004800200040080"),
  BigInt("0x8000080110420400"),
  BigInt("0x0010108114104200"),
  BigInt("0x5004800020481101"),
  BigInt("0x810020120100408a"),
  BigInt("0x28460010a10980c2"),
  BigInt("0x200210010004c861"),
  BigInt("0x3000110008002313"),
  BigInt("0x0041000844000a31"),
  BigInt("0x0320011002080084"),
  BigInt("0x0008004408210082"),
];

/** Verified 64-bit sparse bishop magic multipliers matching challenges/chess/solution/include/chess/bitboard.hpp. */
export const BISHOP_MAGICS: readonly bigint[] = [
  BigInt("0x0420a02a00902084"),
  BigInt("0x0028810924010001"),
  BigInt("0x082101012200108c"),
  BigInt("0x0084040090000240"),
  BigInt("0x30040d2048108400"),
  BigInt("0x08a7012012020020"),
  BigInt("0x1008443008880000"),
  BigInt("0x2022404a10212010"),
  BigInt("0x3012c00a22121628"),
  BigInt("0x4000e00996020440"),
  BigInt("0x8260082804428004"),
  BigInt("0x0000a44408802080"),
  BigInt("0x0000011040010000"),
  BigInt("0x8000488824400140"),
  BigInt("0x2000004444044100"),
  BigInt("0x4000204044100800"),
  BigInt("0x000800c010048080"),
  BigInt("0x0004000821084200"),
  BigInt("0x1250000100420140"),
  BigInt("0x0004018524008200"),
  BigInt("0x1024002200a20802"),
  BigInt("0x0001000880600200"),
  BigInt("0x2240441098341006"),
  BigInt("0x226200202084040c"),
  BigInt("0x860804c048511000"),
  BigInt("0x0082104002d00202"),
  BigInt("0x0000300008004840"),
  BigInt("0x202104008800a060"),
  BigInt("0x0001010048104010"),
  BigInt("0x8010008001008082"),
  BigInt("0x4008039804420840"),
  BigInt("0x1010510040808800"),
  BigInt("0x001002208030340c"),
  BigInt("0x8084242041022210"),
  BigInt("0x1042a03802500080"),
  BigInt("0x1468208020880200"),
  BigInt("0x6640090100141040"),
  BigInt("0x002022088000c800"),
  BigInt("0x004202020c004843"),
  BigInt("0x0001510020020201"),
  BigInt("0x8808121031012414"),
  BigInt("0x1019113002001000"),
  BigInt("0x4004140028000400"),
  BigInt("0x2202012011050810"),
  BigInt("0x1081840810108200"),
  BigInt("0xa040882081000020"),
  BigInt("0x4024500401288840"),
  BigInt("0x40242090a2000100"),
  BigInt("0x6a806a021040042c"),
  BigInt("0x0821004844240004"),
  BigInt("0x2800008408d80101"),
  BigInt("0x0800131542160028"),
  BigInt("0x0000181060288120"),
  BigInt("0x0002042810090809"),
  BigInt("0x004038050400b00b"),
  BigInt("0x04081002820ac848"),
  BigInt("0x0028404410080200"),
  BigInt("0x200100240a02900d"),
  BigInt("0x00026052104a0820"),
  BigInt("0x0111200012228800"),
  BigInt("0x4005200004050408"),
  BigInt("0x4004028404080208"),
  BigInt("0x0000086008008900"),
  BigInt("0x02a0081104498202"),
];

/** Rook blocker relevancy mask (excludes outer edges: 12 bits corners, 11 bits edges, 10 bits interior). */
export function rookRelevancyMask(sq: number): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  const r = rankOf(sq);
  const f = fileOf(sq);
  let m = BB_ZERO;
  for (let rr = r + 1; rr <= 6; rr++) m |= BB_ONE << BigInt(rr * 8 + f);
  for (let rr = r - 1; rr >= 1; rr--) m |= BB_ONE << BigInt(rr * 8 + f);
  for (let ff = f + 1; ff <= 6; ff++) m |= BB_ONE << BigInt(r * 8 + ff);
  for (let ff = f - 1; ff >= 1; ff--) m |= BB_ONE << BigInt(r * 8 + ff);
  return m;
}

/** Bishop blocker relevancy mask (excludes all outer edges: 5–9 bits). */
export function bishopRelevancyMask(sq: number): bigint {
  if (sq < 0 || sq >= 64) return BB_ZERO;
  const r = rankOf(sq);
  const f = fileOf(sq);
  let m = BB_ZERO;
  for (let rr = r + 1, ff = f + 1; rr <= 6 && ff <= 6; rr++, ff++) {
    m |= BB_ONE << BigInt(rr * 8 + ff);
  }
  for (let rr = r + 1, ff = f - 1; rr <= 6 && ff >= 1; rr++, ff--) {
    m |= BB_ONE << BigInt(rr * 8 + ff);
  }
  for (let rr = r - 1, ff = f + 1; rr >= 1 && ff <= 6; rr--, ff++) {
    m |= BB_ONE << BigInt(rr * 8 + ff);
  }
  for (let rr = r - 1, ff = f - 1; rr >= 1 && ff >= 1; rr--, ff--) {
    m |= BB_ONE << BigInt(rr * 8 + ff);
  }
  return m;
}

/**
 * Software equivalent of BMI2 `_pext_u64(occ, mask)`:
 * packs masked bits in LSB -> MSB order and returns both the packed index and per-bit mapping.
 */
export function pextExtract(occ: bigint, mask: bigint): PextExtractResult {
  const uOcc = BigInt.asUintN(64, occ);
  const uMask = BigInt.asUintN(64, mask);
  const bits: PextBitMapping[] = [];
  let packed = BB_ZERO;
  let dstBit = 0;

  for (let srcBit = 0; srcBit < 64; srcBit++) {
    const bit = BB_ONE << BigInt(srcBit);
    if ((uMask & bit) !== BB_ZERO) {
      const value: 0 | 1 = (uOcc & bit) !== BB_ZERO ? 1 : 0;
      if (value === 1) {
        packed |= BB_ONE << BigInt(dstBit);
      }
      bits.push({ srcBit, dstBit, value });
      dstBit++;
    }
  }

  return { index: Number(packed), bits };
}

/** Packs masked bits of `occ` under `mask` in LSB -> MSB order into `[0, 2^popcount(mask) - 1]`. */
export function pextIndex(occ: bigint, mask: bigint): number {
  return pextExtract(occ, mask).index;
}

/**
 * Computes the complete step-by-step Magic Bitboard + Hardware PEXT breakdown
 * for a rook or bishop on `sq` with board occupancy `occ`.
 */
export function magicHashBreakdown(
  sq: number,
  piece: "rook" | "bishop",
  occ: bigint
): MagicHashBreakdown {
  if (sq < 0 || sq >= 64) {
    return {
      sq,
      piece,
      mask: BB_ZERO,
      relevantBits: 0,
      tableEntries: 1,
      maskedOcc: BB_ZERO,
      magic: BB_ZERO,
      magicPopcount: 0,
      shift: 64,
      product: BB_ZERO,
      magicIndex: 0,
      pextIdx: 0,
      pextBits: [],
      attacks: BB_ZERO,
      constructiveCollisionCount: 0,
      hashCollisionCount: 0,
      sampleCollisions: [],
    };
  }

  const mask = piece === "rook" ? rookRelevancyMask(sq) : bishopRelevancyMask(sq);
  const relevantBits = popcountBB(mask);
  const tableEntries = 1 << relevantBits;
  const maskedOcc = BigInt.asUintN(64, occ) & mask;
  const magic = piece === "rook" ? ROOK_MAGICS[sq] : BISHOP_MAGICS[sq];
  const magicPopcount = popcountBB(magic);
  const shift = 64 - relevantBits;
  const shiftBig = BigInt(shift);
  const product = BigInt.asUintN(64, maskedOcc * magic);
  const magicIndex = Number(product >> shiftBig);
  const { index: pextIdx, bits: pextBits } = pextExtract(maskedOcc, mask);
  const attacks =
    piece === "rook" ? rookAttacksBB(sq, occ) : bishopAttacksBB(sq, occ);

  let constructiveCollisionCount = 0;
  let hashCollisionCount = 0;
  const sameHashSamples: bigint[] = [];
  const otherSamples: bigint[] = [];

  if (relevantBits <= 12) {
    const bitMasks = pextBits.map((b) => BB_ONE << BigInt(b.srcBit));
    const dirs = piece === "rook" ? ROOK_DIRS : BISHOP_DIRS;
    for (let i = 0; i < tableEntries; i++) {
      let subOcc = BB_ZERO;
      for (let b = 0; b < relevantBits; b++) {
        if ((i & (1 << b)) !== 0) subOcc |= bitMasks[b];
      }
      if (subOcc === maskedOcc) continue;
      if (slidingAttacks(sq, subOcc, dirs) === attacks) {
        constructiveCollisionCount++;
        const subHash = Number(BigInt.asUintN(64, subOcc * magic) >> shiftBig);
        if (subHash === magicIndex) {
          hashCollisionCount++;
          if (sameHashSamples.length < 8) sameHashSamples.push(subOcc);
        } else if (otherSamples.length < 8) {
          otherSamples.push(subOcc);
        }
      }
    }
  }

  const sampleCollisions = [...sameHashSamples, ...otherSamples].slice(0, 8);

  return {
    sq,
    piece,
    mask,
    relevantBits,
    tableEntries,
    maskedOcc,
    magic,
    magicPopcount,
    shift,
    product,
    magicIndex,
    pextIdx,
    pextBits,
    attacks,
    constructiveCollisionCount,
    hashCollisionCount,
    sampleCollisions,
  };
}

export function getBitboards(state: ChessState): ChessBitboards {
  const byPiece: Record<PieceChar, bigint> = {
    P: BB_ZERO,
    N: BB_ZERO,
    B: BB_ZERO,
    R: BB_ZERO,
    Q: BB_ZERO,
    K: BB_ZERO,
    p: BB_ZERO,
    n: BB_ZERO,
    b: BB_ZERO,
    r: BB_ZERO,
    q: BB_ZERO,
    k: BB_ZERO,
  };
  let whiteOccupancy = BB_ZERO;
  let blackOccupancy = BB_ZERO;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const bit = BB_ONE << BigInt(sq);
    byPiece[p] |= bit;
    if (pieceColor(p) === "w") whiteOccupancy |= bit;
    else blackOccupancy |= bit;
  }

  const allOccupancy = whiteOccupancy | blackOccupancy;
  let whiteAttacked = BB_ZERO;
  let blackAttacked = BB_ZERO;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const att = pieceAttacksWithOcc(p, sq, allOccupancy);
    if (pieceColor(p) === "w") whiteAttacked |= att;
    else blackAttacked |= att;
  }

  return {
    whiteOccupancy,
    blackOccupancy,
    allOccupancy,
    byPiece,
    whiteAttacked,
    blackAttacked,
  };
}

function pieceAttacksWithOcc(p: PieceChar, sq: Square, occ: bigint): bigint {
  switch (p) {
    case "P":
      return pawnAttacksBB("w", sq);
    case "p":
      return pawnAttacksBB("b", sq);
    case "N":
    case "n":
      return knightAttacksBB(sq);
    case "B":
    case "b":
      return bishopAttacksBB(sq, occ);
    case "R":
    case "r":
      return rookAttacksBB(sq, occ);
    case "Q":
    case "q":
      return queenAttacksBB(sq, occ);
    case "K":
    case "k":
      return kingAttacksBB(sq);
  }
}

export function pieceAttacksFromSquare(state: ChessState, sq: Square): bigint {
  const p = state.board[sq];
  if (!p) return BB_ZERO;
  let occ = BB_ZERO;
  for (let i = 0; i < 64; i++) {
    if (state.board[i] !== null) occ |= BB_ONE << BigInt(i);
  }
  return pieceAttacksWithOcc(p, sq, occ);
}

// ---------------------------------------------------------------------------
// FEN Parsing & Serialization
// ---------------------------------------------------------------------------

export function parseFen(
  fen: string
): { ok: true; state: ChessState } | { ok: false; error: string } {
  const trimmed = fen.trim();
  if (!trimmed) return { ok: false, error: "FEN string is empty." };
  const parts = trimmed.split(/\s+/);
  if (parts.length < 4 || parts.length > 6) {
    return {
      ok: false,
      error: `Expected 4 to 6 space-separated FEN fields, got ${parts.length}.`,
    };
  }

  const [placement, turnStr, castlingStr, epStr, halfStr = "0", fullStr = "1"] =
    parts;
  const ranks = placement.split("/");
  if (ranks.length !== 8) {
    return {
      ok: false,
      error: `Piece placement must have 8 ranks separated by '/', got ${ranks.length}.`,
    };
  }

  const board: (PieceChar | null)[] = new Array(64).fill(null);
  let whiteKings = 0;
  let blackKings = 0;

  for (let i = 0; i < 8; i++) {
    const rankIdx = 7 - i; // FEN starts at rank 8 down to rank 1
    let fileIdx = 0;
    for (const ch of ranks[i]) {
      if (ch >= "1" && ch <= "8") {
        fileIdx += Number(ch);
      } else if (VALID_PIECES.has(ch)) {
        if (fileIdx >= 8) {
          return {
            ok: false,
            error: `Rank ${rankIdx + 1} has more than 8 files.`,
          };
        }
        const piece = ch as PieceChar;
        if ((piece === "P" || piece === "p") && (rankIdx === 0 || rankIdx === 7)) {
          return {
            ok: false,
            error: `Pawns cannot sit on rank ${rankIdx + 1}.`,
          };
        }
        if (piece === "K") whiteKings++;
        if (piece === "k") blackKings++;
        board[makeSquare(fileIdx, rankIdx)] = piece;
        fileIdx++;
      } else {
        return {
          ok: false,
          error: `Invalid piece or digit '${ch}' in rank ${rankIdx + 1}.`,
        };
      }
    }
    if (fileIdx !== 8) {
      return {
        ok: false,
        error: `Rank ${rankIdx + 1} has ${fileIdx} files instead of 8.`,
      };
    }
  }

  if (whiteKings !== 1 || blackKings !== 1) {
    return {
      ok: false,
      error: `Position must have exactly 1 White king and 1 Black king (found W:${whiteKings}, B:${blackKings}).`,
    };
  }

  if (turnStr !== "w" && turnStr !== "b") {
    return {
      ok: false,
      error: `Side to move must be 'w' or 'b', got '${turnStr}'.`,
    };
  }

  const castling: CastlingRights = { K: false, Q: false, k: false, q: false };
  if (castlingStr !== "-") {
    for (const ch of castlingStr) {
      if (ch === "K" || ch === "Q" || ch === "k" || ch === "q") {
        if (castling[ch]) {
          return { ok: false, error: `Duplicate castling flag '${ch}'.` };
        }
        castling[ch] = true;
      } else {
        return {
          ok: false,
          error: `Invalid castling character '${ch}' (expected KQkq or '-').`,
        };
      }
    }
  }

  let epSquare: Square | null = null;
  if (epStr !== "-") {
    const sq = coordToSquare(epStr);
    if (sq === null) {
      return { ok: false, error: `Invalid en passant square '${epStr}'.` };
    }
    const r = rankOf(sq);
    if ((turnStr === "w" && r !== 5) || (turnStr === "b" && r !== 2)) {
      return {
        ok: false,
        error: `En passant target '${epStr}' is inconsistent with side to move '${turnStr}'.`,
      };
    }
    epSquare = sq;
  }

  if (!/^\d+$/.test(halfStr)) {
    return { ok: false, error: `Invalid halfmove clock '${halfStr}'.` };
  }
  if (!/^\d+$/.test(fullStr) || Number(fullStr) < 1) {
    return { ok: false, error: `Fullmove number must be >= 1, got '${fullStr}'.` };
  }

  const state: ChessState = {
    board,
    turn: turnStr,
    castling,
    epSquare,
    halfmove: Number(halfStr),
    fullmove: Number(fullStr),
  };

  // Validate opponent king is not already in check
  const opponent: Color = turnStr === "w" ? "b" : "w";
  if (isKingInCheck(state, opponent)) {
    return {
      ok: false,
      error: `Illegal position: ${opponent === "w" ? "White" : "Black"}'s king can be captured immediately.`,
    };
  }

  return { ok: true, state };
}

export function toFen(state: ChessState): string {
  const rankStrs: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    let s = "";
    for (let f = 0; f < 8; f++) {
      const p = state.board[makeSquare(f, r)];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          s += String(empty);
          empty = 0;
        }
        s += p;
      }
    }
    if (empty > 0) s += String(empty);
    rankStrs.push(s);
  }
  const c =
    (state.castling.K ? "K" : "") +
    (state.castling.Q ? "Q" : "") +
    (state.castling.k ? "k" : "") +
    (state.castling.q ? "q" : "");
  return `${rankStrs.join("/")} ${state.turn} ${c || "-"} ${
    state.epSquare !== null ? squareToCoord(state.epSquare) : "-"
  } ${state.halfmove} ${state.fullmove}`;
}

export function createStartState(): ChessState {
  const parsed = parseFen(STARTPOS_FEN);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.state;
}

// ---------------------------------------------------------------------------
// Fast internal board representation for Perft & Alpha-Beta Search
// ---------------------------------------------------------------------------
// Piece codes: 0 = empty
// 1..6 = White P,N,B,R,Q,K
// 9..14 = Black P,N,B,R,Q,K (bit 3 = 8 means Black)

const EMPTY = 0;
const WP = 1;
const WN = 2;
const WB = 3;
const WR = 4;
const WQ = 5;
const WK = 6;
const BP = 9;
const BN = 10;
const BB = 11;
const BR = 12;
const BQ = 13;
const BK = 14;

const CHAR_TO_CODE: Record<PieceChar, number> = {
  P: WP,
  N: WN,
  B: WB,
  R: WR,
  Q: WQ,
  K: WK,
  p: BP,
  n: BN,
  b: BB,
  r: BR,
  q: BQ,
  k: BK,
};

const CODE_TO_CHAR: (PieceChar | null)[] = [
  null,
  "P",
  "N",
  "B",
  "R",
  "Q",
  "K",
  null,
  null,
  "p",
  "n",
  "b",
  "r",
  "q",
  "k",
];

// Packed move:
// bits 0..5: from (0..63)
// bits 6..11: to (0..63)
// bits 12..15: flag
//   0 = quiet, 1 = double pawn push, 2 = K castle, 3 = Q castle
//   4 = capture, 5 = en passant
//   8..11 = promo quiet (N,B,R,Q)
//   12..15 = promo capture (N,B,R,Q)
const MF_QUIET = 0;
const MF_DOUBLE_PUSH = 1;
const MF_K_CASTLE = 2;
const MF_Q_CASTLE = 3;
const MF_CAPTURE = 4;
const MF_EP = 5;
const MF_PROMO_N = 8;
const MF_PROMO_B = 9;
const MF_PROMO_R = 10;
const MF_PROMO_Q = 11;
const MF_PROMO_CAP_N = 12;
const MF_PROMO_CAP_B = 13;
const MF_PROMO_CAP_R = 14;
const MF_PROMO_CAP_Q = 15;

const PROMO_FLAG_TO_CHAR: Record<number, PromoPiece> = {
  0: "n",
  1: "b",
  2: "r",
  3: "q",
};

function packMove(from: number, to: number, flag: number): number {
  return (from & 63) | ((to & 63) << 6) | ((flag & 15) << 12);
}

function moveFrom(m: number): number {
  return m & 63;
}
function moveTo(m: number): number {
  return (m >> 6) & 63;
}
function moveFlag(m: number): number {
  return (m >> 12) & 15;
}
function moveIsCapture(m: number): boolean {
  return ((m >> 12) & 4) !== 0;
}
function moveIsPromo(m: number): boolean {
  return ((m >> 12) & 8) !== 0;
}

const CASTLE_MASK = new Uint8Array(64).fill(15);
CASTLE_MASK[0] = 15 ^ 2; // a1 (WQ)
CASTLE_MASK[4] = 15 ^ 3; // e1 (WK + WQ)
CASTLE_MASK[7] = 15 ^ 1; // h1 (WK)
CASTLE_MASK[56] = 15 ^ 8; // a8 (BQ)
CASTLE_MASK[60] = 15 ^ 12; // e8 (BK + BQ)
CASTLE_MASK[63] = 15 ^ 4; // h8 (BK)

const KNIGHT_OFFSETS = [17, 15, 10, 6, -17, -15, -10, -6];
const KING_OFFSETS = [9, 8, 7, 1, -1, -7, -8, -9];
const BISHOP_SLIDES: readonly [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ROOK_SLIDES: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Precomputed neighbor squares for knight/king to avoid bounds math in tight loops
const KNIGHT_STEPS: number[][] = Array.from({ length: 64 }, (_, sq) => {
  const f = sq & 7;
  const r = sq >> 3;
  const out: number[] = [];
  for (const off of KNIGHT_OFFSETS) {
    const t = sq + off;
    if (t >= 0 && t < 64) {
      const df = Math.abs((t & 7) - f);
      const dr = Math.abs((t >> 3) - r);
      if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) out.push(t);
    }
  }
  return out;
});

const KING_STEPS: number[][] = Array.from({ length: 64 }, (_, sq) => {
  const f = sq & 7;
  const r = sq >> 3;
  const out: number[] = [];
  for (const off of KING_OFFSETS) {
    const t = sq + off;
    if (t >= 0 && t < 64) {
      if (Math.abs((t & 7) - f) <= 1 && Math.abs((t >> 3) - r) <= 1) {
        out.push(t);
      }
    }
  }
  return out;
});

interface UndoRecord {
  captured: number;
  castling: number;
  ep: number;
  halfmove: number;
  wKingSq: number;
  bKingSq: number;
}

class FastBoard {
  sq = new Uint8Array(64);
  turn = 0; // 0 = white, 1 = black
  castling = 0; // bit 0=WK, 1=WQ, 2=BK, 3=BQ
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  wKingSq = 4;
  bKingSq = 60;
  undoStack: UndoRecord[] = [];

  static fromState(state: ChessState): FastBoard {
    const fb = new FastBoard();
    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (p) {
        const code = CHAR_TO_CODE[p];
        fb.sq[i] = code;
        if (code === WK) fb.wKingSq = i;
        else if (code === BK) fb.bKingSq = i;
      }
    }
    fb.turn = state.turn === "w" ? 0 : 1;
    fb.castling =
      (state.castling.K ? 1 : 0) |
      (state.castling.Q ? 2 : 0) |
      (state.castling.k ? 4 : 0) |
      (state.castling.q ? 8 : 0);
    fb.ep = state.epSquare ?? -1;
    fb.halfmove = state.halfmove;
    fb.fullmove = state.fullmove;
    return fb;
  }

  toState(): ChessState {
    const board: (PieceChar | null)[] = new Array(64);
    for (let i = 0; i < 64; i++) board[i] = CODE_TO_CHAR[this.sq[i]];
    return {
      board,
      turn: this.turn === 0 ? "w" : "b",
      castling: {
        K: (this.castling & 1) !== 0,
        Q: (this.castling & 2) !== 0,
        k: (this.castling & 4) !== 0,
        q: (this.castling & 8) !== 0,
      },
      epSquare: this.ep >= 0 ? this.ep : null,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
    };
  }

  isSquareAttacked(target: number, bySide: number): boolean {
    const f0 = target & 7;
    const r0 = target >> 3;
    const board = this.sq;

    // Pawns
    if (bySide === 0) {
      if (r0 > 0) {
        if (f0 > 0 && board[target - 9] === WP) return true;
        if (f0 < 7 && board[target - 7] === WP) return true;
      }
    } else {
      if (r0 < 7) {
        if (f0 > 0 && board[target + 7] === BP) return true;
        if (f0 < 7 && board[target + 9] === BP) return true;
      }
    }

    // Knights
    const enemyN = bySide === 0 ? WN : BN;
    for (const s of KNIGHT_STEPS[target]) {
      if (board[s] === enemyN) return true;
    }

    // King
    const enemyK = bySide === 0 ? WK : BK;
    for (const s of KING_STEPS[target]) {
      if (board[s] === enemyK) return true;
    }

    // Bishops / Queens
    const enemyB = bySide === 0 ? WB : BB;
    const enemyQ = bySide === 0 ? WQ : BQ;
    for (const [df, dr] of BISHOP_SLIDES) {
      let f = f0 + df;
      let r = r0 + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = board[(r << 3) | f];
        if (p !== EMPTY) {
          if (p === enemyB || p === enemyQ) return true;
          break;
        }
        f += df;
        r += dr;
      }
    }

    // Rooks / Queens
    const enemyR = bySide === 0 ? WR : BR;
    for (const [df, dr] of ROOK_SLIDES) {
      let f = f0 + df;
      let r = r0 + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = board[(r << 3) | f];
        if (p !== EMPTY) {
          if (p === enemyR || p === enemyQ) return true;
          break;
        }
        f += df;
        r += dr;
      }
    }

    return false;
  }

  inCheck(side = this.turn): boolean {
    const kSq = side === 0 ? this.wKingSq : this.bKingSq;
    return this.isSquareAttacked(kSq, side ^ 1);
  }

  makeMove(m: number): void {
    const from = moveFrom(m);
    const to = moveTo(m);
    const flag = moveFlag(m);
    const moving = this.sq[from];
    const side = this.turn;

    let captured = this.sq[to];
    if (flag === MF_EP) {
      const capSq = side === 0 ? to - 8 : to + 8;
      captured = this.sq[capSq];
      this.sq[capSq] = EMPTY;
    }

    this.undoStack.push({
      captured,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      wKingSq: this.wKingSq,
      bKingSq: this.bKingSq,
    });

    this.sq[from] = EMPTY;
    if (moveIsPromo(m)) {
      const pt = (flag & 3) + 2; // 2=N, 3=B, 4=R, 5=Q
      this.sq[to] = side === 0 ? pt : pt | 8;
    } else {
      this.sq[to] = moving;
    }

    if (moving === WK) this.wKingSq = to;
    else if (moving === BK) this.bKingSq = to;

    // Move rook on castling
    if (flag === MF_K_CASTLE) {
      const rFrom = side === 0 ? 7 : 63;
      const rTo = side === 0 ? 5 : 61;
      this.sq[rTo] = this.sq[rFrom];
      this.sq[rFrom] = EMPTY;
    } else if (flag === MF_Q_CASTLE) {
      const rFrom = side === 0 ? 0 : 56;
      const rTo = side === 0 ? 3 : 59;
      this.sq[rTo] = this.sq[rFrom];
      this.sq[rFrom] = EMPTY;
    }

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag === MF_DOUBLE_PUSH ? (side === 0 ? from + 8 : from - 8) : -1;

    if ((moving & 7) === 1 || captured !== EMPTY) {
      this.halfmove = 0;
    } else {
      this.halfmove++;
    }

    if (side === 1) this.fullmove++;
    this.turn ^= 1;
  }

  unmakeMove(m: number): void {
    const undo = this.undoStack.pop()!;
    this.turn ^= 1;
    const side = this.turn;
    if (side === 1) this.fullmove--;

    const from = moveFrom(m);
    const to = moveTo(m);
    const flag = moveFlag(m);

    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.wKingSq = undo.wKingSq;
    this.bKingSq = undo.bKingSq;

    if (moveIsPromo(m)) {
      this.sq[from] = side === 0 ? WP : BP;
    } else {
      this.sq[from] = this.sq[to];
    }

    if (flag === MF_EP) {
      this.sq[to] = EMPTY;
      const capSq = side === 0 ? to - 8 : to + 8;
      this.sq[capSq] = undo.captured;
    } else {
      this.sq[to] = undo.captured;
    }

    if (flag === MF_K_CASTLE) {
      const rFrom = side === 0 ? 7 : 63;
      const rTo = side === 0 ? 5 : 61;
      this.sq[rFrom] = this.sq[rTo];
      this.sq[rTo] = EMPTY;
    } else if (flag === MF_Q_CASTLE) {
      const rFrom = side === 0 ? 0 : 56;
      const rTo = side === 0 ? 3 : 59;
      this.sq[rFrom] = this.sq[rTo];
      this.sq[rTo] = EMPTY;
    }
  }

  generatePseudoMoves(capturesOnly = false): number[] {
    const moves: number[] = [];
    const side = this.turn;
    const board = this.sq;
    const enemyBit = side === 0 ? 8 : 0;

    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (p === EMPTY) continue;
      if ((p & 8) !== (side << 3)) continue;

      const pt = p & 7;
      const f0 = sq & 7;
      const r0 = sq >> 3;

      if (pt === 1) {
        // Pawn
        const dir = side === 0 ? 8 : -8;
        const startRank = side === 0 ? 1 : 6;
        const promoRank = side === 0 ? 6 : 1;

        // Forward pushes
        const fwd = sq + dir;
        if (board[fwd] === EMPTY) {
          if (r0 === promoRank) {
            moves.push(packMove(sq, fwd, MF_PROMO_Q));
            moves.push(packMove(sq, fwd, MF_PROMO_R));
            moves.push(packMove(sq, fwd, MF_PROMO_B));
            moves.push(packMove(sq, fwd, MF_PROMO_N));
          } else if (!capturesOnly) {
            moves.push(packMove(sq, fwd, MF_QUIET));
            if (r0 === startRank && board[fwd + dir] === EMPTY) {
              moves.push(packMove(sq, fwd + dir, MF_DOUBLE_PUSH));
            }
          }
        }

        // Captures
        const capOffsets = side === 0 ? [7, 9] : [-9, -7];
        for (let i = 0; i < 2; i++) {
          const cap = sq + capOffsets[i];
          if (cap < 0 || cap >= 64) continue;
          if (Math.abs((cap & 7) - f0) !== 1) continue;
          const target = board[cap];
          if (target !== EMPTY && (target & 8) === enemyBit) {
            if (r0 === promoRank) {
              moves.push(packMove(sq, cap, MF_PROMO_CAP_Q));
              moves.push(packMove(sq, cap, MF_PROMO_CAP_R));
              moves.push(packMove(sq, cap, MF_PROMO_CAP_B));
              moves.push(packMove(sq, cap, MF_PROMO_CAP_N));
            } else {
              moves.push(packMove(sq, cap, MF_CAPTURE));
            }
          } else if (cap === this.ep) {
            moves.push(packMove(sq, cap, MF_EP));
          }
        }
      } else if (pt === 2) {
        // Knight
        for (const to of KNIGHT_STEPS[sq]) {
          const target = board[to];
          if (target === EMPTY) {
            if (!capturesOnly) moves.push(packMove(sq, to, MF_QUIET));
          } else if ((target & 8) === enemyBit) {
            moves.push(packMove(sq, to, MF_CAPTURE));
          }
        }
      } else if (pt === 6) {
        // King
        for (const to of KING_STEPS[sq]) {
          const target = board[to];
          if (target === EMPTY) {
            if (!capturesOnly) moves.push(packMove(sq, to, MF_QUIET));
          } else if ((target & 8) === enemyBit) {
            moves.push(packMove(sq, to, MF_CAPTURE));
          }
        }
        // Castling
        if (!capturesOnly) {
          if (side === 0 && sq === 4) {
            if (
              (this.castling & 1) !== 0 &&
              board[5] === EMPTY &&
              board[6] === EMPTY &&
              board[7] === WR &&
              !this.isSquareAttacked(4, 1) &&
              !this.isSquareAttacked(5, 1) &&
              !this.isSquareAttacked(6, 1)
            ) {
              moves.push(packMove(4, 6, MF_K_CASTLE));
            }
            if (
              (this.castling & 2) !== 0 &&
              board[3] === EMPTY &&
              board[2] === EMPTY &&
              board[1] === EMPTY &&
              board[0] === WR &&
              !this.isSquareAttacked(4, 1) &&
              !this.isSquareAttacked(3, 1) &&
              !this.isSquareAttacked(2, 1)
            ) {
              moves.push(packMove(4, 2, MF_Q_CASTLE));
            }
          } else if (side === 1 && sq === 60) {
            if (
              (this.castling & 4) !== 0 &&
              board[61] === EMPTY &&
              board[62] === EMPTY &&
              board[63] === BR &&
              !this.isSquareAttacked(60, 0) &&
              !this.isSquareAttacked(61, 0) &&
              !this.isSquareAttacked(62, 0)
            ) {
              moves.push(packMove(60, 62, MF_K_CASTLE));
            }
            if (
              (this.castling & 8) !== 0 &&
              board[59] === EMPTY &&
              board[58] === EMPTY &&
              board[57] === EMPTY &&
              board[56] === BR &&
              !this.isSquareAttacked(60, 0) &&
              !this.isSquareAttacked(59, 0) &&
              !this.isSquareAttacked(58, 0)
            ) {
              moves.push(packMove(60, 58, MF_Q_CASTLE));
            }
          }
        }
      } else {
        // Sliders: B (3), R (4), Q (5)
        const dirs =
          pt === 3
            ? BISHOP_SLIDES
            : pt === 4
              ? ROOK_SLIDES
              : [...BISHOP_SLIDES, ...ROOK_SLIDES];
        for (const [df, dr] of dirs) {
          let f = f0 + df;
          let r = r0 + dr;
          while (f >= 0 && f < 8 && r >= 0 && r < 8) {
            const to = (r << 3) | f;
            const target = board[to];
            if (target === EMPTY) {
              if (!capturesOnly) moves.push(packMove(sq, to, MF_QUIET));
            } else {
              if ((target & 8) === enemyBit) {
                moves.push(packMove(sq, to, MF_CAPTURE));
              }
              break;
            }
            f += df;
            r += dr;
          }
        }
      }
    }

    return moves;
  }

  generateLegalMoves(capturesOnly = false): number[] {
    const pseudo = this.generatePseudoMoves(capturesOnly);
    const legal: number[] = [];
    const us = this.turn;
    for (const m of pseudo) {
      this.makeMove(m);
      if (!this.inCheck(us)) legal.push(m);
      this.unmakeMove(m);
    }
    return legal;
  }
}

// ---------------------------------------------------------------------------
// Public move generation, status, SAN, applyMove
// ---------------------------------------------------------------------------

function isKingInCheck(state: ChessState, color: Color): boolean {
  const fb = FastBoard.fromState(state);
  return fb.inCheck(color === "w" ? 0 : 1);
}

function fastMoveToUci(m: number): string {
  const base = squareToCoord(moveFrom(m)) + squareToCoord(moveTo(m));
  if (!moveIsPromo(m)) return base;
  return base + PROMO_FLAG_TO_CHAR[moveFlag(m) & 3];
}

function fastMoveToChessMove(
  fb: FastBoard,
  m: number,
  allLegal: number[]
): ChessMove {
  const from = moveFrom(m);
  const to = moveTo(m);
  const flag = moveFlag(m);
  const piece = CODE_TO_CHAR[fb.sq[from]]!;
  const pt = pieceType(piece);
  let captured: PieceChar | undefined;
  if (flag === MF_EP) {
    captured = fb.turn === 0 ? "p" : "P";
  } else if (moveIsCapture(m)) {
    captured = CODE_TO_CHAR[fb.sq[to]] ?? undefined;
  }
  const promotion = moveIsPromo(m)
    ? PROMO_FLAG_TO_CHAR[flag & 3]
    : undefined;
  const isEnPassant = flag === MF_EP ? true : undefined;
  const isCastle =
    flag === MF_K_CASTLE
      ? fb.turn === 0
        ? "K"
        : "k"
      : flag === MF_Q_CASTLE
        ? fb.turn === 0
          ? "Q"
          : "q"
        : undefined;

  // Compute SAN
  let san = "";
  if (flag === MF_K_CASTLE) {
    san = "O-O";
  } else if (flag === MF_Q_CASTLE) {
    san = "O-O-O";
  } else if (pt === "p") {
    if (captured) {
      san += FILES[fileOf(from)] + "x";
    }
    san += squareToCoord(to);
    if (promotion) san += "=" + promotion.toUpperCase();
  } else {
    san += pt.toUpperCase();
    // Disambiguation among legal moves of same piece type to same destination
    let sameFile = false;
    let sameRank = false;
    let ambig = false;
    for (const other of allLegal) {
      if (other === m) continue;
      if (moveTo(other) !== to) continue;
      const oFrom = moveFrom(other);
      if (fb.sq[oFrom] === fb.sq[from]) {
        ambig = true;
        if (fileOf(oFrom) === fileOf(from)) sameFile = true;
        if (rankOf(oFrom) === rankOf(from)) sameRank = true;
      }
    }
    if (ambig) {
      if (!sameFile) san += FILES[fileOf(from)];
      else if (!sameRank) san += RANKS[rankOf(from)];
      else san += squareToCoord(from);
    }
    if (captured) san += "x";
    san += squareToCoord(to);
  }

  // Check / Checkmate suffix
  fb.makeMove(m);
  if (fb.inCheck()) {
    const oppMoves = fb.generateLegalMoves();
    san += oppMoves.length === 0 ? "#" : "+";
  }
  fb.unmakeMove(m);

  return {
    from,
    to,
    piece,
    captured,
    promotion,
    isEnPassant,
    isCastle,
    uci: fastMoveToUci(m),
    san,
  };
}

export function getLegalMoves(state: ChessState): ChessMove[] {
  const fb = FastBoard.fromState(state);
  const legal = fb.generateLegalMoves();
  return legal.map((m) => fastMoveToChessMove(fb, m, legal));
}

export function applyMove(state: ChessState, moveOrUci: ChessMove | string): ChessState {
  const uci = typeof moveOrUci === "string" ? moveOrUci : moveOrUci.uci;
  const fb = FastBoard.fromState(state);
  const legal = fb.generateLegalMoves();
  for (const m of legal) {
    if (fastMoveToUci(m) === uci) {
      fb.makeMove(m);
      return fb.toState();
    }
  }
  throw new Error(`Illegal move '${uci}' for current position.`);
}

export function getGameStatus(
  state: ChessState,
  precomputedLegal?: ChessMove[]
): GameStatus {
  const inCheck = isKingInCheck(state, state.turn);
  const legalCount = precomputedLegal
    ? precomputedLegal.length
    : FastBoard.fromState(state).generateLegalMoves().length;
  const isCheckmate = inCheck && legalCount === 0;
  const isStalemate = !inCheck && legalCount === 0;
  const isFiftyMoveDraw = state.halfmove >= 100 && !isCheckmate;
  const isInsufficientMaterial = checkInsufficientMaterial(state);

  return {
    inCheck,
    isCheckmate,
    isStalemate,
    isFiftyMoveDraw,
    isInsufficientMaterial,
    isGameOver:
      isCheckmate || isStalemate || isFiftyMoveDraw || isInsufficientMaterial,
    legalMoveCount: legalCount,
  };
}

function checkInsufficientMaterial(state: ChessState): boolean {
  let wMinor = 0;
  let bMinor = 0;
  let wBishopColor = -1;
  let bBishopColor = -1;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const pt = pieceType(p);
    if (pt === "p" || pt === "r" || pt === "q") return false;
    if (pt === "n") {
      if (pieceColor(p) === "w") wMinor++;
      else bMinor++;
    } else if (pt === "b") {
      const sqColor = (fileOf(sq) + rankOf(sq)) & 1;
      if (pieceColor(p) === "w") {
        wMinor++;
        if (wBishopColor === -1) wBishopColor = sqColor;
        else if (wBishopColor !== sqColor) return false;
      } else {
        bMinor++;
        if (bBishopColor === -1) bBishopColor = sqColor;
        else if (bBishopColor !== sqColor) return false;
      }
    }
  }

  if (wMinor === 0 && bMinor === 0) return true;
  if ((wMinor === 1 && bMinor === 0) || (wMinor === 0 && bMinor === 1)) {
    return true;
  }
  if (
    wMinor === 1 &&
    bMinor === 1 &&
    wBishopColor !== -1 &&
    bBishopColor !== -1 &&
    wBishopColor === bBishopColor
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Perft & Divide
// ---------------------------------------------------------------------------

function fastPerft(fb: FastBoard, depth: number): number {
  if (depth <= 0) return 1;
  const pseudo = fb.generatePseudoMoves();
  const us = fb.turn;

  if (depth === 1) {
    let nodes = 0;
    for (const m of pseudo) {
      fb.makeMove(m);
      if (!fb.inCheck(us)) nodes++;
      fb.unmakeMove(m);
    }
    return nodes;
  }

  let nodes = 0;
  for (const m of pseudo) {
    fb.makeMove(m);
    if (!fb.inCheck(us)) {
      nodes += fastPerft(fb, depth - 1);
    }
    fb.unmakeMove(m);
  }
  return nodes;
}

export function perft(state: ChessState, depth: number): number {
  const clamped = Math.max(0, Math.min(4, Math.floor(depth)));
  const fb = FastBoard.fromState(state);
  return fastPerft(fb, clamped);
}

export interface DivideResult {
  entries: DivideEntry[];
  total: number;
  elapsedMs: number;
}

export function divideWithTiming(state: ChessState, depth: number): DivideResult {
  const t0 = performance.now();
  const entries = divide(state, depth);
  const total = entries.reduce((acc, e) => acc + e.nodes, 0);
  const elapsedMs = Math.max(1, Math.round(performance.now() - t0));
  return { entries, total, elapsedMs };
}

export function divide(state: ChessState, depth: number): DivideEntry[] {
  const clamped = Math.max(1, Math.min(3, Math.floor(depth)));
  const fb = FastBoard.fromState(state);
  const legal = fb.generateLegalMoves();
  const out: DivideEntry[] = [];

  for (const m of legal) {
    const moveObj = fastMoveToChessMove(fb, m, legal);
    let nodes = 1;
    if (clamped > 1) {
      fb.makeMove(m);
      nodes = fastPerft(fb, clamped - 1);
      fb.unmakeMove(m);
    }
    out.push({ move: moveObj, nodes });
  }

  out.sort((a, b) => a.move.uci.localeCompare(b.move.uci));
  return out;
}

// ---------------------------------------------------------------------------
// Client-side Negamax Alpha-Beta + Quiescence + PST Engine
// ---------------------------------------------------------------------------

const MATE_SCORE = 30000;
const INF = 50000;

// Piece values (indexed by PieceType: 1=P, 2=N, 3=B, 4=R, 5=Q, 6=K)
const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 20000];

// Rank-from-white-perspective (0=rank1 .. 7=rank8) PSTs (classic PeSTO / CPW style)
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, -20, -20, 10, 10, 5,
  5, -5, -10, 0, 0, -10, -5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, 5, 10, 25, 25, 10, 5, 5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const PST_ROOK = [
  0, 0, 0, 5, 5, 0, 0, 0,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  5, 10, 10, 10, 10, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -10, 5, 5, 5, 5, 5, 0, -10,
  0, 0, 5, 5, 5, 5, 0, -5,
  -5, 0, 5, 5, 5, 5, 0, -5,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const PST_KING_MID = [
  20, 30, 10, 0, 0, 10, 30, 20,
  20, 20, 0, 0, 0, 0, 20, 20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
];

const PST_KING_END = [
  -50, -30, -30, -30, -30, -30, -30, -50,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -50, -40, -30, -20, -20, -30, -40, -50,
];

const PSTS: (number[] | null)[] = [
  null,
  PST_PAWN,
  PST_KNIGHT,
  PST_BISHOP,
  PST_ROOK,
  PST_QUEEN,
  PST_KING_MID,
];

function evaluateBoard(fb: FastBoard): number {
  const board = fb.sq;
  let score = 0;
  let nonPawnMat = 0;
  let wKingPst = 0;
  let bKingPst = 0;

  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === EMPTY) continue;
    const isBlack = (p & 8) !== 0;
    const pt = p & 7;
    const pstSq = isBlack ? sq ^ 56 : sq;
    const val = PIECE_VALUE[pt];

    if (pt >= 2 && pt <= 5) nonPawnMat += val;
    if (pt === 6) {
      wKingPst = !isBlack ? pstSq : wKingPst;
      bKingPst = isBlack ? pstSq : bKingPst;
    } else {
      const pst = PSTS[pt]![pstSq];
      score += isBlack ? -(val + pst) : val + pst;
    }
  }

  const kingTable = nonPawnMat <= 1600 ? PST_KING_END : PST_KING_MID;
  score += kingTable[wKingPst] - kingTable[bKingPst];

  return fb.turn === 0 ? score : -score;
}

class SearchContext {
  nodes = 0;
  stopTime = 0;
  stopped = false;
  killers: [number, number][] = Array.from({ length: 64 }, () => [0, 0]);
  pvTable: number[][] = Array.from({ length: 64 }, () => []);

  checkTime(): void {
    if ((this.nodes & 2047) === 0 && performance.now() >= this.stopTime) {
      this.stopped = true;
    }
  }

  scoreMove(fb: FastBoard, m: number, ply: number, ttBest: number): number {
    if (m === ttBest) return 1_000_000;
    const flag = moveFlag(m);
    if (moveIsCapture(m)) {
      const victim =
        flag === MF_EP ? 1 : fb.sq[moveTo(m)] & 7;
      const attacker = fb.sq[moveFrom(m)] & 7;
      const promoBonus = moveIsPromo(m) ? PIECE_VALUE[(flag & 3) + 2] : 0;
      return 100_000 + PIECE_VALUE[victim] * 10 - attacker + promoBonus;
    }
    if (moveIsPromo(m)) {
      return 90_000 + PIECE_VALUE[(flag & 3) + 2];
    }
    const [k1, k2] = this.killers[ply] ?? [0, 0];
    if (m === k1) return 80_000;
    if (m === k2) return 79_000;
    return 0;
  }

  quiescence(fb: FastBoard, alpha: number, beta: number, ply: number): number {
    this.nodes++;
    this.checkTime();
    if (this.stopped) return 0;

    if (ply >= 63) return evaluateBoard(fb);

    const standPat = evaluateBoard(fb);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const captures = fb.generateLegalMoves(true);
    const scored = captures.map((m) => ({
      m,
      s: this.scoreMove(fb, m, ply, 0),
    }));
    scored.sort((a, b) => b.s - a.s);

    for (const { m } of scored) {
      fb.makeMove(m);
      const score = -this.quiescence(fb, -beta, -alpha, ply + 1);
      fb.unmakeMove(m);
      if (this.stopped) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }

  negamax(
    fb: FastBoard,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    pvMove: number
  ): number {
    this.pvTable[ply] = [];
    this.checkTime();
    if (this.stopped) return 0;

    if (depth <= 0) {
      return this.quiescence(fb, alpha, beta, ply);
    }

    this.nodes++;
    const inCheck = fb.inCheck();
    const legal = fb.generateLegalMoves();

    if (legal.length === 0) {
      return inCheck ? -MATE_SCORE + ply : 0;
    }
    if (fb.halfmove >= 100) {
      return 0;
    }

    const scored = legal.map((m) => ({
      m,
      s: this.scoreMove(fb, m, ply, pvMove),
    }));
    scored.sort((a, b) => b.s - a.s);

    let bestScore = -INF;
    let firstChild = true;

    for (const { m } of scored) {
      fb.makeMove(m);
      const ext = fb.inCheck() && depth === 1 ? 1 : 0;
      const childPv =
        firstChild && this.pvTable[ply + 1]?.length ? this.pvTable[ply + 1][0] : 0;
      const score = -this.negamax(
        fb,
        depth - 1 + ext,
        -beta,
        -alpha,
        ply + 1,
        childPv
      );
      fb.unmakeMove(m);
      firstChild = false;

      if (this.stopped) return 0;

      if (score > bestScore) {
        bestScore = score;
        if (score > alpha) {
          alpha = score;
          this.pvTable[ply] = [m, ...(this.pvTable[ply + 1] ?? [])];
          if (alpha >= beta) {
            if (!moveIsCapture(m) && !moveIsPromo(m) && ply < 64) {
              const [k1] = this.killers[ply];
              if (k1 !== m) this.killers[ply] = [m, k1];
            }
            return beta;
          }
        }
      }
    }

    return bestScore;
  }
}

export function searchBestMove(
  state: ChessState,
  options: { maxDepth?: number; timeLimitMs?: number } = {}
): SearchResult {
  const maxDepth = Math.max(1, Math.min(6, options.maxDepth ?? 3));
  const timeLimitMs = options.timeLimitMs ?? 150;
  const start = performance.now();
  const fb = FastBoard.fromState(state);
  const rootLegal = fb.generateLegalMoves();

  if (rootLegal.length === 0) {
    return {
      bestMove: null,
      scoreCp: fb.inCheck() ? -MATE_SCORE : 0,
      depth: 0,
      nodes: 1,
      pv: [],
      elapsedMs: Math.round(performance.now() - start),
    };
  }

  const ctx = new SearchContext();
  // Always complete at least depth 3 (or maxDepth if < 3) for deterministic tactical puzzles,
  // then obey timeLimitMs for deeper iterations.
  ctx.stopTime = start + Math.max(timeLimitMs, 250);

  let completedDepth = 0;
  let bestScore = 0;
  let bestPvRaw: number[] = [rootLegal[0]];

  for (let d = 1; d <= maxDepth; d++) {
    if (d > 3 && performance.now() - start >= timeLimitMs) break;
    ctx.stopped = false;
    const prevBest = bestPvRaw[0] ?? 0;
    const score = ctx.negamax(fb, d, -INF, INF, 0, prevBest);
    if (ctx.stopped && d > 1) break;
    completedDepth = d;
    bestScore = score;
    if (ctx.pvTable[0].length > 0) {
      bestPvRaw = [...ctx.pvTable[0]];
    }
    if (Math.abs(score) > MATE_SCORE - 100) break;
  }

  // Convert PV raw moves into rich ChessMove objects
  const pv: ChessMove[] = [];
  const replay = FastBoard.fromState(state);
  for (const rawMove of bestPvRaw) {
    const legal = replay.generateLegalMoves();
    if (!legal.includes(rawMove)) break;
    pv.push(fastMoveToChessMove(replay, rawMove, legal));
    replay.makeMove(rawMove);
  }

  let mateIn: number | undefined;
  if (Math.abs(bestScore) > MATE_SCORE - 1000) {
    const plies = MATE_SCORE - Math.abs(bestScore);
    const moves = Math.max(1, Math.ceil(plies / 2));
    mateIn = bestScore > 0 ? moves : -moves;
  }

  return {
    bestMove: pv[0] ?? null,
    scoreCp: bestScore,
    mateIn,
    depth: completedDepth,
    nodes: ctx.nodes,
    pv,
    elapsedMs: Math.max(1, Math.round(performance.now() - start)),
  };
}

export function evaluateStatic(state: ChessState): number {
  return evaluateBoard(FastBoard.fromState(state));
}

export { PIECE_CHARS };
