# Reference solution (private)

`solution/include/chess/*.hpp` is the canonical answer to all 9 stages: the
learner's starter headers, completed. CI builds `chess_engine`, `magic_gen`,
`chess_bench`, and all stage tests against it with `-DCPPATLAS_SOLUTION=ON` to
prove every stage passes under Debug, ASan+UBSan, and Release across GCC and
Clang. It is not shipped in the learner template.

## Architecture & design notes

- **Representation (`types.hpp`, `position.hpp`)**:
  - Dual synchronized state: a 64-square `Piece` mailbox (`std::array<Piece, 64>`)
    for `O(1)` `piece_at(sq)` lookups alongside bitboards (`color_bb_[2]`,
    `type_bb_[6]`) for fast set-wise move generation and attack detection.
  - Strict FEN parser (`Position::from_fen`) returning `std::expected<Position, std::string>`:
    validates rank count (8), per-rank file sum (8), piece characters, single
    White and Black kings, side to move (`w`/`b`), non-duplicate castling rights,
    en passant target square & rank consistency, and non-negative numeric clocks
    (`fullmove_number >= 1`), supporting 6-field and 4-field FENs.
  - `make_move` / `unmake_move` handle all move kinds (quiet, double pawn push,
    captures, en passant, kingside/queenside castling, all 4 quiet and
    capture promotions) and revoke castling rights via a 64-entry
    `CASTLING_MASK` table covering king moves, rook moves, and rook captures on
    home squares.
  - Inline 512-entry fixed repetition history buffer with overflow vector (`history_buf_`)
    so normal games and search/perft never heap-allocate on `make_move`.

- **Bitboards & directional attacks (`bitboard.hpp`)**:
  - `enum class Direction : std::int8_t` with `template <Direction D> constexpr Bitboard shift(Bitboard)`
    implemented via `if constexpr` and `FILE_A`/`FILE_H` wrap-around masks —
    zero runtime branches.
  - `consteval` leaper attack tables (`make_pawn_attack_table`,
    `make_knight_attack_table`, `make_king_attack_table`) built at compile time
    using `shift<Dir>()`.
  - `format_bitboard(Bitboard)` renders an 8-rank ASCII grid (ranks `8..1` with
    `'X'` for set squares, `'.'` for clear squares, and file labels `a..h`).
  - Unary-fold naive ray baseline (`generate_ray_attacks<D>`,
    `generate_sliding_attacks<Dirs...>`, `rook_attacks_slow`,
    `bishop_attacks_slow`, `queen_attacks_slow`) that unconditionally includes
    the first blocker square and stops.
  - `rook_attacks`, `bishop_attacks`, and `queen_attacks` delegate cleanly to
    the magic lookup path in `magic.hpp` without circular header issues.

- **Fancy Magic Bitboards & PEXT (`magic.hpp`, `tools/magic_gen.cpp`)**:
  - Edge-excluded relevancy masks (`rook_relevancy_mask`: 10/11/12 bits ->
    `102,400` total entries; `bishop_relevancy_mask`: 5..9 bits -> `5,248` total
    entries) and Carry-Rippler subset iteration (`for_each_subset`).
  - `MagicEntry` (`mask`, `magic`, `offset`, `shift`, `index(occ)`) indexing
    compact flat tables (`rook_table[102400]`, `bishop_table[5248]`) in a
    thread-safe Meyers singleton (`sliding_tables()`).
  - `has_hardware_pext()` and `pext_index(occ, mask)` using `_pext_u64` under
    `__BMI2__` (`<immintrin.h>`) with a portable LSB-to-MSB bit-packing fallback.
  - `verify_magic` exhaustively checks every subset of the relevancy mask
    against `*_attacks_slow`, rejecting `magic == 0` / invalid squares and
    allowing constructive collisions (distinct occupancies mapping to the same
    slot when they share the exact same attack bitboard).
  - `find_magic_number` uses a deterministic SplitMix64 PRNG to sample sparse
    candidates (`next() & next() & next()`) with a fast top-byte popcount
    filter (`>= 6` bits) and epoch-stamped table verification.
  - `tools/magic_gen.cpp` (`magic_gen`) discovers and verifies all 128 magics
    (64 rook + 64 bishop), emitting a C++23 header (`magic.generated.hpp`) to
    `stdout` and timing + constructive-collision stats to `stderr` (`--check`
    for CI).

- **Zobrist hashing (`position.hpp`)**:
  - `constexpr` SplitMix64-seeded Zobrist tables (`piece_keys[12][64]`,
    `castling_keys[16]`, `ep_file_keys[8]`, `side_key`).
  - Incremental updates in `make_move` maintain `hash() == compute_hash()` at
    every ply; `unmake_move` restores `undo.prev_hash` in `O(1)`.

- **Move generation & Perft (`movegen.hpp`)**:
  - Templated pseudo-legal generator (`generate_pseudo_legal_impl<CapturesOnly>`)
    shared by `generate_pseudo_legal_moves`, `generate_legal_moves`, and
    `generate_legal_captures` (captures + promotions).
  - Legal filtering verifies castling path safety (`e/f/g` or `e/d/c` unattacked)
    and post-move king safety (automatically catching pins, double checks, and
    horizontal en-passant discovered checks).

