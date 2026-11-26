#pragma once

#include <chess/bitboard.hpp>
#include <chess/types.hpp>

#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>

#if defined(__BMI2__)
#include <immintrin.h>
#endif

namespace chess {

[[nodiscard]] constexpr Bitboard rook_relevancy_mask(Square sq) noexcept {
    if (!is_valid_square(sq)) return 0;
    const int r = rank_of(sq);
    const int f = file_of(sq);
    Bitboard m = 0;
    for (int rr = r + 1; rr <= 6; ++rr) m |= Bitboard{1} << (rr * 8 + f);
    for (int rr = r - 1; rr >= 1; --rr) m |= Bitboard{1} << (rr * 8 + f);
    for (int ff = f + 1; ff <= 6; ++ff) m |= Bitboard{1} << (r * 8 + ff);
    for (int ff = f - 1; ff >= 1; --ff) m |= Bitboard{1} << (r * 8 + ff);
    return m;
}

[[nodiscard]] constexpr Bitboard bishop_relevancy_mask(Square sq) noexcept {
    if (!is_valid_square(sq)) return 0;
    const int r = rank_of(sq);
    const int f = file_of(sq);
    Bitboard m = 0;
    for (int rr = r + 1, ff = f + 1; rr <= 6 && ff <= 6; ++rr, ++ff)
        m |= Bitboard{1} << (rr * 8 + ff);
    for (int rr = r + 1, ff = f - 1; rr <= 6 && ff >= 1; ++rr, --ff)
        m |= Bitboard{1} << (rr * 8 + ff);
    for (int rr = r - 1, ff = f + 1; rr >= 1 && ff <= 6; --rr, ++ff)
        m |= Bitboard{1} << (rr * 8 + ff);
    for (int rr = r - 1, ff = f - 1; rr >= 1 && ff >= 1; --rr, --ff)
        m |= Bitboard{1} << (rr * 8 + ff);
    return m;
}

template <class Fn>
constexpr void for_each_subset(Bitboard mask, Fn&& fn) {
    Bitboard sub = 0;
    do {
        fn(sub);
        sub = (sub - mask) & mask;
    } while (sub != 0);
}

struct MagicEntry {
    Bitboard mask = 0;
    std::uint64_t magic = 0;
    std::uint32_t offset = 0;
    std::uint8_t shift = 64;

