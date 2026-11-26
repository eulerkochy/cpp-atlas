## Your task

Edit `include/chess/position.hpp` to implement board storage, `Position::from_fen`, `Position::startpos`, `Position::to_fen`, and the board observers. All types, enums, squares, and `Move` helpers in `include/chess/types.hpp` are already implemented for you.

These are the exact Stage 1 signatures in `chess::Position` (inside `include/chess/position.hpp`):

```cpp
namespace chess {

inline constexpr std::string_view STARTPOS_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

class Position {
public:
    Position() noexcept = default;

    static std::expected<Position, std::string> from_fen(std::string_view fen);
    static Position startpos();
    std::string to_fen() const;

    Piece piece_at(Square sq) const noexcept;
    Bitboard pieces() const noexcept;
    Bitboard pieces(Color c) const noexcept;
    Bitboard pieces(PieceType pt) const noexcept;
    Bitboard pieces(Color c, PieceType pt) const noexcept;
    Square king_square(Color c) const noexcept;

    Color side_to_move() const noexcept;
    std::uint8_t castling_rights() const noexcept;
    Square en_passant_square() const noexcept;
    std::uint16_t halfmove_clock() const noexcept;
    std::uint16_t fullmove_number() const noexcept;
};

} // namespace chess
```

Once `include/chess/position.hpp` compiles and handles FEN parsing, serialization, and queries, run `./cppatlas submit` (or `./cppatlas test 1` locally) to verify Stage 1.

## Design & C++23 mechanics

Why keep **both** a 64-square mailbox (`std::array<Piece, 64>`) and bitboards (`std::array<Bitboard, 2>` for colors, `std::array<Bitboard, 6>` for piece types) instead of just one?

- A mailbox answers `piece_at(sq)` in one array load—no looping over 12 bitboards to find out what sits on `d4` or what piece a capture just removed.
- Bitboards answer "where are all White knights?" or "which squares are occupied?" in a single register load (`color_bb_[White] & type_bb_[Knight]`, `color_bb_[White] | color_bb_[Black]`). Storing 2 color bitboards plus 6 piece-type bitboards (8 `uint64_t`s) instead of 12 per-piece bitboards avoids duplication while still giving every `pieces(...)` overload in one bitwise `&` or `|`.
- Wrap all board mutations in small private helpers (`put_piece(sq, p)` and `remove_piece(sq)`) that update the mailbox and both bitboard arrays together. Every later stage (`make_move`, `unmake_move`) will call those two helpers, so the mailbox and bitboards can never drift apart.

For `from_fen`, C++23 gives you `std::expected<Position, std::string>`:

- Unlike `std::optional`, `std::expected` returns a concrete diagnostic message via `std::unexpected(...)` when parsing fails.
- Remember the square layout in `types.hpp`: `A1 = 0`, `B1 = 1`, ..., `H1 = 7`, `A8 = 56`, `H8 = 63` (`rank * 8 + file`). FEN starts at **rank 8** (`A8`..`H8`) and walks down to **rank 1** (`A1`..`H1`), left to right within each rank.
- You can use the interactive **Chessboard Workbench** on `/build/chess` to paste FEN strings, verify square indices, and inspect occupancy bitboards visually.

## What the tests check

- `Position::from_fen(STARTPOS_FEN)` succeeds and matches `Position::startpos()`; `to_fen()` round-trips `STARTPOS_FEN` identically.
- Every square `A1`..`H8` on startpos reports the expected `Piece` (all 32 pieces and 32 `Piece::None` squares), with `king_square(White) == E1` and `king_square(Black) == E8`.
- `pieces()`, `pieces(Color)`, `pieces(PieceType)`, and `pieces(Color, PieceType)` match `piece_at(sq)` bit-for-bit across all 64 squares and have exact `popcount`s.
- Midgame and endgame FENs with partial castling (`Kq`, `k`, `-`), en passant target squares (`e3`, `d6`, `-`), Black to move, and non-zero clocks parse accurately and round-trip cleanly through `to_fen()`.
- Malformed FENs return `!res.has_value()` with a non-empty error string: empty input, wrong rank count, rank file sum `!= 8`, invalid piece character, invalid side to move, invalid castling characters, invalid en passant square, missing king, or duplicate king of the same color.

## Gotchas

- **Rank order inversion in FEN.** The first `/` segment in a FEN is rank 8 (`rank = 7`), not rank 1 (`rank = 0`). Mixing up `rank` and `7 - rank` turns the whole board upside down.
- **Default-constructed `Position` invariants.** The starter `Position() noexcept = default;` represents an empty board (`Piece::None` on all 64 squares, `0` bitboards, `Color::None` or `Color::White` side to move, `SQ_NONE` en passant). Be sure your member initializers leave `board_` filled with `Piece::None` (not zero-initialized `WhitePawn = 0`!).
- **Strict FEN validation.** Reject `KQkq` duplicates or unexpected characters, reject digits `'0'` or `'9'` in rank strings, verify each rank totals exactly 8 files, and verify both White and Black have `popcount(pieces(c, PieceType::King)) == 1`.
- **Canonical `to_fen()` order.** Castling rights in `to_fen()` must emit in `KQkq` order (or `-` if `NO_CASTLING`), and `en_passant_square()` emits `square_to_string(ep_)` (which returns `"-"` when `SQ_NONE`).

## Now read the real ones

- Chess Programming Wiki: [Forsyth-Edwards Notation](https://www.chessprogramming.org/Forsyth-Edwards_Notation) and [Bitboard Board-Definition](https://www.chessprogramming.org/Bitboard_Board-Definition)
- Stockfish: [`Position::set`](https://github.com/official-stockfish/Stockfish/blob/master/src/position.cpp) pairs a `Piece board[SQUARE_NB]` mailbox with `byTypeBB` and `byColorBB` arrays.
- cppreference: [`std::expected`](https://en.cppreference.com/w/cpp/utility/expected), [`std::string_view`](https://en.cppreference.com/w/cpp/string/basic_string_view), [`std::array`](https://en.cppreference.com/w/cpp/container/array).
