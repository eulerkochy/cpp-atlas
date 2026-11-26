## Your task

Edit `include/chess/eval.hpp` to implement `evaluate(const Position& pos) noexcept` using the score bounds already declared there:

```cpp
namespace chess {

inline constexpr int INF_SCORE = 30000;
inline constexpr int MATE_SCORE = 29000;
inline constexpr int MATE_THRESHOLD = 28000;

int evaluate(const Position& pos) noexcept;

} // namespace chess
```

`evaluate(pos)` returns a static evaluation in **centipawns** from the perspective of `pos.side_to_move()` (positive means good for the side to move; negative means good for the opponent).

Submit with `./cppatlas submit` or test locally with `./cppatlas test 6`.

## Design & C++23 mechanics

Why does `evaluate` return a score relative to `side_to_move()` rather than always from White's point of view?

- Because Stage 7 uses **negamax** search: instead of separate `min` and `max` branches, every node maximizes `score = -search(child)` and returns `evaluate(pos)` at leaves. A side-to-move-relative `evaluate` makes the whole search tree completely symmetric.
- Combine **material** (e.g., `Pawn = 100`, `Knight = 320`, `Bishop = 330`, `Rook = 500`, `Queen = 900`) with **piece-square tables (PSTs)** stored as `constexpr std::array<int, 64>` tables (for middlegame and endgame, or blended by game phase—e.g. PeSTO-style tapered evaluation).
- **Color symmetry by rank mirroring (`sq ^ 56`)**:
  - Store one PST per piece type written from White's perspective (or rank-8-down-to-rank-1, matching visual chessboards).
  - For a White piece on `sq`, index with `sq ^ 56` (if the table is written top-down from rank 8 to rank 1) or `sq` (if written rank 1 to rank 8); for a Black piece, mirror the rank by XORing `sq` with `56` (`sq ^ 56`, which flips `rank 0 ↔ 7`, `1 ↔ 6`, ..., while preserving the file `a`–`h`).
  - Because every White term and Black term reads the exact same table through a rank mirror, flipping colors and mirroring ranks across a position is guaranteed to negate the White-minus-Black total cleanly—so `evaluate(pos) == evaluate(color_flipped_pos)` automatically!
- Add small positional terms such as a bishop-pair bonus (`+30` cp when `popcount(pieces(c, Bishop)) >= 2`) and endgame king centralization (or tapered midgame/endgame king tables) so the engine activates its king once queens leave the board.

## What the tests check

- **Color symmetry invariant.** `evaluate(startpos)` is `0`. Across asymmetric positions and their color-flipped/rank-mirrored twins (colors swapped, ranks `1↔8` mirrored, side to move flipped), `evaluate(pos) == evaluate(flipped_pos)`; flipping *only* side-to-move negates the score (`evaluate(white_to_move) == -evaluate(black_to_move)`).
- **Material ordering.** An extra Queen beats an extra Rook, which beats an extra Bishop or Knight, which beats an extra Pawn, which beats equal material (with clear margins: Pawn `>= +50` cp, Knight/Bishop `>= +200` cp, Rook `>= +350` cp, Queen `>= +700` cp).
- **Side-to-move perspective.** A side up a Queen evaluates `> +700` when it is to move and `< -700` when the opponent is to move.
- **Positional sanity.** Central knights (`Nf3`/`Nc3`/`Nd4`) score higher than rim/corner knights (`Na1`/`Nh1`); central pawns (`e4`/`d4`) score higher than unmoved rim pawns; in a `K+P vs K` endgame, a centralized king (`e4`) scores higher than a corner king (`a1`).
- **Boundedness.** Static evaluation always stays strictly inside `(-MATE_THRESHOLD, MATE_THRESHOLD)` so it can never collide with mate scores in search.

## Gotchas

- **Flipping `a↔h` instead of `1↔8` (or forgetting `^ 56` altogether).** `sq ^ 56` flips the rank (`A1=0 ↔ A8=56`), keeping the kingside castling squares (`G1=6 ↔ G8=62`) aligned. Flipping `63 - sq` reverses the *file* as well (`A1 ↔ H8`), breaking kingside vs queenside symmetry!
- **Computing White-minus-Black and forgetting to negate for Black.** If `score = white_score - black_score`, return `pos.side_to_move() == Color::White ? score : -score`. Returning `score` directly causes Black to try to *lose* its own pieces in Stage 7!
- **Using `int` overflow or out-of-range bonuses.** Keep evaluation values comfortably within `[-15000, +15000]` so even a 9-queen material edge never crosses `±MATE_THRESHOLD` (`28000`).
- **No `std::abs` surprises or UB on `Color::None`.** Guard against empty boards or missing kings gracefully since `evaluate` is `noexcept`.

## Now read the real ones

- Chess Programming Wiki: [Evaluation](https://www.chessprogramming.org/Evaluation), [Piece-Square Tables](https://www.chessprogramming.org/Piece-Square_Tables), [Tapered Eval](https://www.chessprogramming.org/Tapered_Eval), [PeSTO's Evaluation Function](https://www.chessprogramming.org/PeSTO%27s_Evaluation_Function)
- Stockfish: [`evaluate.cpp`](https://github.com/official-stockfish/Stockfish/blob/master/src/evaluate.cpp)
- cppreference: [`std::array`](https://en.cppreference.com/w/cpp/container/array), [`std::clamp`](https://en.cppreference.com/w/cpp/algorithm/clamp), [`noexcept`](https://en.cppreference.com/w/cpp/language/noexcept_spec).
