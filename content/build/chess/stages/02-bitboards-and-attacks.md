## Your task

Implement directional shifts, ASCII bitboard formatting, `consteval` leaper attack tables, and naive sliding attacks in `include/chess/bitboard.hpp`, plus the two attack-query methods on `chess::Position` in `include/chess/position.hpp`.

In `include/chess/bitboard.hpp` (`square_bb`, `popcount`, `lsb`, `pop_lsb`, `more_than_one`, `FILE_A..FILE_H`, `RANK_1..RANK_8`, and `enum class Direction` are already provided):

```cpp
namespace chess {

enum class Direction : std::int8_t {
    North = 8, South = -8, East = 1, West = -1,
    NorthEast = 9, NorthWest = 7, SouthEast = -7, SouthWest = -9
};

template <Direction D>
[[nodiscard]] constexpr Bitboard shift(Bitboard bb) noexcept;

[[nodiscard]] inline std::string format_bitboard(Bitboard bb);

[[nodiscard]] inline Bitboard pawn_attacks(Color c, Square sq) noexcept;
[[nodiscard]] inline Bitboard knight_attacks(Square sq) noexcept;
[[nodiscard]] inline Bitboard king_attacks(Square sq) noexcept;

[[nodiscard]] inline Bitboard rook_attacks_slow(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard bishop_attacks_slow(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard queen_attacks_slow(Square sq, Bitboard occ) noexcept;

[[nodiscard]] inline Bitboard bishop_attacks(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard rook_attacks(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard queen_attacks(Square sq, Bitboard occ) noexcept;

} // namespace chess
```

In `include/chess/position.hpp`:

```cpp
bool is_square_attacked(Square sq, Color by) const noexcept;
bool in_check() const noexcept;
```