    [[nodiscard]] constexpr std::size_t index(Bitboard occ) const noexcept {
        return offset + static_cast<std::size_t>(((occ & mask) * magic) >> shift);
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
#if defined(__BMI2__)
    return _pext_u64(occ, mask);
#else
    Bitboard res = 0;
    Bitboard out_bit = 1;
    while (mask != 0) {
        const Bitboard lsb_bit = mask & (~mask + 1);
        if ((occ & lsb_bit) != 0) res |= out_bit;
        mask &= mask - 1;
        out_bit <<= 1;
    }
    return res;
#endif
}

[[nodiscard]] inline bool verify_magic(Square sq, bool is_bishop, std::uint64_t magic,
                                       std::size_t* constructive_collisions = nullptr) {
    if (constructive_collisions) *constructive_collisions = 0;
    if (!is_valid_square(sq) || magic == 0) return false;

    const Bitboard mask = is_bishop ? bishop_relevancy_mask(sq) : rook_relevancy_mask(sq);
    const int bits = popcount(mask);
    const std::uint8_t shift = static_cast<std::uint8_t>(64 - bits);

    std::array<Bitboard, 4096> table{};
    std::array<bool, 4096> seen{};
    bool valid = true;
    std::size_t collisions = 0;

    for_each_subset(mask, [&](Bitboard sub) {
        if (!valid) return;
        const std::size_t idx = static_cast<std::size_t>((sub * magic) >> shift);
        const Bitboard att = is_bishop ? bishop_attacks_slow(sq, sub) : rook_attacks_slow(sq, sub);
        if (!seen[idx]) {
            seen[idx] = true;
            table[idx] = att;
        } else if (table[idx] == att) {
            ++collisions;
        } else {
            valid = false;
        }
    });

    if (valid && constructive_collisions) {
        *constructive_collisions = collisions;
    }
    return valid;
}

[[nodiscard]] inline std::uint64_t find_magic_number(Square sq, bool is_bishop,
                                                     std::uint64_t seed = 0x9E3779B97F4A7C15ULL) {
    if (!is_valid_square(sq)) return 0;

    const Bitboard mask = is_bishop ? bishop_relevancy_mask(sq) : rook_relevancy_mask(sq);
    const int bits = popcount(mask);
    const std::uint8_t shift = static_cast<std::uint8_t>(64 - bits);

    std::array<Bitboard, 4096> subs{};
    std::array<Bitboard, 4096> atts{};
    std::size_t count = 0;
    for_each_subset(mask, [&](Bitboard sub) {
        subs[count] = sub;
        atts[count] = is_bishop ? bishop_attacks_slow(sq, sub) : rook_attacks_slow(sq, sub);
        ++count;
    });

    std::uint64_t state = seed ^ (static_cast<std::uint64_t>(sq) * 0xBF58476D1CE4E5B9ULL) ^
                          (is_bishop ? 0x94D049BB133111EBULL : 0ULL);
    auto next = [&]() noexcept -> std::uint64_t {
        std::uint64_t z = (state += 0x9E3779B97F4A7C15ULL);
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
        return z ^ (z >> 31);
    };

    std::array<Bitboard, 4096> used{};
    std::array<std::uint32_t, 4096> epochs{};
    std::uint32_t cur_epoch = 0;

    while (true) {
        const std::uint64_t candidate = next() & next() & next();
        if (candidate == 0) continue;
        if (std::popcount((mask * candidate) & 0xFF00000000000000ULL) < 6) continue;

        if (++cur_epoch == 0) {
            epochs.fill(0);
            cur_epoch = 1;
        }

        bool ok = true;
        for (std::size_t i = 0; i < count; ++i) {
            const std::size_t idx = static_cast<std::size_t>((subs[i] * candidate) >> shift);
            if (epochs[idx] != cur_epoch) {
                epochs[idx] = cur_epoch;
                used[idx] = atts[i];
            } else if (used[idx] != atts[i]) {
                ok = false;
                break;
            }
        }
        if (ok) return candidate;
    }
}

namespace detail {

inline constexpr std::array<std::uint64_t, 64> ROOK_MAGICS = {
    0x01800010a0c00188ULL, 0x0040002000100048ULL, 0x2080200008100080ULL, 0x5280048148003000ULL,
    0x0100100801000402ULL, 0x0200011002008408ULL, 0x0180048003000200ULL, 0x0100104100048822ULL,
    0x8040800080400020ULL, 0x4820802000400090ULL, 0x0902001046002280ULL, 0x0000800800100080ULL,
    0x0009001008010004ULL, 0x0040800200800400ULL, 0x0041000200010004ULL, 0x20410000b0420900ULL,
    0x08008a8000400020ULL, 0x1050014040002000ULL, 0x0200c10013a00101ULL, 0x1008018050008008ULL,
    0x0001010004080010ULL, 0x001a808004000200ULL, 0x0818040022019018ULL, 0x2200820000842051ULL,
    0x0000400880008032ULL, 0x001002c440042000ULL, 0x1a44200480100080ULL, 0x0000080080100080ULL,
    0x2000040080080080ULL, 0x0000040801402010ULL, 0x2400018400302208ULL, 0x0400a04200240081ULL,
    0x8200804008800020ULL, 0x4001004001002081ULL, 0x0500110041002004ULL, 0x8000090021001000ULL,
    0x0005004413000800ULL, 0x8002001182000408ULL, 0x0001020854000330ULL, 0x0410800040802100ULL,
    0x0408c00462888000ULL, 0x001002e0104a4000ULL, 0x00b0001020008080ULL, 0x080801805001800aULL,
    0x4400080004008080ULL, 0x2002001024160008ULL, 0x4026002401420008ULL, 0xa840008049060004ULL,
    0x0000634000801280ULL, 0x0010802108400100ULL, 0x8090080020040020ULL, 0x0000100008008080ULL,
    0x0040100500080100ULL, 0x0004800200040080ULL, 0x8000080110420400ULL, 0x0010108114104200ULL,
    0x5004800020481101ULL, 0x810020120100408aULL, 0x28460010a10980c2ULL, 0x200210010004c861ULL,
    0x3000110008002313ULL, 0x0041000844000a31ULL, 0x0320011002080084ULL, 0x0008004408210082ULL,
};

inline constexpr std::array<std::uint64_t, 64> BISHOP_MAGICS = {
    0x0420a02a00902084ULL, 0x0028810924010001ULL, 0x082101012200108cULL, 0x0084040090000240ULL,
    0x30040d2048108400ULL, 0x08a7012012020020ULL, 0x1008443008880000ULL, 0x2022404a10212010ULL,
    0x3012c00a22121628ULL, 0x4000e00996020440ULL, 0x8260082804428004ULL, 0x0000a44408802080ULL,
    0x0000011040010000ULL, 0x8000488824400140ULL, 0x2000004444044100ULL, 0x4000204044100800ULL,
    0x000800c010048080ULL, 0x0004000821084200ULL, 0x1250000100420140ULL, 0x0004018524008200ULL,
    0x1024002200a20802ULL, 0x0001000880600200ULL, 0x2240441098341006ULL, 0x226200202084040cULL,
    0x860804c048511000ULL, 0x0082104002d00202ULL, 0x0000300008004840ULL, 0x202104008800a060ULL,
    0x0001010048104010ULL, 0x8010008001008082ULL, 0x4008039804420840ULL, 0x1010510040808800ULL,
    0x001002208030340cULL, 0x8084242041022210ULL, 0x1042a03802500080ULL, 0x1468208020880200ULL,
    0x6640090100141040ULL, 0x002022088000c800ULL, 0x004202020c004843ULL, 0x0001510020020201ULL,
    0x8808121031012414ULL, 0x1019113002001000ULL, 0x4004140028000400ULL, 0x2202012011050810ULL,
    0x1081840810108200ULL, 0xa040882081000020ULL, 0x4024500401288840ULL, 0x40242090a2000100ULL,
    0x6a806a021040042cULL, 0x0821004844240004ULL, 0x2800008408d80101ULL, 0x0800131542160028ULL,
    0x0000181060288120ULL, 0x0002042810090809ULL, 0x004038050400b00bULL, 0x04081002820ac848ULL,
    0x0028404410080200ULL, 0x200100240a02900dULL, 0x00026052104a0820ULL, 0x0111200012228800ULL,
    0x4005200004050408ULL, 0x4004028404080208ULL, 0x0000086008008900ULL, 0x02a0081104498202ULL,
};

struct SlidingAttackTables {
    std::array<MagicEntry, 64> rook_meta{};
    std::array<MagicEntry, 64> bishop_meta{};
    std::array<Bitboard, 102400> rook_table{};
    std::array<Bitboard, 5248> bishop_table{};

