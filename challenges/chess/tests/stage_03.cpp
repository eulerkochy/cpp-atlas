// Stage 3 - magic-bitboards
// Spec: https://cppatlas.com/build/chess/magic-bitboards
//
// Magic bitboards (from 20ns to 1ns): relevancy masks, Carry-Rippler subset
// enumeration, PEXT bit extraction, sparse magic verification and search, and
// Fancy Magic Bitboards lookup tables.
#include "support/harness.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

namespace preflight {

CPPATLAS_PREFLIGHT(has_relevancy_and_subsets,
                   "stage 3 (magic-bitboards): magic.hpp needs `rook_relevancy_mask`, "
                   "`bishop_relevancy_mask`, and `for_each_subset`.",
                   chess::Bitboard,
                   requires(V mask, chess::Square sq) {
                       { chess::rook_relevancy_mask(sq) } -> std::same_as<chess::Bitboard>;
                       { chess::bishop_relevancy_mask(sq) } -> std::same_as<chess::Bitboard>;
                       chess::for_each_subset(mask, [](chess::Bitboard) {});
                   });

CPPATLAS_PREFLIGHT(has_magic_entry,
                   "stage 3 (magic-bitboards): magic.hpp needs `MagicEntry` with `mask`, `magic`, "
                   "`offset`, `shift`, and `constexpr std::size_t index(Bitboard) const`.",
                   chess::MagicEntry,
                   requires(V entry, const V& centry, chess::Bitboard occ) {
                       { entry.mask } -> std::convertible_to<chess::Bitboard>;
                       { entry.magic } -> std::convertible_to<std::uint64_t>;
                       { entry.offset } -> std::convertible_to<std::uint32_t>;
                       { entry.shift } -> std::convertible_to<std::uint8_t>;
                       { centry.index(occ) } -> std::same_as<std::size_t>;
                   });

CPPATLAS_PREFLIGHT(has_pext_and_magic_search,
                   "stage 3 (magic-bitboards): magic.hpp needs `has_hardware_pext`, `pext_index`, "
                   "`verify_magic`, and `find_magic_number`.",
                   chess::Square,
                   requires(V sq, chess::Bitboard bb, bool is_bishop, std::uint64_t magic,
                            std::size_t* collisions) {
                       { chess::has_hardware_pext() } -> std::same_as<bool>;
                       { chess::pext_index(bb, bb) } -> std::same_as<chess::Bitboard>;
                       { chess::verify_magic(sq, is_bishop, magic, collisions) } -> std::same_as<bool>;
                       { chess::verify_magic(sq, is_bishop, magic) } -> std::same_as<bool>;
                       { chess::find_magic_number(sq, is_bishop) } -> std::same_as<std::uint64_t>;
                       { chess::find_magic_number(sq, is_bishop, magic) } -> std::same_as<std::uint64_t>;
                   });

CPPATLAS_PREFLIGHT(has_magic_tables_and_attacks,
                   "stage 3 (magic-bitboards): magic.hpp needs `rook_magic_entry`, `bishop_magic_entry`, "
                   "`rook_attacks_magic`, `bishop_attacks_magic`, and `queen_attacks_magic`.",
                   chess::Square,
                   requires(V sq, chess::Bitboard occ) {
                       { chess::rook_magic_entry(sq) } -> std::same_as<const chess::MagicEntry&>;
                       { chess::bishop_magic_entry(sq) } -> std::same_as<const chess::MagicEntry&>;
                       { chess::rook_attacks_magic(sq, occ) } -> std::same_as<chess::Bitboard>;
                       { chess::bishop_attacks_magic(sq, occ) } -> std::same_as<chess::Bitboard>;
                       { chess::queen_attacks_magic(sq, occ) } -> std::same_as<chess::Bitboard>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_relevancy_and_subsets && preflight::has_magic_entry &&
                    preflight::has_pext_and_magic_search && preflight::has_magic_tables_and_attacks);

namespace {

using namespace chess;

template <typename... Squares>
constexpr Bitboard bb_of(Squares... sqs) noexcept {
    return (Bitboard{0} | ... | square_bb(sqs));
}

constexpr Bitboard expected_rook_mask(Square sq) noexcept {
    const int r = rank_of(sq);
    const int f = file_of(sq);
    const Bitboard rank_bits = (RANK_1 << (8 * r)) & ~(FILE_A | FILE_H);
    const Bitboard file_bits = (FILE_A << f) & ~(RANK_1 | RANK_8);
    return (rank_bits | file_bits) & ~square_bb(sq);
}

constexpr Bitboard expected_bishop_mask(Square sq) noexcept {
    const int r = rank_of(sq);
    const int f = file_of(sq);
    Bitboard mask = 0;
    constexpr std::array<std::pair<int, int>, 4> dirs = {{{1, 1}, {1, -1}, {-1, 1}, {-1, -1}}};
    for (const auto& [dr, df] : dirs) {
        int nr = r + dr;
        int nf = f + df;
        while (nr >= 1 && nr <= 6 && nf >= 1 && nf <= 6) {
            mask |= square_bb(make_square(nf, nr));
            nr += dr;
            nf += df;
        }
    }
    return mask;
}

constexpr std::uint64_t splitmix64(std::uint64_t& state) noexcept {
    state += 0x9E3779B97F4A7C15ULL;
    std::uint64_t z = state;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

}  // namespace

CPPATLAS_TEST("relevancy masks exclude outer endpoints and total 102400 rook / 5248 bishop entries") {
    constexpr Bitboard r_d4 = rook_relevancy_mask(D4);
    constexpr Bitboard b_d4 = bishop_relevancy_mask(D4);
    CHECK(r_d4 == bb_of(B4, C4, E4, F4, G4, D2, D3, D5, D6, D7));
    CHECK(b_d4 == bb_of(B2, C3, E5, F6, G7, F2, E3, C5, B6));

    // Representative rook masks: corners (12 bits), non-corner edges (11 bits), interior (10 bits).
    CHECK(rook_relevancy_mask(A1) == bb_of(B1, C1, D1, E1, F1, G1, A2, A3, A4, A5, A6, A7));
    CHECK(rook_relevancy_mask(D1) == bb_of(B1, C1, E1, F1, G1, D2, D3, D4, D5, D6, D7));
    CHECK(rook_relevancy_mask(A4) == bb_of(B4, C4, D4, E4, F4, G4, A2, A3, A5, A6, A7));
    CHECK(rook_relevancy_mask(H5) == bb_of(B5, C5, D5, E5, F5, G5, H2, H3, H4, H6, H7));
    CHECK(rook_relevancy_mask(E8) == bb_of(B8, C8, D8, F8, G8, E2, E3, E4, E5, E6, E7));

    CHECK(popcount(rook_relevancy_mask(A1)) == 12);
    CHECK(popcount(rook_relevancy_mask(H1)) == 12);
    CHECK(popcount(rook_relevancy_mask(A8)) == 12);
    CHECK(popcount(rook_relevancy_mask(H8)) == 12);
    CHECK(popcount(rook_relevancy_mask(D1)) == 11);
    CHECK(popcount(rook_relevancy_mask(A4)) == 11);
    CHECK(popcount(rook_relevancy_mask(H5)) == 11);
    CHECK(popcount(rook_relevancy_mask(E8)) == 11);
    CHECK(popcount(rook_relevancy_mask(D4)) == 10);
    CHECK(popcount(rook_relevancy_mask(E5)) == 10);

    // Representative bishop masks: corners (6 bits), center 4 squares (9 bits).
    CHECK(bishop_relevancy_mask(A1) == bb_of(B2, C3, D4, E5, F6, G7));
    CHECK(bishop_relevancy_mask(H1) == bb_of(G2, F3, E4, D5, C6, B7));
    CHECK(bishop_relevancy_mask(A8) == bb_of(B7, C6, D5, E4, F3, G2));
    CHECK(bishop_relevancy_mask(H8) == bb_of(G7, F6, E5, D4, C3, B2));
    CHECK(popcount(bishop_relevancy_mask(D4)) == 9);
    CHECK(popcount(bishop_relevancy_mask(E4)) == 9);
    CHECK(popcount(bishop_relevancy_mask(D5)) == 9);
    CHECK(popcount(bishop_relevancy_mask(E5)) == 9);

    constexpr Bitboard outer_edges = FILE_A | FILE_H | RANK_1 | RANK_8;
    std::size_t rook_total = 0;
    std::size_t bishop_total = 0;

    for (Square sq = 0; sq < 64; ++sq) {
        const int r = rank_of(sq);
        const int f = file_of(sq);
        const Bitboard rm = rook_relevancy_mask(sq);
        const Bitboard bm = bishop_relevancy_mask(sq);

        INFO("sq=" << square_to_string(sq));
        CHECK((rm & square_bb(sq)) == 0ULL);
        CHECK((bm & square_bb(sq)) == 0ULL);
        CHECK((bm & outer_edges) == 0ULL);

        CHECK(rm == expected_rook_mask(sq));
        CHECK(bm == expected_bishop_mask(sq));

        const bool edge_rank = (r == 0 || r == 7);
        const bool edge_file = (f == 0 || f == 7);
        const int expected_rook_bits = (edge_rank && edge_file) ? 12 : ((edge_rank || edge_file) ? 11 : 10);
        CHECK(popcount(rm) == expected_rook_bits);

        rook_total += (std::size_t{1} << popcount(rm));
        bishop_total += (std::size_t{1} << popcount(bm));
    }

    CHECK(rook_total == 102400);
    CHECK(bishop_total == 5248);
}

CPPATLAS_TEST("for_each_subset enumerates every Carry-Rippler subset with zero duplicates") {
    {
        std::vector<Bitboard> visited;
        for_each_subset(0ULL, [&](Bitboard sub) { visited.push_back(sub); });
        REQUIRE(visited.size() == 1);
        CHECK(visited[0] == 0ULL);
    }

    {
        const Bitboard mask4 = bb_of(B2, D4, F6, H8);
        std::vector<Bitboard> visited;
        for_each_subset(mask4, [&](Bitboard sub) {
            CHECK((sub & ~mask4) == 0ULL);
            visited.push_back(sub);
        });
        REQUIRE(visited.size() == 16);
        std::sort(visited.begin(), visited.end());
        CHECK(std::unique(visited.begin(), visited.end()) == visited.end());
        CHECK(visited.front() == 0ULL);
        CHECK(visited.back() == mask4);
    }

    {
        const Bitboard d4_bishop = bishop_relevancy_mask(D4);
        REQUIRE(popcount(d4_bishop) == 9);
        std::vector<Bitboard> visited;
        for_each_subset(d4_bishop, [&](Bitboard sub) {
            CHECK((sub & ~d4_bishop) == 0ULL);
            visited.push_back(sub);
        });
        REQUIRE(visited.size() == 512);
        std::sort(visited.begin(), visited.end());
        CHECK(std::unique(visited.begin(), visited.end()) == visited.end());
        CHECK(visited.front() == 0ULL);
        CHECK(visited.back() == d4_bishop);
    }
}

CPPATLAS_TEST("pext_index compresses masked bits injectively in bit order") {
    constexpr bool hw_pext = has_hardware_pext();
#if defined(__BMI2__)
    CHECK(hw_pext);
#else
    CHECK_FALSE(hw_pext);
#endif

    CHECK(pext_index(0ULL, 0ULL) == 0ULL);
    CHECK(pext_index(~0ULL, 0ULL) == 0ULL);

    const Bitboard d4_rook = rook_relevancy_mask(D4);
    const Bitboard d4_bishop = bishop_relevancy_mask(D4);
    REQUIRE(popcount(d4_rook) == 10);
    REQUIRE(popcount(d4_bishop) == 9);

    CHECK(pext_index(0ULL, d4_rook) == 0ULL);
    CHECK(pext_index(d4_rook, d4_rook) == ((Bitboard{1} << 10) - 1));
    CHECK(pext_index(~0ULL, d4_rook) == ((Bitboard{1} << 10) - 1));
    CHECK(pext_index(d4_bishop, d4_bishop) == ((Bitboard{1} << 9) - 1));

    // Bits outside the mask are ignored.
    const Bitboard noisy = bb_of(A1, D4, H8, D6, B4);
    CHECK(pext_index(noisy, d4_rook) == pext_index(noisy & d4_rook, d4_rook));
    CHECK(pext_index(~0ULL ^ square_bb(D5), d4_rook) == pext_index(d4_rook ^ square_bb(D5), d4_rook));

    // Bit order preservation: single set bits map to 1, 2, 4, 8 in LSB-to-MSB order.
    const Bitboard sparse = bb_of(B2, E3, C5, G7);
    CHECK(pext_index(square_bb(B2), sparse) == 1ULL);
    CHECK(pext_index(square_bb(E3), sparse) == 2ULL);
    CHECK(pext_index(square_bb(C5), sparse) == 4ULL);
    CHECK(pext_index(square_bb(G7), sparse) == 8ULL);
    CHECK(pext_index(bb_of(B2, C5), sparse) == (1ULL | 4ULL));

    // Exhaustive bijection on all 512 subsets of bishop_relevancy_mask(D4).
    std::array<bool, 512> seen{};
    std::size_t count = 0;
    for_each_subset(d4_bishop, [&](Bitboard sub) {
        const Bitboard idx = pext_index(sub, d4_bishop);
        REQUIRE(idx < 512ULL);
        CHECK_FALSE(seen[static_cast<std::size_t>(idx)]);
        seen[static_cast<std::size_t>(idx)] = true;
        ++count;
    });
    CHECK(count == 512);
}

CPPATLAS_TEST("verify_magic rejects invalid magics and accepts valid magics with constructive collisions") {
    std::size_t collisions = 123;
    CHECK_FALSE(verify_magic(D4, false, 0ULL, &collisions));
    CHECK_FALSE(verify_magic(D4, true, 0ULL, &collisions));
    CHECK_FALSE(verify_magic(A1, false, 0ULL));

    // Trivial multipliers cause destructive collisions.
    CHECK_FALSE(verify_magic(D4, false, 1ULL, &collisions));
    CHECK_FALSE(verify_magic(D4, true, 1ULL, &collisions));
    CHECK_FALSE(verify_magic(A1, false, 1ULL));
    CHECK_FALSE(verify_magic(A1, false, 2ULL));

    constexpr std::array<Square, 10> sample_squares = {A1, H1, A8, H8, D1, A4, H5, E8, D4, E5};

    for (Square sq : sample_squares) {
        INFO("sq=" << square_to_string(sq));
        std::size_t r_coll = 0;
        std::size_t b_coll = 0;
        const std::uint64_t r_magic = rook_magic_entry(sq).magic;
        const std::uint64_t b_magic = bishop_magic_entry(sq).magic;

        CHECK(r_magic != 0ULL);
        CHECK(b_magic != 0ULL);
        CHECK(verify_magic(sq, false, r_magic, &r_coll));
        CHECK(verify_magic(sq, true, b_magic, &b_coll));
    }

    // Valid non-bijective magics must be accepted when every collision is constructive
    // (different blocker subsets producing the identical attack bitboard).
    std::size_t constructive_16 = 0;
    CHECK(verify_magic(A1, true, 0x00251001d1050200ULL, &constructive_16));
    CHECK(constructive_16 == 16);

    std::size_t constructive_2 = 0;
    CHECK(verify_magic(A1, true, 0x00841015c8018881ULL, &constructive_2));
    CHECK(constructive_2 == 2);
}

CPPATLAS_TEST("find_magic_number discovers verified sparse magics for corner and interior squares") {
    struct Target {
        Square sq;
        bool is_bishop;
        const char* label;
    };
    constexpr std::array<Target, 4> targets = {{
        {A1, false, "A1 rook"},
        {D5, false, "D5 rook"},
        {A1, true, "A1 bishop"},
        {D4, true, "D4 bishop"},
    }};

    for (const auto& t : targets) {
        INFO("target=" << t.label);
        const std::uint64_t magic = find_magic_number(t.sq, t.is_bishop);
        CHECK(magic != 0ULL);
        std::size_t collisions = 0;
        CHECK(verify_magic(t.sq, t.is_bishop, magic, &collisions));
    }
}

CPPATLAS_TEST("MagicEntry metadata and offsets partition flat rook and bishop tables cleanly") {
    auto verify_table_layout = [](bool is_bishop, std::size_t expected_total) {
        std::vector<std::pair<std::size_t, std::size_t>> ranges;
        ranges.reserve(64);
        std::size_t sum = 0;

        for (Square sq = 0; sq < 64; ++sq) {
            const MagicEntry& entry = is_bishop ? bishop_magic_entry(sq) : rook_magic_entry(sq);
            const Bitboard expected_mask = is_bishop ? bishop_relevancy_mask(sq) : rook_relevancy_mask(sq);
            const int bits = popcount(expected_mask);
            const std::size_t span = std::size_t{1} << bits;

            INFO((is_bishop ? "bishop " : "rook ") << square_to_string(sq));
            CHECK(entry.mask == expected_mask);
            CHECK(entry.shift == static_cast<std::uint8_t>(64 - bits));
            CHECK(entry.magic != 0ULL);
            CHECK(entry.offset + span <= expected_total);

            CHECK(entry.index(0ULL) == entry.offset);
            const std::size_t full_idx = entry.index(entry.mask);
            CHECK(full_idx >= entry.offset);
            CHECK(full_idx < entry.offset + span);
            CHECK(entry.index(~0ULL) == full_idx);

            ranges.emplace_back(entry.offset, span);
            sum += span;
        }

        CHECK(sum == expected_total);
        std::sort(ranges.begin(), ranges.end());
        for (std::size_t i = 0; i + 1 < ranges.size(); ++i) {
            CHECK(ranges[i].first + ranges[i].second <= ranges[i + 1].first);
        }
    };

    verify_table_layout(false, 102400);
    verify_table_layout(true, 5248);
}

CPPATLAS_TEST("bishop_attacks_magic matches bishop_attacks_slow across all 5248 relevancy subsets") {
    std::size_t total_subsets = 0;

    for (Square sq = 0; sq < 64; ++sq) {
        const Bitboard mask = bishop_relevancy_mask(sq);
        const std::size_t expected_count = std::size_t{1} << popcount(mask);
        std::size_t count = 0;
        bool square_ok = true;

        for_each_subset(mask, [&](Bitboard occ) {
            ++count;
            if (!square_ok) return;
            const Bitboard magic_bb = bishop_attacks_magic(sq, occ);
            const Bitboard slow_bb = bishop_attacks_slow(sq, occ);
            const Bitboard api_bb = bishop_attacks(sq, occ);
            if (magic_bb != slow_bb || api_bb != magic_bb) {
                INFO("bishop sq=" << square_to_string(sq) << " occ=" << occ);
                CHECK(magic_bb == slow_bb);
                CHECK(api_bb == magic_bb);
                square_ok = false;
            }
        });

        INFO("bishop sq=" << square_to_string(sq));
        REQUIRE(count == expected_count);
        CHECK(square_ok);
        total_subsets += count;
    }

    CHECK(total_subsets == 5248);
}

CPPATLAS_TEST("rook_attacks_magic matches rook_attacks_slow exhaustively on representative squares") {
    constexpr std::array<Square, 5> sample_rooks = {A1, D1, D4, E5, H8};

    for (Square sq : sample_rooks) {
        const Bitboard mask = rook_relevancy_mask(sq);
        const std::size_t expected_count = std::size_t{1} << popcount(mask);
        std::size_t count = 0;
        bool square_ok = true;

        for_each_subset(mask, [&](Bitboard occ) {
            ++count;
            if (!square_ok) return;
            const Bitboard magic_bb = rook_attacks_magic(sq, occ);
            const Bitboard slow_bb = rook_attacks_slow(sq, occ);
            const Bitboard api_bb = rook_attacks(sq, occ);
            if (magic_bb != slow_bb || api_bb != magic_bb) {
                INFO("rook sq=" << square_to_string(sq) << " occ=" << occ);
                CHECK(magic_bb == slow_bb);
                CHECK(api_bb == magic_bb);
                square_ok = false;
            }
        });

        INFO("rook sq=" << square_to_string(sq));
        REQUIRE(count == expected_count);
        CHECK(square_ok);
    }
}

CPPATLAS_TEST("magic slider lookups match slow baselines across all 64 squares with noisy occupancies") {
    CHECK(popcount(rook_attacks_magic(D4, 0ULL)) == 14);
    CHECK(popcount(bishop_attacks_magic(D4, 0ULL)) == 13);
    CHECK(popcount(queen_attacks_magic(D4, 0ULL)) == 27);

    std::array<Bitboard, 256> occupancies{};
    occupancies[0] = 0ULL;
    occupancies[1] = ~0ULL;
    occupancies[2] = FILE_A | FILE_H | RANK_1 | RANK_8;
    std::uint64_t rng = 0x123456789ABCDEF0ULL;
    for (std::size_t i = 3; i < occupancies.size(); ++i) {
        occupancies[i] = splitmix64(rng);
    }

    std::size_t verified_pairs = 0;
    for (Square sq = 0; sq < 64; ++sq) {
        bool square_ok = true;
        for (Bitboard occ : occupancies) {
            const Bitboard r_magic = rook_attacks_magic(sq, occ);
            const Bitboard b_magic = bishop_attacks_magic(sq, occ);
            const Bitboard q_magic = queen_attacks_magic(sq, occ);

            const Bitboard r_slow = rook_attacks_slow(sq, occ);
            const Bitboard b_slow = bishop_attacks_slow(sq, occ);
            const Bitboard q_slow = queen_attacks_slow(sq, occ);

            const Bitboard r_api = rook_attacks(sq, occ);
            const Bitboard b_api = bishop_attacks(sq, occ);
            const Bitboard q_api = queen_attacks(sq, occ);

            if (r_magic != r_slow || b_magic != b_slow || q_magic != q_slow ||
                q_magic != (r_magic | b_magic) || r_api != r_magic || b_api != b_magic ||
                q_api != q_magic) {
                INFO("sq=" << square_to_string(sq) << " occ=" << occ);
                CHECK(r_magic == r_slow);
                CHECK(b_magic == b_slow);
                CHECK(q_magic == q_slow);
                CHECK(q_magic == (r_magic | b_magic));
                CHECK(r_api == r_magic);
                CHECK(b_api == b_magic);
                CHECK(q_api == q_magic);
                square_ok = false;
                break;
            }
            ++verified_pairs;
        }
        CHECK(square_ok);
    }

    CHECK(verified_pairs == 64 * 256);
}