In Stage 2, `rook_attacks`, `bishop_attacks`, and `queen_attacks` delegate directly to `rook_attacks_slow`, `bishop_attacks_slow`, and `queen_attacks_slow` (keeping the `*_slow` baselines intact for Stage 3's magic-bitboard upgrade and `./cppatlas bench`). Test locally with `./cppatlas test 2` or submit with `./cppatlas submit`.

## Design & C++23 mechanics

A 64-bit `uint64_t` maps one bit per square (`bit 0 = A1`, `bit 7 = H1`, `bit 8 = A2`, ..., `bit 63 = H8`). With `<bit>` from C++20/23:

- `std::popcount(bb)` compiles to a single `POPCNT` instruction on x86-64 or `CNT` on ARM64.
- `std::countr_zero(bb)` compiles to `TZCNT`/`BSF` (`RBIT` + `CLZ` on ARM64) and gives the lowest set square index in one cycle.
- `bb &= (bb - 1)` clears that lowest set bit (Brian Kernighan's trick) inside `pop_lsb(bb)`.

### `Direction`, `shift<D>()` with `if constexpr`, and `[[nodiscard]]`

On a flat 64-bit integer, shifting `H1` (bit 7) left by `+1` produces bit `8` (`A2`), wrapping across the right edge of the board onto the next rank. Instead of writing 8 separate shift functions or runtime `switch` branches, parameterize a single `shift<Direction D>(Bitboard bb)` template with **`if constexpr`**:

- For eastward shifts (`East`, `NorthEast`, `SouthEast`), mask out `FILE_H` before shifting (`bb & ~FILE_H`, or mask `~FILE_A` after) so bits on the H-file vanish instead of wrapping to the A-file.
- For westward shifts (`West`, `NorthWest`, `SouthWest`), mask out `FILE_A` before shifting (`bb & ~FILE_A`) so bits on the A-file vanish instead of wrapping to the H-file.
- For pure vertical shifts (`North` = `<< 8`, `South` = `>> 8`), unsigned 64-bit shifts discard bits past Rank 8 or below Rank 1 automatically—zero wrap-around.
- Marking pure functions **`[[nodiscard]]`** ensures the compiler warns immediately if you accidentally write `shift<Direction::North>(bb);` instead of assigning the returned bitboard.

### `consteval` leaper tables and `format_bitboard()`

- **`consteval` leaper tables.** Because `pawn_attacks`, `knight_attacks`, and `king_attacks` depend only on `(Color, sq)` or `sq`, compute their `std::array<Bitboard, 64>` lookup tables using **`consteval`** helper functions (built out of `shift<D>()` and knight jump masks `~FILE_A`, `~(FILE_A | FILE_B)`, `~FILE_H`, `~(FILE_G | FILE_H)`). Unlike `constexpr`, `consteval` *guarantees* zero runtime initialization cost—the tables land directly in `.rodata`.
- **`format_bitboard(Bitboard bb)`.** Print an 8×8 ASCII grid from **Rank 8 down to Rank 1**, files `a` to `h` (e.g., `'1'`/`'X'` for set bits and `'.'` for empty squares, with rank/file labels). Whenever a test fails, printing `format_bitboard` shows wrap-around bugs and inverted ranks in one glance.

### Unary fold expressions for naive sliding rays

Notice you can write one small ray-walker template `generate_ray_attacks<Direction D>(Square sq, Bitboard occ)` that starts from `square_bb(sq)`, repeatedly steps `cur = shift<D>(cur)`, sets `attacks |= cur`, and stops **after** hitting the first blocker (`if (cur & occ) break;`). Always include that first blocker square—whether friendly or enemy—and mask out friendly pieces later during move generation (Stage 5), because a blocker square is still *attacked* (either a legal capture or a defended piece).

Then a C++17/23 **unary fold expression** over `Direction... Dirs` builds any sliding piece cleanly with zero direction-table boilerplate:

```cpp
template <Direction... Dirs>
constexpr Bitboard sliding_attacks_slow(Square sq, Bitboard occ) noexcept {
    if (!is_valid_square(sq)) return 0;
    return (Bitboard{0} | ... | generate_ray_attacks<Dirs>(sq, occ));
}
```

- `rook_attacks_slow` calls `sliding_attacks_slow<Direction::North, Direction::South, Direction::East, Direction::West>(sq, occ)`.
- `bishop_attacks_slow` calls `sliding_attacks_slow<Direction::NorthEast, Direction::NorthWest, Direction::SouthEast, Direction::SouthWest>(sq, occ)`.
- `queen_attacks_slow` is simply `rook_attacks_slow(sq, occ) | bishop_attacks_slow(sq, occ)`.

These clean ~20 ns loops are your exact correctness baseline before Stage 3 replaces `rook_attacks` and `bishop_attacks` with <1 ns magic bitboards.

### Attack symmetry in `Position::is_square_attacked`

- Instead of scanning every enemy piece, exploit **attack symmetry** from the target square `sq`:
  - `sq` is attacked by a `by`-colored pawn iff `pawn_attacks(~by, sq) & pieces(by, PieceType::Pawn)` is non-zero. (A White pawn on `d4` attacks `e5`, so `e5` is attacked by White iff a *Black* pawn attack from `e5` hits `d4`.)
  - Similarly for knights, kings, bishops/queens (`bishop_attacks(sq, pieces()) & (bishops | queens)`), and rooks/queens (`rook_attacks(sq, pieces()) & (rooks | queens)`).
- `in_check()` is then `is_square_attacked(king_square(side_to_move()), ~side_to_move())`.

You can visualize any square's attack bitboard, occupancy mask, `0x...` hex value, and live **64-bit Register Strip** (all 8 rank bytes synchronized with board hover) on the **Bitboards & Attacks** tab of `/build/chess`.

## What the tests check

- Bitboard primitives (`square_bb`, `popcount`, `lsb`, `pop_lsb`, `more_than_one`, file and rank masks).
- `shift<Direction>` and `format_bitboard` (directional shifts without wrap-around across all 8 directions).
- `pawn_attacks` for both White and Black on center squares (2 targets), `A`-file and `H`-file edges (1 target, zero wrap-around), and promotion ranks (`rank 8` for White, `rank 1` for Black returning `0`).
- `knight_attacks`: 8 targets in the center, 2 in corners (`A1`, `H8`), 3 on edge squares (`B1`, `A2`), no `A↔H` or `B↔G` wrap-around, and symmetry across all 64 squares (`sq2` in `knight_attacks(sq1)` iff `sq1` in `knight_attacks(sq2)`).
- `king_attacks`: 8 targets in the center, 3 in corners, 5 on edges, and symmetry across all 64 squares.
- `rook_attacks`, `bishop_attacks`, and `queen_attacks` (plus `*_slow`): full rays on empty boards, stopping on the first blocker (including the blocker bit itself), multi-blocker intersections on all 4 directions, corners, edges, and `queen_attacks(sq, occ) == (rook_attacks(sq, occ) | bishop_attacks(sq, occ))`.
- `Position::is_square_attacked` and `in_check` across pawn, knight, king, and blocked vs unblocked sliding checks.

## Gotchas

- **Inverted pawn attack lookup in `is_square_attacked`.** Asking whether White attacks `e5` requires calling `pawn_attacks(Color::Black, E5)`, not `pawn_attacks(Color::White, E5)`. Passing the attacker's color instead of `~by` flips pawn capture direction backwards.
- **Guard invalid squares.** All attack functions are `noexcept`; if `sq >= 64` (e.g. `SQ_NONE`), return `0` instead of shifting `Bitboard{1} << sq` (shifting a 64-bit integer by `>= 64` is undefined behavior in C++ and UBSan catches it immediately).
- **Include the blocker bit.** In `generate_ray_attacks`, set `attacks |= cur` *before* checking `if (cur & occ) break;`. Stopping before setting the blocker makes captures invisible in Stage 5.
- **Masking the wrong file on `East` vs `West`.** Masking `~FILE_A` *before* shifting `East` drops `A`-file squares and still lets `H`-file squares wrap! Remember: mask `~FILE_H` *before* eastward shifts (`+1`, `+9`, `-7`), or mask `~FILE_A` *after* shifting.
- **Bitwise `pop_lsb` on empty bitboard.** `std::countr_zero(0ULL)` returns 64, and `0 - 1` underflows—`bitboard.hpp` already guards `bb == 0`, so reuse `pop_lsb` rather than open-coding `std::countr_zero` without a zero check.

## Now read the real ones

- Chess Programming Wiki: [Bitboards](https://www.chessprogramming.org/Bitboards), [Pawn Attacks (Bitboards)](https://www.chessprogramming.org/Pawn_Attacks_(Bitboards)), [Sliding Piece Attacks](https://www.chessprogramming.org/Sliding_Piece_Attacks)
- Stockfish: [`bitboard.h`](https://github.com/official-stockfish/Stockfish/blob/master/src/bitboard.h) and [`bitboard.cpp`](https://github.com/official-stockfish/Stockfish/blob/master/src/bitboard.cpp)
- cppreference: [`<bit>`](https://en.cppreference.com/w/cpp/header/bit), [`if constexpr`](https://en.cppreference.com/w/cpp/language/if), [`consteval`](https://en.cppreference.com/w/cpp/language/consteval), [Fold expressions](https://en.cppreference.com/w/cpp/language/fold).