- **Evaluation (`eval.hpp`)**:
  - Tapered midgame/endgame evaluation (`phase` weights `N=1, B=1, R=2, Q=4`,
    `MAX_PHASE=24`) relative to `side_to_move()`.
  - Material (`P=100, N=320, B=330, R=500, Q=900`), vertically mirrored
    piece-square tables (`sq ^ 56` for White, `sq` for Black) with separate
    king midgame/endgame tables, bishop pair bonus (`+30`), and passed-pawn
    bonuses. Zero asymmetric terms so color-flipped positions negate exactly.

- **Transposition table (`tt.hpp`)**:
  - Power-of-two `std::vector<TTEntry>` sized by `resize_mb` (`mb == 0` -> 1 entry).
  - Mate scores normalized relative to root (`score > MATE_THRESHOLD ? score + ply : ...`)
    on `store` and converted back in `Searcher` on `probe`.

- **Search & UCI (`search.hpp`, `uci.hpp`)**:
  - Negamax alpha-beta with quiescence search (`quiesce`, including full evasions
    when in check), checkmate scoring `-(MATE_SCORE - ply)`, and draw detection
    (2-fold in search, 50-move rule, insufficient material).
  - Move ordering: TT move, MVV-LVA captures/promotions, 2 killer slots per ply,
    and history heuristic, selected incrementally via `pick_best_move`.
  - Iterative deepening (`1..max_depth`) with triangular PV tracking, `on_info`
    callbacks, `max_nodes` / `movetime_ms` / `request_stop()` support (always
    completing depth 1), and `use_tt_` toggle.
  - `UciEngine` handles `uci`, `isready`, `ucinewgame`, `setoption name Hash value N`,
    `position`, `go`, `stop`, and `quit`.

## Verification & benchmarks

Measured in Release (`-O3`, Apple M-series, `g++-16` 16.2.0 / `clang++` 21.1.2):

### Sliding attack microbenchmark (`chess_bench`)

| Piece | Naive (`g++` / `clang++`) | HashMap (`g++` / `clang++`) | Magic (`g++` / `clang++`) | Speedup vs Naive |
| --- | --- | --- | --- | --- |
| Rook | 11.67 ns / 10.96 ns | 6.37 ns / 5.59 ns | 1.62 ns / 1.61 ns | 7.2x / 6.8x |
| Bishop | 10.94 ns / 10.40 ns | 4.08 ns / 3.70 ns | 1.35 ns / 1.34 ns | 8.1x / 7.7x |
| Queen | 21.50 ns / 16.61 ns | 10.68 ns / 10.10 ns | 2.96 ns / 3.19 ns | 7.3x / 5.2x |

Perft throughput (`chess_bench`, illustrating Amdahl's Law across full movegen + `make_move`/`unmake_move`):
- Startpos depth 4 (`197,281` nodes): `3.92 ms` (`50.26 Mnodes/s`) on `g++-16`, `5.00 ms` (`39.47 Mnodes/s`) on `clang++`
- Kiwipete depth 3 (`97,862` nodes): `1.88 ms` (`52.08 Mnodes/s`) on `g++-16`, `3.01 ms` (`32.56 Mnodes/s`) on `clang++`

Magic generator (`magic_gen --check`):
- 128 sparse magics discovered & verified in `137.16 ms` (`g++-16`) / `116.34 ms` (`clang++`)
- Rook: `102,400` entries, `0` constructive collisions, avg `8.03` bits/magic
- Bishop: `5,248` entries, `0` constructive collisions, avg `10.02` bits/magic

### Perft & search checks (`fuzz.cpp`)

| Position | Depth | Nodes | Time (`clang++` / `g++-16`) |
| --- | --- | --- | --- |
| Startpos | 5 | 4,865,609 | 123 ms / 116 ms |
| Kiwipete | 4 | 4,085,603 | 99 ms / 100 ms |
| Pos 3 | 4 | 43,238 | 1 ms / 1 ms |
| Pos 4 | 3 | 9,467 | 0 ms / 0 ms |
| Pos 5 | 3 | 62,379 | 1 ms / 1 ms |
| Pos 6 | 3 | 89,890 | 2 ms / 2 ms |

Search checks (`fuzz.cpp`):
- Mate-in-1 (`h5f7`): `score = 28999`, `657` nodes
- Mate-in-2 (`d5g8`): `score = 28997`, `6,630` nodes
- Mate-in-3 (`a1g1`): `score = 28995`, `25,078` nodes
- TT node reduction at depth 4: `11,971` nodes (no TT) -> `9,148` nodes (with TT)

## Extra tests

`solution/tests/fuzz.cpp` verifies all 22 Perft benchmarks, FEN validation,
evaluation color symmetry, mate-in-1/2/3 puzzles, TT node reduction, UCI
transcripts, and random-game fuzzing (exact `make_move`/`unmake_move`
restoration, incremental Zobrist `hash() == compute_hash()`, bitboard/mailbox
sync, movegen invariants, and legal search moves). Build from `challenges/chess`:

```sh
g++-16 -std=c++23 -Wall -Wextra -Werror -O3 \
  -isysroot "$(xcrun --show-sdk-path)" \
  -I solution/include solution/tests/fuzz.cpp -o /tmp/chess_fuzz
/tmp/chess_fuzz 150 150 20261125   # games max_plies seed
```
