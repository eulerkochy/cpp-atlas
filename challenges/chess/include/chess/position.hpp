// chess/position.hpp - YOUR chess engine headers live under include/chess/.
//
// Get graded with `./cppatlas submit`. It sends your headers to the cppatlas
// grader (no local compiler needed), prints a [tester::#N] log for the stage
// you are on, and advances you when it passes. Each stage's spec lives at
// https://cppatlas.com/build/chess/<stage-slug>.
// Optional: `./cppatlas test` builds and runs the same tests locally, which is
// faster if you have a C++23 compiler and CMake installed.
//
// The 9 stages of "Build your own chess engine":
//   Stage 1: Board representation & FEN (Position::from_fen, startpos, to_fen)
//   Stage 2: Bitboards, directional shifts & naive sliding attacks
//   Stage 3: Magic bitboards (relevancy masks, Carry-Rippler, sparse magics, fancy tables, PEXT)
//   Stage 4: Make / unmake move & Zobrist hashing
//   Stage 5: Legal move generation & perft
//   Stage 6: Static evaluation
//   Stage 7: Alpha-beta search, quiescence & move ordering
//   Stage 8: Transposition table, iterative deepening & time/node limits
//   Stage 9: UCI protocol & draw detection
//
// Everything below COMPILES cleanly with stub sentinel values, so the tests
// fail deterministically until you implement each stage.
#pragma once

#include <chess/bitboard.hpp>
#include <chess/types.hpp>

#include <cstdint>
#include <expected>
#include <string>
#include <string_view>

namespace chess {

inline constexpr std::string_view STARTPOS_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

class Position {
public:
    Position() noexcept = default;

    static std::expected<Position, std::string> from_fen(std::string_view fen) {
        (void)fen;
        return std::unexpected(std::string("Position::from_fen is not implemented yet"));
    }

    static Position startpos() { return Position{}; }

    std::string to_fen() const { return ""; }

    Piece piece_at(Square sq) const noexcept {
        (void)sq;
        return Piece::None;
    }

    Bitboard pieces() const noexcept { return 0; }

    Bitboard pieces(Color c) const noexcept {
        (void)c;
        return 0;
    }

    Bitboard pieces(PieceType pt) const noexcept {
        (void)pt;
        return 0;
    }

    Bitboard pieces(Color c, PieceType pt) const noexcept {
        (void)c;
        (void)pt;
        return 0;
    }

    Square king_square(Color c) const noexcept {
        (void)c;
        return SQ_NONE;
    }

    Color side_to_move() const noexcept { return Color::None; }
    std::uint8_t castling_rights() const noexcept { return NO_CASTLING; }
    Square en_passant_square() const noexcept { return SQ_NONE; }
    std::uint16_t halfmove_clock() const noexcept { return 0; }
    std::uint16_t fullmove_number() const noexcept { return 0; }

    bool is_square_attacked(Square sq, Color by) const noexcept {
        (void)sq;
        (void)by;
        return false;
    }

    bool in_check() const noexcept { return false; }

    void make_move(Move m, UndoState& undo) {
        (void)m;
        (void)undo;
    }

    void unmake_move(Move m, const UndoState& undo) {
        (void)m;
        (void)undo;
    }

    std::uint64_t hash() const noexcept { return 0; }
    std::uint64_t compute_hash() const noexcept { return 0; }

    bool is_repetition(int threshold = 3) const noexcept {
        (void)threshold;
        return false;
    }

    bool is_fifty_move_draw() const noexcept { return false; }
    bool is_insufficient_material() const noexcept { return false; }
};

}  // namespace chess
