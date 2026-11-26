#pragma once

#include <chess/types.hpp>

#include <array>
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

inline constexpr Bitboard FILE_AB = FILE_A | FILE_B;
inline constexpr Bitboard FILE_GH = FILE_G | FILE_H;
inline constexpr Bitboard DARK_SQUARES = 0xAA55AA55AA55AA55ULL;

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

template <Direction D>
[[nodiscard]] constexpr Bitboard shift(Bitboard bb) noexcept {
    if constexpr (D == Direction::North) {
        return bb << 8;
    } else if constexpr (D == Direction::South) {
        return bb >> 8;
    } else if constexpr (D == Direction::East) {
        return (bb & ~FILE_H) << 1;
    } else if constexpr (D == Direction::West) {
        return (bb & ~FILE_A) >> 1;
    } else if constexpr (D == Direction::NorthEast) {
        return (bb & ~FILE_H) << 9;
    } else if constexpr (D == Direction::NorthWest) {
        return (bb & ~FILE_A) << 7;
    } else if constexpr (D == Direction::SouthEast) {
        return (bb & ~FILE_H) >> 7;
    } else if constexpr (D == Direction::SouthWest) {
        return (bb & ~FILE_A) >> 9;
    } else {
        return 0;
    }
}

[[nodiscard]] inline std::string format_bitboard(Bitboard bb) {
    std::string out;
    out.reserve(192);
    for (int r = 7; r >= 0; --r) {
        out.push_back(static_cast<char>('1' + r));
        out.push_back(' ');
        for (int f = 0; f < 8; ++f) {
            const Square sq = make_square(f, r);
            out.push_back((bb & square_bb(sq)) != 0 ? 'X' : '.');
            if (f < 7) out.push_back(' ');
        }
        out.push_back('\n');
    }
    out += "  a b c d e f g h\n";
    return out;
}

namespace detail {

consteval std::array<std::array<Bitboard, 64>, 2> make_pawn_attack_table() noexcept {
    std::array<std::array<Bitboard, 64>, 2> table{};
    for (int sq = 0; sq < 64; ++sq) {
        const Bitboard b = Bitboard{1} << sq;
        table[0][sq] = shift<Direction::NorthWest>(b) | shift<Direction::NorthEast>(b);
        table[1][sq] = shift<Direction::SouthEast>(b) | shift<Direction::SouthWest>(b);
    }
    return table;
}

consteval std::array<Bitboard, 64> make_knight_attack_table() noexcept {
    std::array<Bitboard, 64> table{};
    for (int sq = 0; sq < 64; ++sq) {
        const Bitboard b = Bitboard{1} << sq;
        Bitboard att = 0;
        att |= shift<Direction::North>(shift<Direction::NorthEast>(b));
        att |= shift<Direction::North>(shift<Direction::NorthWest>(b));
        att |= shift<Direction::East>(shift<Direction::NorthEast>(b));
        att |= shift<Direction::East>(shift<Direction::SouthEast>(b));
        att |= shift<Direction::South>(shift<Direction::SouthEast>(b));
        att |= shift<Direction::South>(shift<Direction::SouthWest>(b));
        att |= shift<Direction::West>(shift<Direction::NorthWest>(b));
        att |= shift<Direction::West>(shift<Direction::SouthWest>(b));
        table[sq] = att;
    }
    return table;
}

consteval std::array<Bitboard, 64> make_king_attack_table() noexcept {
    std::array<Bitboard, 64> table{};
    for (int sq = 0; sq < 64; ++sq) {
        const Bitboard b = Bitboard{1} << sq;
        table[sq] = shift<Direction::North>(b) | shift<Direction::South>(b) |
                    shift<Direction::East>(b) | shift<Direction::West>(b) |
                    shift<Direction::NorthEast>(b) | shift<Direction::NorthWest>(b) |
                    shift<Direction::SouthEast>(b) | shift<Direction::SouthWest>(b);
    }
    return table;
}

inline constexpr auto PAWN_ATTACKS = make_pawn_attack_table();
inline constexpr auto KNIGHT_ATTACKS = make_knight_attack_table();
inline constexpr auto KING_ATTACKS = make_king_attack_table();

}  // namespace detail

[[nodiscard]] constexpr Bitboard pawn_attacks(Color c, Square sq) noexcept {
    if (!is_valid_square(sq) || (c != Color::White && c != Color::Black)) return 0;
    return detail::PAWN_ATTACKS[static_cast<std::uint8_t>(c)][sq];
}

[[nodiscard]] constexpr Bitboard knight_attacks(Square sq) noexcept {
    if (!is_valid_square(sq)) return 0;
    return detail::KNIGHT_ATTACKS[sq];
}

[[nodiscard]] constexpr Bitboard king_attacks(Square sq) noexcept {
    if (!is_valid_square(sq)) return 0;
    return detail::KING_ATTACKS[sq];
}

template <Direction D>
[[nodiscard]] constexpr Bitboard generate_ray_attacks(Square sq, Bitboard occ) noexcept {
    if (!is_valid_square(sq)) return 0;
    Bitboard attacks = 0;
    Bitboard cur = square_bb(sq);
    while (true) {
        cur = shift<D>(cur);
        if (cur == 0) break;
        attacks |= cur;
        if ((cur & occ) != 0) break;
    }
    return attacks;
}

template <Direction... Dirs>
[[nodiscard]] constexpr Bitboard generate_sliding_attacks(Square sq, Bitboard occ) noexcept {
    return (... | generate_ray_attacks<Dirs>(sq, occ));
}

[[nodiscard]] inline Bitboard rook_attacks_slow(Square sq, Bitboard occ) noexcept {
    return generate_sliding_attacks<Direction::North, Direction::South,
                                    Direction::East, Direction::West>(sq, occ);
}

[[nodiscard]] inline Bitboard bishop_attacks_slow(Square sq, Bitboard occ) noexcept {
    return generate_sliding_attacks<Direction::NorthEast, Direction::NorthWest,
                                    Direction::SouthEast, Direction::SouthWest>(sq, occ);
}

[[nodiscard]] inline Bitboard queen_attacks_slow(Square sq, Bitboard occ) noexcept {
    return rook_attacks_slow(sq, occ) | bishop_attacks_slow(sq, occ);
}

[[nodiscard]] inline Bitboard rook_attacks_magic(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard bishop_attacks_magic(Square sq, Bitboard occ) noexcept;
[[nodiscard]] inline Bitboard queen_attacks_magic(Square sq, Bitboard occ) noexcept;

}  // namespace chess

#include <chess/magic.hpp>

namespace chess {

[[nodiscard]] inline Bitboard bishop_attacks(Square sq, Bitboard occ) noexcept {
    return bishop_attacks_magic(sq, occ);
}

[[nodiscard]] inline Bitboard rook_attacks(Square sq, Bitboard occ) noexcept {
    return rook_attacks_magic(sq, occ);
}

[[nodiscard]] inline Bitboard queen_attacks(Square sq, Bitboard occ) noexcept {
    return queen_attacks_magic(sq, occ);
}

}  // namespace chess
