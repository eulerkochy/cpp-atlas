## Your task

Edit `include/chess/position.hpp` to implement `make_move`, `unmake_move`, `hash`, `compute_hash`, and Zobrist key initialization/updates (keeping a hash history vector inside `Position` will also power repetition detection in Stage 9).

The Stage 4 API in `include/chess/position.hpp` (using `Move`, `MoveFlag`, `Castling`, and `UndoState` from `include/chess/types.hpp`):

```cpp
void make_move(Move m, UndoState& undo);
void unmake_move(Move m, const UndoState& undo);

std::uint64_t hash() const noexcept;
std::uint64_t compute_hash() const noexcept;
```

Where `UndoState` is already defined in `include/chess/types.hpp`:

```cpp
struct UndoState {
    Piece captured = Piece::None;
    std::uint8_t castling_rights = NO_CASTLING;
    Square en_passant = SQ_NONE;
    std::uint16_t halfmove_clock = 0;
    std::uint64_t prev_hash = 0;
};
```

Verify with `./cppatlas submit` (or `./cppatlas test 4` and `./cppatlas test --preset asan-ubsan` locally).

## Design & C++23 mechanics

Search explores hundreds of thousands of nodes per second. Copying a full `Position` (~150+ bytes plus history) at every ply is unnecessary when every move changes only 1–4 squares plus a few bytes of state:

- **`make_move(m, undo)`** snapshots the irreversible fields into `undo`: `captured`, `castling_rights`, `en_passant`, `halfmove_clock`, and `prev_hash`. Then it updates the board, side to move, clocks, castling mask, en-passant square, and Zobrist key in place, and pushes the previous hash onto a history vector (or restores it on `unmake_move`).
- **`unmake_move(m, undo)`** reverses the piece movements in exact mirror order and restores `castling_rights_`, `en_passant_`, `halfmove_clock_`, and `hash_` from `undo` in O(1) without recomputing anything.

For **Zobrist hashing**:

- Precompute deterministic 64-bit random keys (e.g., seeded via a `constexpr` SplitMix64 generator, never `std::rand()`) for:
  - each `(Piece, Square)` pair (`12 * 64`)
  - each 4-bit `castling_rights` value (`16`)
  - each en-passant file (`8`)
  - side-to-move (`Black` vs `White`)
- Because XOR is its own inverse (`a ^ k ^ k == a`), moving a piece from `from` to `to` updates the hash with `hash_ ^= piece_key(p, from) ^ piece_key(p, to)`—the exact same cost as two table lookups.
- Keep one invariant ironclad: `compute_hash()` (recomputing from scratch from the board state) and incremental `hash_` after `make_move` / `unmake_move` must be bit-for-bit identical after every move.

## What the tests check

- Every move type updates the board/FEN cleanly and restores the exact prior position (`to_fen()`, `hash()`, bitboards, clocks, castling rights, en passant) after `unmake_move`:
  - Quiet moves and double pawn pushes (sets `en_passant_square`, resets `halfmove_clock`, flips `side_to_move`, increments `fullmove_number` after Black's move).
  - Normal captures (removes enemy piece, resets `halfmove_clock`, restores captured piece on unmake).
  - En passant captures for both White and Black (removes the captured pawn on `to - 8` for White or `to + 8` for Black, *not* on `to`).
  - Kingside and queenside castling for White and Black (moves both king and rook, clears the side's castling rights, restores both on unmake).
  - Castling rights revocation when a king moves, when a rook moves from its home square, or when an enemy piece captures a rook on its home square (e.g., `Bxa1` revokes `WHITE_OOO`, `Bxh8` revokes `BLACK_OO`).
  - All 4 promotions (`N`, `B`, `R`, `Q`), both quiet and capture-promotion, for White and Black.
- Nested multi-ply sequences (6+ plies deep) return to the starting state bit-for-bit.
- Zobrist invariants: `hash() == compute_hash()` at all times, transpositions (`1. Nf3 Nf6 2. Nc3 Nc6` vs `1. Nc3 Nc6 2. Nf3 Nf6`) yield the exact same `hash()`, and differing side-to-move, castling rights, or en-passant square produce distinct hashes.

## Gotchas

- **En passant capture square vs captured pawn square.** In an `EnPassant` move, `m.to()` is the empty target square (`rank 6` for White, `rank 3` for Black), while the captured pawn sits one rank behind it (`m.to() - 8` for White, `m.to() + 8` for Black). `piece_at(m.to())` is `Piece::None`, so remember to read and remove the enemy pawn from the pawn square, not `m.to()`.
- **Capturing a rook on its corner square.** If White's rook on `a1` is captured before moving, `WHITE_OOO` must be cleared immediately—otherwise a later move could still try to castle queenside or keep stale castling rights in the Zobrist key. A 64-entry `CASTLING_MASK[64]` table where `castling_rights_ &= CASTLING_MASK[from] & CASTLING_MASK[to]` handles king moves, rook moves, *and* rook captures uniformly in one line.
- **Consistent en-passant Zobrist rule.** `compute_hash()` and incremental `make_move` must agree on when the en-passant key is XORed in (e.g., whenever `en_passant_square() != SQ_NONE`, hash `ep_key(file_of(ep))`). Hashing it in one place and skipping it in the other breaks `hash() == compute_hash()`.
- **Unmaking promotions.** On `unmake_move` of a promotion, you remove the promoted piece from `m.to()` and put back a **pawn** of `~side_to_move()` on `m.from()`—not the promoted piece!

## Now read the real ones

- Chess Programming Wiki: [Making Moves](https://www.chessprogramming.org/Making_Moves), [Incremental Updates](https://www.chessprogramming.org/Incremental_Updates), [Zobrist Hashing](https://www.chessprogramming.org/Zobrist_Hashing)
- Stockfish: [`Position::do_move` and `Position::undo_move`](https://github.com/official-stockfish/Stockfish/blob/master/src/position.cpp) use a `StateInfo` linked stack (`StateInfo* st`) instead of copying `Position`.
- cppreference: [`std::mt19937_64`](https://en.cppreference.com/w/cpp/numeric/random/mersenne_twister_engine), [`std::vector`](https://en.cppreference.com/w/cpp/container/vector), [`std::uint64_t`](https://en.cppreference.com/w/cpp/types/integer).
