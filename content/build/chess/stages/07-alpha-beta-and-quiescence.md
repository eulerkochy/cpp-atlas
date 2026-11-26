## Your task

Edit `include/chess/search.hpp` to implement negamax alpha-beta search and quiescence search inside `chess::Searcher` (`search` and `quiesce`):

```cpp
namespace chess {

struct SearchLimits {
    int max_depth = 64;
    std::uint64_t max_nodes = 0;
    std::int64_t movetime_ms = 0;
};

struct SearchInfo {
    int depth = 0;
    int score = 0;
    std::uint64_t nodes = 0;
    std::int64_t time_ms = 0;
    std::vector<Move> pv;
};

struct SearchResult {
    Move best_move{};
    int score = 0;
    int depth = 0;
    std::uint64_t nodes = 0;
    std::vector<Move> pv;
};

class Searcher {
public:
    explicit Searcher(std::size_t tt_mb = 16);

    SearchResult search(Position& pos, const SearchLimits& limits,
                        std::function<void(const SearchInfo&)> on_info = nullptr);

    int quiesce(Position& pos, int alpha, int beta, int ply);
    // ... TT & stop controls used in Stage 8
};

} // namespace chess
```

In Stage 7, focus on `negamax` alpha-beta pruning, `quiesce`, move ordering, terminal checkmate/stalemate detection, and `SearchResult` (`best_move`, `score`, `depth`, `nodes`, `pv`). Stage 8 adds the transposition table, iterative deepening callbacks, and time/node limits (you can already structure `search` with a clean `alphabeta` helper).

Verify with `./cppatlas submit` or `./cppatlas test 7`.

## Design & C++23 mechanics

Why does a naive fixed-depth alpha-beta search blunder pieces right at the horizon?

- Suppose at `depth = 1` White's queen captures a pawn defended by a pawn (`Qxp`). At depth `0`, `search` stops and calls `evaluate`, which only sees White up a pawn—completely blind to the immediate `pxQ` recapture one ply deeper! This is the **horizon effect**.
- **`quiesce(pos, alpha, beta, ply)`** cures the horizon effect by extending search at `depth <= 0` through tactical moves only (`generate_legal_captures`, i.e. captures and promotions) until the position is "quiet":
  1. First check **stand-pat**: `int stand_pat = evaluate(pos);`. Because in non-check positions you are not forced to make a bad capture, `if (stand_pat >= beta) return beta;`, and `if (stand_pat > alpha) alpha = stand_pat;`.
  2. Order captures by **MVV-LVA** (Most Valuable Victim, Least Valuable Attacker—e.g. `PxQ` before `QxP`) so alpha-beta prunes terrible captures like `QxP` immediately without exploding the quiescence tree.
  3. (Important edge case: if `pos.in_check()` inside `quiesce`, a quiet evasion might be the *only* legal move, and you cannot stand pat while in check! Either generate all legal evasions when `in_check()` or check for mate/stalemate.)
- **Distance-to-mate scoring (`MATE_SCORE - ply`)**:
  - When a node has **zero legal moves**, return `-(MATE_SCORE - ply)` if `pos.in_check()`, or `0` if stalemate.
  - Subtracting `ply` from `MATE_SCORE` ensures a mate in 1 (`ply = 1`, score `28999`) beats a mate in 2 (`ply = 3`, score `28997`), so the engine always plays the fastest mate instead of delaying forever!
- Notice `Searcher::search` starts at `alpha = -INF_SCORE`, `beta = INF_SCORE` (never `-INT_MIN`! Negating `INT_MIN` is signed integer overflow UB in C++, which UBSan catches immediately).

## What the tests check

- **Mate-in-1** (both White and Black to move, e.g., back-rank and queen mates): `search` at `max_depth = 2` returns the exact mating `best_move` with `score > MATE_THRESHOLD`.
- **Mate-in-2** puzzles: `search` at `max_depth = 4` finds the forced mating key move with `score > MATE_THRESHOLD`.
- **Shorter mate preference**: when both a mate-in-1 and a mate-in-2 exist, `search` picks the mate-in-1.
- **Terminal positions**: in a checkmated position, `best_move.is_null()` and `score < -MATE_THRESHOLD`; in a stalemated position, `best_move.is_null()` and `score == 0`.
- **Quiescence / horizon effect**: in a position where a pawn is defended (`Qxp` loses the Queen), `search` at `max_depth = 1` does **not** play the losing Queen capture, and `quiesce()` accurately detects a hanging-queen recapture.
- **Tactical combinations**: finds winning captures and 2-ply forks/combinations at `depth = 3..4`.
- **`SearchResult` invariants**: `best_move` is legal in `pos`, `nodes > 0`, `depth >= 1`, and `pos` is restored identically (`to_fen()` and `hash()` unchanged after `search`).

## Gotchas

- **Standing pat while in check.** In `quiesce`, if the side to move is in check, standing pat assumes you can decline to move—which is illegal! If you don't handle `in_check()` in `quiesce` (by searching all legal moves and returning `-(MATE_SCORE - ply)` when none exist), `quiesce` can miss a checkmate one ply past the horizon or return a bogus stand-pat score.
- **Negating `INT_MIN`.** Never pass `std::numeric_limits<int>::min()` as `-beta` in negamax (`-INT_MIN` is undefined behavior). Use `INF_SCORE = 30000`, which negates cleanly to `-30000`.
- **Return `alpha` (fail-hard) vs score (fail-soft) and updating `best_move`.** At the root (`ply == 0`), make sure `best_move` is initialized to the first legal move or updated whenever `score > best_score`, so even if every move is losing (`score <= -MATE_THRESHOLD`), `search` still returns a legal `best_move` when legal moves exist.
- **Missing move ordering.** Without MVV-LVA sorting on captures, alpha-beta at `depth = 4` visits 5×–20× more nodes and `quiesce` can blow up on tactical positions.

## Now read the real ones

- Chess Programming Wiki: [Alpha-Beta](https://www.chessprogramming.org/Alpha-Beta), [Negamax](https://www.chessprogramming.org/Negamax), [Quiescence Search](https://www.chessprogramming.org/Quiescence_Search), [MVV-LVA](https://www.chessprogramming.org/MVV-LVA)
- Stockfish: [`search.cpp`](https://github.com/official-stockfish/Stockfish/blob/master/src/search.cpp) (`search` and `qsearch`)
- cppreference: [`std::sort`](https://en.cppreference.com/w/cpp/algorithm/sort), [`std::vector`](https://en.cppreference.com/w/cpp/container/vector), [`std::function`](https://en.cppreference.com/w/cpp/utility/functional/function).
