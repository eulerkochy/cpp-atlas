#pragma once

#include <chess/types.hpp>

#include <bit>
#include <cstdint>
#include <string>

namespace chess {

using Bitboard = std::uint64_t;

inline constexpr Bitboard FILE_A = 0x0101010101010101ULL;
inline constexpr Bitboard FILE_B = FILE_A << 1;
inline constexpr Bitboard FILE_C = FILE_A << 2;
inline constexpr Bitboard FILE_D = FILE_A << 3;
inline constexpr Bitboard FILE_E = FILE_A << 4;
inline constexpr Bitboard FILE_F = FILE_A << 5;
inline constexpr Bitboard FILE_G = FILE_A << 6;
inline constexpr Bitboard FILE_H = FILE_A << 7;

inline constexpr Bitboard RANK_1 = 0x00000000000000FFULL;
inline constexpr Bitboard RANK_2 = RANK_1 << 8;
inline constexpr Bitboard RANK_3 = RANK_1 << 16;
inline constexpr Bitboard RANK_4 = RANK_1 << 24;
inline constexpr Bitboard RANK_5 = RANK_1 << 32;
inline constexpr Bitboard RANK_6 = RANK_1 << 40;
inline constexpr Bitboard RANK_7 = RANK_1 << 48;
inline constexpr Bitboard RANK_8 = RANK_1 << 56;

constexpr Bitboard square_bb(Square sq) noexcept {
    return is_valid_square(sq) ? (Bitboard{1} << sq) : 0;
}

constexpr int popcount(Bitboard bb) noexcept { return std::popcount(bb); }

constexpr Square lsb(Bitboard bb) noexcept {
    return bb != 0 ? static_cast<Square>(std::countr_zero(bb)) : SQ_NONE;
}

constexpr Square pop_lsb(Bitboard& bb) noexcept {
    if (bb == 0) return SQ_NONE;
    const Square sq = lsb(bb);
    bb &= (bb - 1);
    return sq;
}

constexpr bool more_than_one(Bitboard bb) noexcept { return (bb & (bb - 1)) != 0; }

enum class Direction : std::int8_t {
    North = 8,
    South = -8,
    East = 1,
    West = -1,
    NorthEast = 9,
    NorthWest = 7,
    SouthEast = -7,
    SouthWest = -9
};

// TODO(stage 2): implement with if constexpr and file wrap-around masks.
template <Direction D>
[[nodiscard]] constexpr Bitboard shift(Bitboard bb) noexcept {
    (void)bb;
    return 0;
}

[[nodiscard]] inline std::string format_bitboard(Bitboard bb) {
    (void)bb;
    return "";
}

// TODO(stage 2): implement attack bitboards.
[[nodiscard]] inline Bitboard pawn_attacks(Color c, Square sq) noexcept {
    (void)c;
    (void)sq;
    return 0;
}

[[nodiscard]] inline Bitboard knight_attacks(Square sq) noexcept {
    (void)sq;
    return 0;
}

[[nodiscard]] inline Bitboard king_attacks(Square sq) noexcept {
    (void)sq;
    return 0;
}

[[nodiscard]] inline Bitboard rook_attacks_slow(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

[[nodiscard]] inline Bitboard bishop_attacks_slow(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

[[nodiscard]] inline Bitboard queen_attacks_slow(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

[[nodiscard]] inline Bitboard bishop_attacks(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

[[nodiscard]] inline Bitboard rook_attacks(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

[[nodiscard]] inline Bitboard queen_attacks(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

}  // namespace chess
