## Your task

Implement legal move generation, UCI move parsing, and `perft` in `include/chess/movegen.hpp`. (`MoveList` is already implemented for you in `movegen.hpp`.)

```cpp
namespace chess {

void generate_pseudo_legal_moves(const Position& pos, MoveList& out);
void generate_legal_moves(Position& pos, MoveList& out);
void generate_legal_captures(Position& pos, MoveList& out);
std::optional<Move> parse_uci_move(Position& pos, std::string_view uci);
std::uint64_t perft(Position& pos, int depth);

} // namespace chess
```

Test with `./cppatlas test 5` (try `--preset release` to time deep Perft nodes!) or submit with `./cppatlas submit`.

## Design & C++23 mechanics

Why split move generation into `generate_pseudo_legal_moves` and `generate_legal_moves`?

- **Pseudo-legal moves** obey piece movement rules and captures without checking whether the side to move's own king is left in check (except castling, where you should check empty squares—and either in `generate_pseudo_legal_moves` or `generate_legal_moves` verify the king is not in check, does not cross an attacked square, and does not land on an attacked square).
- **`generate_legal_moves`** takes a mutable `Position& pos` so it can filter pseudo-legal moves with `make_move` / `unmake_move`: make the move, test whether the *mover's* king (`~pos.side_to_move()`) is attacked via `pos.is_square_attacked(pos.king_square(us), them)`, then unmake. If legal, append to `out`.
- Why is `make_move` + `is_square_attacked` + `unmake_move` worth getting right first? Because chess legality has subtle interactions—especially the **horizontal en-passant pin** (`8/8/8/K2pP2r/8/8/8/7k w - d6 0 1`)! In that position, neither pawn alone is pinned to the king, yet capturing `e5xd6` removes *both* pawns from the 5th rank and exposes the White king on `a5` to the Black rook on `h5`. Testing legality after `make_move` handles every pin, double check, and discovered check automatically with zero special-case bugs.
- **`MoveList`** stores a fixed `std::array<Move, 256>` on the stack—no heap allocation per recursive call (the maximum legal moves in any reachable chess position is 218).
- **Perft** (`perft(pos, depth)`) counts leaf nodes at `depth` (`depth == 0` returns `1`; at `depth == 1`, returning `legal_moves.size()` as a bulk count is a classic speedup once `generate_legal_moves` is exact).

Use the **Perft & Search** tab on the `/build/chess` workbench to compare your `divide` counts move-by-move on `Startpos`, `Kiwipete`, and `En Passant Pin`.

## What the tests check

- `generate_legal_moves` on startpos produces 20 distinct legal moves; `parse_uci_move` parses valid moves (`e2e4`, `g1f3`, promotions like `e7e8q`, castling `e1g1`) and returns `std::nullopt` for illegal or malformed strings (`e2e5`, `e1e2`, `zzzz`).
- Legality edge cases:
  - Absolute pins (pinned pieces can only move along the pin ray or capture the pinner).
  - Double check (only king moves are legal).
  - **Horizontal en-passant pin** (`8/8/8/K2pP2r/8/8/8/7k w - d6 0 1` excludes `e5d6`).
  - Castling forbidden when blocked, when currently in check, when passing through an attacked square, when landing on an attacked square, or without the castling right.
  - All 4 promotion flags generated on rank 8 / rank 1 pushes and captures.
- `generate_legal_captures` returns only captures and promotions, matching the capture/promotion subset of `generate_legal_moves`.
- Exact Perft ground truth:
  - Startpos: `d1=20`, `d2=400`, `d3=8902`, `d4=197281`
  - Kiwipete (`r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1`): `d1=48`, `d2=2039`, `d3=97862`
  - Position 3 (`8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1`): `d1=14`, `d2=191`, `d3=2812`, `d4=43238`
  - Position 4 (`r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1`): `d1=6`, `d2=264`, `d3=9467`
  - Position 5 (`rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8`): `d1=44`, `d2=1486`, `d3=62379`
  - Position 6 (`r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10`): `d1=46`, `d2=2079`, `d3=89890`
- `perft(pos, depth)` leaves `pos` unchanged (`to_fen()` and `hash()` identical afterward).

## Gotchas

- **Checking the wrong king after `make_move`.** Once `make_move` completes, `pos.side_to_move()` has flipped to the opponent! Verify `!pos.is_square_attacked(pos.king_square(us), pos.side_to_move())` where `us` was the side *before* `make_move`.
- **Queenside castling check squares vs empty squares.** For `WHITE_OOO` (`e1c1`), three squares (`d1`, `c1`, `b1`) must be empty, while only `e1`, `d1`, and `c1` must not be attacked. Checking `b1` for attacks illegally blocks valid queenside castling when `b1` is attacked by a rook or bishop!
- **Pawn promotion double-generation.** Pawns reaching rank 8 (or rank 1) must emit *only* the 4 promotion moves (`PromoKnight`..`PromoQueen` or `PromoCaptureKnight`..`PromoCaptureQueen`), never a non-promotion `Quiet` or `Capture` move onto the back rank.
- **Forgot `out.clear()` at start of `generate_*`.** Always call `out.clear()` on entry so callers reusing a `MoveList` across iterations don't accumulate stale moves from the previous call.

## Now read the real ones

- Chess Programming Wiki: [Move Generation](https://www.chessprogramming.org/Move_Generation), [Perft](https://www.chessprogramming.org/Perft), [Perft Results](https://www.chessprogramming.org/Perft_Results)
- Stockfish: [`movegen.cpp`](https://github.com/official-stockfish/Stockfish/blob/master/src/movegen.cpp) separates `CAPTURES`, `QUIETS`, `EVASIONS`, and `LEGAL` generation using pin-ray bitmasks.
- cppreference: [`std::array`](https://en.cppreference.com/w/cpp/container/array), [`std::optional`](https://en.cppreference.com/w/cpp/utility/optional), [`std::ranges::find_if`](https://en.cppreference.com/w/cpp/algorithm/ranges/find).