    SlidingAttackTables() noexcept {
        std::uint32_t r_off = 0;
        std::uint32_t b_off = 0;
        for (Square sq = 0; sq < 64; ++sq) {
            const Bitboard rmask = rook_relevancy_mask(sq);
            const int rbits = popcount(rmask);
            const std::uint8_t rshift = static_cast<std::uint8_t>(64 - rbits);
            const MagicEntry r_entry{rmask, ROOK_MAGICS[sq], r_off, rshift};
            rook_meta[sq] = r_entry;
            for_each_subset(rmask, [&](Bitboard occ) {
                rook_table[r_entry.index(occ)] = rook_attacks_slow(sq, occ);
            });
            r_off += std::uint32_t{1} << rbits;

            const Bitboard bmask = bishop_relevancy_mask(sq);
            const int bbits = popcount(bmask);
            const std::uint8_t bshift = static_cast<std::uint8_t>(64 - bbits);
            const MagicEntry b_entry{bmask, BISHOP_MAGICS[sq], b_off, bshift};
            bishop_meta[sq] = b_entry;
            for_each_subset(bmask, [&](Bitboard occ) {
                bishop_table[b_entry.index(occ)] = bishop_attacks_slow(sq, occ);
            });
            b_off += std::uint32_t{1} << bbits;
        }
    }
};

inline const SlidingAttackTables& sliding_tables() noexcept {
    static const SlidingAttackTables tables;
    return tables;
}

}  // namespace detail

[[nodiscard]] inline const MagicEntry& rook_magic_entry(Square sq) noexcept {
    if (!is_valid_square(sq)) {
        static const MagicEntry empty{};
        return empty;
    }
    return detail::sliding_tables().rook_meta[sq];
}

[[nodiscard]] inline const MagicEntry& bishop_magic_entry(Square sq) noexcept {
    if (!is_valid_square(sq)) {
        static const MagicEntry empty{};
        return empty;
    }
    return detail::sliding_tables().bishop_meta[sq];
}

[[nodiscard]] inline Bitboard rook_attacks_magic(Square sq, Bitboard occ) noexcept {
    if (!is_valid_square(sq)) return 0;
    const auto& t = detail::sliding_tables();
    return t.rook_table[t.rook_meta[sq].index(occ)];
}

[[nodiscard]] inline Bitboard bishop_attacks_magic(Square sq, Bitboard occ) noexcept {
    if (!is_valid_square(sq)) return 0;
    const auto& t = detail::sliding_tables();
    return t.bishop_table[t.bishop_meta[sq].index(occ)];
}

[[nodiscard]] inline Bitboard queen_attacks_magic(Square sq, Bitboard occ) noexcept {
    return bishop_attacks_magic(sq, occ) | rook_attacks_magic(sq, occ);
}

}  // namespace chess
