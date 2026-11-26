#pragma once

#include <chess/bitboard.hpp>
#include <chess/types.hpp>

#include <cstddef>
#include <cstdint>

namespace chess {

// TODO(stage 3): implement magic bitboards (relevancy masks, Carry-Rippler,
// sparse magics, fancy tables, and PEXT).

[[nodiscard]] constexpr Bitboard rook_relevancy_mask(Square sq) noexcept {
    (void)sq;
    return 0;
}

[[nodiscard]] constexpr Bitboard bishop_relevancy_mask(Square sq) noexcept {
    (void)sq;
    return 0;
}

template <class Fn>
constexpr void for_each_subset(Bitboard mask, Fn&& fn) {
    (void)mask;
    (void)fn;
}

struct MagicEntry {
    Bitboard mask = 0;
    std::uint64_t magic = 0;
    std::uint32_t offset = 0;
    std::uint8_t shift = 64;

    [[nodiscard]] constexpr std::size_t index(Bitboard occ) const noexcept {
        (void)occ;
        return 0;
    }
};

[[nodiscard]] constexpr bool has_hardware_pext() noexcept {
#if defined(__BMI2__)
    return true;
#else
    return false;
#endif
}

[[nodiscard]] inline Bitboard pext_index(Bitboard occ, Bitboard mask) noexcept {
    (void)occ;
    (void)mask;
    return 0;
}

[[nodiscard]] inline bool verify_magic(Square sq, bool is_bishop, std::uint64_t magic,
                                       std::size_t* constructive_collisions = nullptr) {
    (void)sq;
    (void)is_bishop;
    (void)magic;
    if (constructive_collisions) *constructive_collisions = 0;
    return false;
}

[[nodiscard]] inline std::uint64_t find_magic_number(Square sq, bool is_bishop,
                                                     std::uint64_t seed = 0x9E3779B97F4A7C15ULL) {
    (void)sq;
    (void)is_bishop;
    (void)seed;
    return 0;
}

[[nodiscard]] inline const MagicEntry& rook_magic_entry(Square sq) noexcept {
    (void)sq;
    static const MagicEntry empty{};
    return empty;
}

[[nodiscard]] inline const MagicEntry& bishop_magic_entry(Square sq) noexcept {
    (void)sq;
    static const MagicEntry empty{};
    return empty;
}

[[nodiscard]] inline Bitboard rook_attacks_magic(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

[[nodiscard]] inline Bitboard bishop_attacks_magic(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

[[nodiscard]] inline Bitboard queen_attacks_magic(Square sq, Bitboard occ) noexcept {
    (void)sq;
    (void)occ;
    return 0;
}

}  // namespace chess
