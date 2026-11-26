// Stage 2 - bitboards-and-attacks
// Spec: https://cppatlas.com/build/chess/bitboards-and-attacks
//
// Bitboard utilities, constexpr directional shifts, ASCII bitboard formatting,
// naive ray sliders, precomputed/fast attack tables (pawn, knight, king,
// bishop, rook, queen), and Position::is_square_attacked / in_check.
#include "support/harness.hpp"

#include <array>
#include <cstdlib>
#include <string>
#include <string_view>
#include <vector>

namespace preflight {

CPPATLAS_PREFLIGHT(has_bb_primitives,
                   "stage 2 (bitboards-and-attacks): bitboard.hpp needs `square_bb`, `popcount`, "
                   "`lsb`, `pop_lsb`, and `more_than_one`.",
                   chess::Bitboard,
                   requires(V& bb, chess::Square sq) {
                       { chess::square_bb(sq) } -> std::same_as<chess::Bitboard>;
                       { chess::popcount(bb) } -> std::same_as<int>;
                       { chess::lsb(bb) } -> std::same_as<chess::Square>;
                       { chess::pop_lsb(bb) } -> std::same_as<chess::Square>;
                       { chess::more_than_one(bb) } -> std::same_as<bool>;
                   });

CPPATLAS_PREFLIGHT(has_direction_and_shift,
                   "stage 2 (bitboards-and-attacks): bitboard.hpp needs `Direction` and "
                   "`constexpr Bitboard shift<Direction>(Bitboard)` across all 8 directions.",
                   chess::Direction,
                   requires(chess::Bitboard bb) {
                       { chess::shift<V::North>(bb) } -> std::same_as<chess::Bitboard>;
                       { chess::shift<V::South>(bb) } -> std::same_as<chess::Bitboard>;
                       { chess::shift<V::East>(bb) } -> std::same_as<chess::Bitboard>;
                       { chess::shift<V::West>(bb) } -> std::same_as<chess::Bitboard>;
                       { chess::shift<V::NorthEast>(bb) } -> std::same_as<chess::Bitboard>;
                       { chess::shift<V::NorthWest>(bb) } -> std::same_as<chess::Bitboard>;
                       { chess::shift<V::SouthEast>(bb) } -> std::same_as<chess::Bitboard>;
                       { chess::shift<V::SouthWest>(bb) } -> std::same_as<chess::Bitboard>;
                   });

CPPATLAS_PREFLIGHT(has_format_and_slow_sliders,
                   "stage 2 (bitboards-and-attacks): bitboard.hpp needs `format_bitboard`, "
                   "`rook_attacks_slow`, `bishop_attacks_slow`, and `queen_attacks_slow`.",
                   chess::Bitboard,
                   requires(V bb, chess::Square sq) {
                       { chess::format_bitboard(bb) } -> std::same_as<std::string>;
                       { chess::rook_attacks_slow(sq, bb) } -> std::same_as<chess::Bitboard>;
                       { chess::bishop_attacks_slow(sq, bb) } -> std::same_as<chess::Bitboard>;
                       { chess::queen_attacks_slow(sq, bb) } -> std::same_as<chess::Bitboard>;
                   });

CPPATLAS_PREFLIGHT(has_attack_tables,
                   "stage 2 (bitboards-and-attacks): bitboard.hpp needs `pawn_attacks`, `knight_attacks`, "
                   "`king_attacks`, `bishop_attacks`, `rook_attacks`, and `queen_attacks`.",
                   chess::Bitboard,
                   requires(chess::Color c, chess::Square sq, V occ) {
                       { chess::pawn_attacks(c, sq) } -> std::same_as<chess::Bitboard>;
                       { chess::knight_attacks(sq) } -> std::same_as<chess::Bitboard>;
                       { chess::king_attacks(sq) } -> std::same_as<chess::Bitboard>;
                       { chess::bishop_attacks(sq, occ) } -> std::same_as<chess::Bitboard>;
                       { chess::rook_attacks(sq, occ) } -> std::same_as<chess::Bitboard>;
                       { chess::queen_attacks(sq, occ) } -> std::same_as<chess::Bitboard>;
                   });

CPPATLAS_PREFLIGHT(has_attack_queries,
                   "stage 2 (bitboards-and-attacks): chess::Position needs "
                   "`bool is_square_attacked(Square sq, Color by) const` and `bool in_check() const`.",
                   chess::Position,
                   requires(const V& pos, chess::Square sq, chess::Color c) {
                       { pos.is_square_attacked(sq, c) } -> std::same_as<bool>;
                       { pos.in_check() } -> std::same_as<bool>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_bb_primitives && preflight::has_direction_and_shift &&
                    preflight::has_format_and_slow_sliders && preflight::has_attack_tables &&
                    preflight::has_attack_queries);

namespace {

using namespace chess;

template <typename... Squares>
constexpr Bitboard bb_of(Squares... sqs) noexcept {
    return (Bitboard{0} | ... | square_bb(sqs));
}

bool has_bit(Bitboard bb, Square sq) noexcept {
    return (bb & square_bb(sq)) != 0;
}

}  // namespace

CPPATLAS_TEST("bitboard primitives and file/rank masks work accurately") {
    CHECK(square_bb(A1) == 1ULL);
    CHECK(square_bb(H8) == (1ULL << 63));
    CHECK(square_bb(SQ_NONE) == 0ULL);

    CHECK(popcount(0ULL) == 0);
    CHECK(popcount(~0ULL) == 64);
    CHECK(popcount(FILE_A) == 8);
    CHECK(popcount(RANK_1) == 8);

    CHECK(lsb(0ULL) == SQ_NONE);
    CHECK(lsb(square_bb(E4)) == E4);
    CHECK(lsb(bb_of(C2, G7, H8)) == C2);

    Bitboard bb = bb_of(B1, E4, H7);
    std::vector<Square> popped;
    while (bb != 0) {
        popped.push_back(pop_lsb(bb));
    }
    REQUIRE(popped.size() == 3);
    CHECK(popped[0] == B1);
    CHECK(popped[1] == E4);
    CHECK(popped[2] == H7);
    CHECK(pop_lsb(bb) == SQ_NONE);

    CHECK_FALSE(more_than_one(0ULL));
    CHECK_FALSE(more_than_one(square_bb(D5)));
    CHECK(more_than_one(bb_of(D5, E5)));
    CHECK(more_than_one(~0ULL));

    constexpr std::array<Bitboard, 8> files = {FILE_A, FILE_B, FILE_C, FILE_D, FILE_E, FILE_F, FILE_G, FILE_H};
    constexpr std::array<Bitboard, 8> ranks = {RANK_1, RANK_2, RANK_3, RANK_4, RANK_5, RANK_6, RANK_7, RANK_8};
    Bitboard union_files = 0;
    Bitboard union_ranks = 0;
    for (int i = 0; i < 8; ++i) {
        CHECK(popcount(files[static_cast<std::size_t>(i)]) == 8);
        CHECK(popcount(ranks[static_cast<std::size_t>(i)]) == 8);
        union_files |= files[static_cast<std::size_t>(i)];
        union_ranks |= ranks[static_cast<std::size_t>(i)];
    }
    CHECK(union_files == ~0ULL);
    CHECK(union_ranks == ~0ULL);
    CHECK((FILE_E & RANK_4) == square_bb(E4));
}

CPPATLAS_TEST("pawn_attacks handle center, A/H file edges without wrap-around, and back ranks") {
    CHECK(pawn_attacks(Color::White, E4) == bb_of(D5, F5));
    CHECK(pawn_attacks(Color::Black, E5) == bb_of(D4, F4));

    // A-file and H-file must produce exactly 1 attack and NEVER wrap to the opposite file.
    CHECK_MESSAGE(pawn_attacks(Color::White, A4) == bb_of(B5),
                  "White pawn on A4 must only attack B5 (no H-file wrap-around)");
    CHECK_MESSAGE(pawn_attacks(Color::White, H4) == bb_of(G5),
                  "White pawn on H4 must only attack G5 (no A-file wrap-around)");
    CHECK_MESSAGE(pawn_attacks(Color::Black, A5) == bb_of(B4),
                  "Black pawn on A5 must only attack B4 (no H-file wrap-around)");
    CHECK_MESSAGE(pawn_attacks(Color::Black, H5) == bb_of(G4),
                  "Black pawn on H5 must only attack G4 (no A-file wrap-around)");

    CHECK(pawn_attacks(Color::White, A1) == bb_of(B2));
    CHECK(pawn_attacks(Color::White, H1) == bb_of(G2));
    CHECK(pawn_attacks(Color::Black, A8) == bb_of(B7));
    CHECK(pawn_attacks(Color::Black, H8) == bb_of(G7));

    // Pawns on the final rank have no forward attacks.
    CHECK(pawn_attacks(Color::White, A8) == 0ULL);
    CHECK(pawn_attacks(Color::White, E8) == 0ULL);
    CHECK(pawn_attacks(Color::White, H8) == 0ULL);
    CHECK(pawn_attacks(Color::Black, A1) == 0ULL);
    CHECK(pawn_attacks(Color::Black, E1) == 0ULL);
    CHECK(pawn_attacks(Color::Black, H1) == 0ULL);
}

CPPATLAS_TEST("knight_attacks handle center, corners, edges, and never wrap across files") {
    CHECK(knight_attacks(D4) == bb_of(C2, E2, B3, F3, B5, F5, C6, E6));
    CHECK(popcount(knight_attacks(D4)) == 8);

    CHECK(knight_attacks(A1) == bb_of(B3, C2));
    CHECK(knight_attacks(H1) == bb_of(F2, G3));
    CHECK(knight_attacks(A8) == bb_of(B6, C7));
    CHECK(knight_attacks(H8) == bb_of(F7, G6));

    CHECK(knight_attacks(B1) == bb_of(A3, C3, D2));
    CHECK(knight_attacks(A2) == bb_of(B4, C3, C1));
    CHECK(knight_attacks(G8) == bb_of(E7, F6, H6));

    for (Square sq1 = 0; sq1 < 64; ++sq1) {
        const Bitboard att1 = knight_attacks(sq1);
        INFO("knight square: " << square_to_string(sq1));
        CHECK(popcount(att1) >= 2);
        CHECK(popcount(att1) <= 8);

        for (Square sq2 = 0; sq2 < 64; ++sq2) {
            const int df = std::abs(file_of(sq1) - file_of(sq2));
            const int dr = std::abs(rank_of(sq1) - rank_of(sq2));
            const bool is_knight_jump = (df * df + dr * dr) == 5;
            CHECK_MESSAGE(has_bit(att1, sq2) == is_knight_jump,
                          "knight_attacks(" << square_to_string(sq1) << ") disagrees on "
                                            << square_to_string(sq2));
            CHECK(has_bit(att1, sq2) == has_bit(knight_attacks(sq2), sq1));
        }
    }
}

CPPATLAS_TEST("king_attacks handle center, corners, edges, and are symmetric across all squares") {
    CHECK(king_attacks(E4) == bb_of(D3, E3, F3, D4, F4, D5, E5, F5));
    CHECK(king_attacks(A1) == bb_of(A2, B1, B2));
    CHECK(king_attacks(H8) == bb_of(G7, H7, G8));
    CHECK(king_attacks(E1) == bb_of(D1, F1, D2, E2, F2));
    CHECK(king_attacks(A4) == bb_of(A3, A5, B3, B4, B5));

    for (Square sq1 = 0; sq1 < 64; ++sq1) {
        const Bitboard att1 = king_attacks(sq1);
        INFO("king square: " << square_to_string(sq1));
        CHECK(popcount(att1) >= 3);
        CHECK(popcount(att1) <= 8);

        for (Square sq2 = 0; sq2 < 64; ++sq2) {
            const int df = std::abs(file_of(sq1) - file_of(sq2));
            const int dr = std::abs(rank_of(sq1) - rank_of(sq2));
            const bool is_king_step = (sq1 != sq2) && df <= 1 && dr <= 1;
            CHECK(has_bit(att1, sq2) == is_king_step);
            CHECK(has_bit(att1, sq2) == has_bit(king_attacks(sq2), sq1));
        }
    }
}

CPPATLAS_TEST("rook_attacks handle empty rays, single blockers, multi-directional blockers, and corners") {
    // Empty board from D4: 7 rank squares + 7 file squares = 14.
    const Bitboard d4_empty = (RANK_4 | FILE_D) ^ square_bb(D4);
    CHECK(rook_attacks(D4, 0ULL) == d4_empty);
    CHECK(popcount(rook_attacks(D4, 0ULL)) == 14);

    // Empty board from A1: 14 squares.
    const Bitboard a1_empty = (RANK_1 | FILE_A) ^ square_bb(A1);
    CHECK(rook_attacks(A1, 0ULL) == a1_empty);

    // Single blocker on D6 stops North ray AND includes D6.
    const Bitboard d4_single = rook_attacks(D4, square_bb(D6));
    CHECK(has_bit(d4_single, D5));
    CHECK_MESSAGE(has_bit(d4_single, D6), "rook_attacks must include the blocker square itself");
    CHECK_FALSE(has_bit(d4_single, D7));
    CHECK_FALSE(has_bit(d4_single, D8));
    CHECK(has_bit(d4_single, D1));
    CHECK(has_bit(d4_single, A4));
    CHECK(has_bit(d4_single, H4));

    // Blockers on all 4 directions around D4: D6 (N), D2 (S), B4 (W), G4 (E).
    const Bitboard occ = bb_of(D6, D2, B4, G4, D7, A4);
    const Bitboard expected = bb_of(D5, D6, D3, D2, C4, B4, E4, F4, G4);
    CHECK(rook_attacks(D4, occ) == expected);

    // Corner H8 with adjacent blockers G8 and H7.
    CHECK(rook_attacks(H8, bb_of(G8, H7)) == bb_of(G8, H7));
}

CPPATLAS_TEST("bishop_attacks handle empty rays, single blockers, multi-directional blockers, and corners") {
    // Empty board from D4: 13 diagonal squares.
    const Bitboard d4_empty = bb_of(A1, B2, C3, E5, F6, G7, H8, G1, F2, E3, C5, B6, A7);
    CHECK(bishop_attacks(D4, 0ULL) == d4_empty);
    CHECK(popcount(bishop_attacks(D4, 0ULL)) == 13);

    // Corner A1 empty board: 7 squares on main diagonal.
    CHECK(bishop_attacks(A1, 0ULL) == bb_of(B2, C3, D4, E5, F6, G7, H8));
    // Corner H1 empty board: 7 squares on anti-diagonal.
    CHECK(bishop_attacks(H1, 0ULL) == bb_of(G2, F3, E4, D5, C6, B7, A8));

    // Single blocker on F6 stops NE ray AND includes F6.
    const Bitboard d4_single = bishop_attacks(D4, square_bb(F6));
    CHECK(has_bit(d4_single, E5));
    CHECK_MESSAGE(has_bit(d4_single, F6), "bishop_attacks must include the blocker square itself");
    CHECK_FALSE(has_bit(d4_single, G7));
    CHECK_FALSE(has_bit(d4_single, H8));

    // Blockers on all 4 diagonals around D4: F6 (NE), B6 (NW), B2 (SW), E3 (SE).
    const Bitboard occ = bb_of(F6, B6, B2, E3, G7, A1);
    const Bitboard expected = bb_of(E5, F6, C5, B6, C3, B2, E3);
    CHECK(bishop_attacks(D4, occ) == expected);
}

CPPATLAS_TEST("queen_attacks equal rook_attacks | bishop_attacks across squares and occupancies") {
    CHECK(queen_attacks(D4, 0ULL) == (rook_attacks(D4, 0ULL) | bishop_attacks(D4, 0ULL)));
    CHECK(popcount(queen_attacks(D4, 0ULL)) == 27);
    CHECK(popcount(queen_attacks(A1, 0ULL)) == 21);

    constexpr std::array<Bitboard, 4> occupancies = {
        0ULL,
        ~0ULL,
        bb_of(D6, D2, B4, G4, F6, B6, B2, E3),
        RANK_2 | RANK_7 | FILE_C | FILE_F,
    };

    for (Bitboard occ : occupancies) {
        for (Square sq : {A1, D4, E1, E4, H5, H8}) {
            INFO("sq=" << square_to_string(sq) << " occ=" << occ);
            CHECK(queen_attacks(sq, occ) == (rook_attacks(sq, occ) | bishop_attacks(sq, occ)));
        }
    }
}

CPPATLAS_TEST("directional shift handles all 8 directions at constexpr without wrap-around") {
    // Single-square constexpr shifts from D4.
    constexpr Bitboard n_d4 = shift<Direction::North>(square_bb(D4));
    constexpr Bitboard s_d4 = shift<Direction::South>(square_bb(D4));
    constexpr Bitboard e_d4 = shift<Direction::East>(square_bb(D4));
    constexpr Bitboard w_d4 = shift<Direction::West>(square_bb(D4));
    constexpr Bitboard ne_d4 = shift<Direction::NorthEast>(square_bb(D4));
    constexpr Bitboard nw_d4 = shift<Direction::NorthWest>(square_bb(D4));
    constexpr Bitboard se_d4 = shift<Direction::SouthEast>(square_bb(D4));
    constexpr Bitboard sw_d4 = shift<Direction::SouthWest>(square_bb(D4));

    CHECK(n_d4 == square_bb(D5));
    CHECK(s_d4 == square_bb(D3));
    CHECK(e_d4 == square_bb(E4));
    CHECK(w_d4 == square_bb(C4));
    CHECK(ne_d4 == square_bb(E5));
    CHECK(nw_d4 == square_bb(C5));
    CHECK(se_d4 == square_bb(E3));
    CHECK(sw_d4 == square_bb(C3));

    // Multi-bit shifts including clipped edge squares.
    constexpr Bitboard multi = bb_of(B2, D4, G7);
    constexpr Bitboard multi_n = shift<Direction::North>(multi);
    constexpr Bitboard multi_s = shift<Direction::South>(multi);
    constexpr Bitboard multi_e = shift<Direction::East>(multi);
    constexpr Bitboard multi_w = shift<Direction::West>(multi);
    constexpr Bitboard multi_ne = shift<Direction::NorthEast>(multi);
    constexpr Bitboard multi_nw = shift<Direction::NorthWest>(multi);
    constexpr Bitboard multi_se = shift<Direction::SouthEast>(multi);
    constexpr Bitboard multi_sw = shift<Direction::SouthWest>(multi);

    CHECK(multi_n == bb_of(B3, D5, G8));
    CHECK(multi_s == bb_of(B1, D3, G6));
    CHECK(multi_e == bb_of(C2, E4, H7));
    CHECK(multi_w == bb_of(A2, C4, F7));
    CHECK(multi_ne == bb_of(C3, E5, H8));
    CHECK(multi_nw == bb_of(A3, C5, F8));
    CHECK(multi_se == bb_of(C1, E3, H6));
    CHECK(multi_sw == bb_of(A1, C3, F6));

    constexpr Bitboard edge_mix = bb_of(A1, H4, E8);
    CHECK(shift<Direction::North>(edge_mix) == bb_of(A2, H5));
    CHECK(shift<Direction::South>(edge_mix) == bb_of(H3, E7));
    CHECK(shift<Direction::East>(edge_mix) == bb_of(B1, F8));
    CHECK(shift<Direction::West>(edge_mix) == bb_of(G4, D8));
    CHECK(shift<Direction::NorthEast>(edge_mix) == bb_of(B2));
    CHECK(shift<Direction::NorthWest>(edge_mix) == bb_of(G5));
    CHECK(shift<Direction::SouthEast>(edge_mix) == bb_of(F7));
    CHECK(shift<Direction::SouthWest>(edge_mix) == bb_of(G3, D7));

    // Strict file and rank wrap-around prevention at constexpr.
    constexpr Bitboard n_edge = shift<Direction::North>(RANK_8);
    constexpr Bitboard s_edge = shift<Direction::South>(RANK_1);
    constexpr Bitboard e_edge = shift<Direction::East>(FILE_H);
    constexpr Bitboard w_edge = shift<Direction::West>(FILE_A);
    constexpr Bitboard ne_edge = shift<Direction::NorthEast>(FILE_H | RANK_8);
    constexpr Bitboard nw_edge = shift<Direction::NorthWest>(FILE_A | RANK_8);
    constexpr Bitboard se_edge = shift<Direction::SouthEast>(FILE_H | RANK_1);
    constexpr Bitboard sw_edge = shift<Direction::SouthWest>(FILE_A | RANK_1);

    CHECK(n_edge == 0ULL);
    CHECK(s_edge == 0ULL);
    CHECK(e_edge == 0ULL);
    CHECK(w_edge == 0ULL);
    CHECK(ne_edge == 0ULL);
    CHECK(nw_edge == 0ULL);
    CHECK(se_edge == 0ULL);
    CHECK(sw_edge == 0ULL);

    constexpr Bitboard all_n = shift<Direction::North>(~0ULL);
    constexpr Bitboard all_s = shift<Direction::South>(~0ULL);
    constexpr Bitboard all_e = shift<Direction::East>(~0ULL);
    constexpr Bitboard all_w = shift<Direction::West>(~0ULL);
    constexpr Bitboard all_ne = shift<Direction::NorthEast>(~0ULL);
    constexpr Bitboard all_nw = shift<Direction::NorthWest>(~0ULL);
    constexpr Bitboard all_se = shift<Direction::SouthEast>(~0ULL);
    constexpr Bitboard all_sw = shift<Direction::SouthWest>(~0ULL);

    CHECK(all_n == ~RANK_1);
    CHECK(all_s == ~RANK_8);
    CHECK(all_e == ~FILE_A);
    CHECK(all_w == ~FILE_H);
    CHECK(all_ne == ~(FILE_A | RANK_1));
    CHECK(all_nw == ~(FILE_H | RANK_1));
    CHECK(all_se == ~(FILE_A | RANK_8));
    CHECK(all_sw == ~(FILE_H | RANK_8));
    CHECK(shift<Direction::North>(0ULL) == 0ULL);
    CHECK(shift<Direction::SouthWest>(0ULL) == 0ULL);
}

CPPATLAS_TEST("format_bitboard produces an 8-rank pictorial string with distinct markers") {
    auto count_non_empty_lines = [](std::string_view text) -> int {
        int lines = 0;
        std::size_t pos = 0;
        while (pos < text.size()) {
            const std::size_t nl = text.find('\n', pos);
            const std::size_t end = (nl == std::string_view::npos) ? text.size() : nl;
            if (end > pos) ++lines;
            if (nl == std::string_view::npos) break;
            pos = nl + 1;
        }
        return lines;
    };

    auto count_distinct_non_ws = [](std::string_view text) -> int {
        std::array<bool, 256> seen{};
        int count = 0;
        for (unsigned char ch : text) {
            if (ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n') continue;
            if (!seen[ch]) {
                seen[ch] = true;
                ++count;
            }
        }
        return count;
    };

    const std::string empty_s = format_bitboard(0ULL);
    const std::string d5_s = format_bitboard(square_bb(D5));
    const std::string a1_s = format_bitboard(square_bb(A1));
    const std::string h8_s = format_bitboard(square_bb(H8));
    const std::string full_s = format_bitboard(~0ULL);

    CHECK_FALSE(empty_s.empty());
    CHECK_FALSE(d5_s.empty());
    CHECK_FALSE(full_s.empty());

    CHECK(count_non_empty_lines(empty_s) >= 8);
    CHECK(count_non_empty_lines(d5_s) >= 8);
    CHECK(count_non_empty_lines(full_s) >= 8);

    CHECK(d5_s != empty_s);
    CHECK(full_s != empty_s);
    CHECK(d5_s != full_s);
    CHECK(a1_s != h8_s);
    CHECK(count_distinct_non_ws(d5_s) >= 2);
}

CPPATLAS_TEST("slow ray sliders terminate on first blocker across corners, edges, and center") {
    // Rook slow: empty board, single blocker, 4-direction blockers, corner, and edge.
    CHECK(rook_attacks_slow(D4, 0ULL) == ((RANK_4 | FILE_D) ^ square_bb(D4)));
    CHECK(rook_attacks_slow(A1, 0ULL) == ((RANK_1 | FILE_A) ^ square_bb(A1)));

    const Bitboard d4_rook_single = rook_attacks_slow(D4, square_bb(D6));
    CHECK(has_bit(d4_rook_single, D5));
    CHECK(has_bit(d4_rook_single, D6));
    CHECK_FALSE(has_bit(d4_rook_single, D7));
    CHECK_FALSE(has_bit(d4_rook_single, D8));
    CHECK(has_bit(d4_rook_single, D1));
    CHECK(has_bit(d4_rook_single, A4));
    CHECK(has_bit(d4_rook_single, H4));

    const Bitboard r_occ = bb_of(D6, D2, B4, G4, D7, A4);
    CHECK(rook_attacks_slow(D4, r_occ) == bb_of(D5, D6, D3, D2, C4, B4, E4, F4, G4));
    CHECK(rook_attacks_slow(H8, bb_of(G8, H7)) == bb_of(G8, H7));
    CHECK(rook_attacks_slow(D1, bb_of(B1, F1, D3, A1, D6)) == bb_of(C1, B1, E1, F1, D2, D3));

    // Bishop slow: empty board, single blocker, 4-direction blockers, corner, and edge.
    CHECK(bishop_attacks_slow(D4, 0ULL) == bb_of(A1, B2, C3, E5, F6, G7, H8, G1, F2, E3, C5, B6, A7));
    CHECK(bishop_attacks_slow(A1, 0ULL) == bb_of(B2, C3, D4, E5, F6, G7, H8));
    CHECK(bishop_attacks_slow(H1, 0ULL) == bb_of(G2, F3, E4, D5, C6, B7, A8));

    const Bitboard d4_bishop_single = bishop_attacks_slow(D4, square_bb(F6));
    CHECK(has_bit(d4_bishop_single, E5));
    CHECK(has_bit(d4_bishop_single, F6));
    CHECK_FALSE(has_bit(d4_bishop_single, G7));
    CHECK_FALSE(has_bit(d4_bishop_single, H8));

    const Bitboard b_occ = bb_of(F6, B6, B2, E3, G7, A1);
    CHECK(bishop_attacks_slow(D4, b_occ) == bb_of(E5, F6, C5, B6, C3, B2, E3));
    CHECK(bishop_attacks_slow(A1, bb_of(C3, E5)) == bb_of(B2, C3));
    CHECK(bishop_attacks_slow(E1, bb_of(C3, G3, B4)) == bb_of(D2, C3, F2, G3));

    // Queen slow equals rook_attacks_slow | bishop_attacks_slow and matches main slider API.
    constexpr std::array<Bitboard, 4> occupancies = {
        0ULL,
        ~0ULL,
        bb_of(D6, D2, B4, G4, F6, B6, B2, E3),
        RANK_2 | RANK_7 | FILE_C | FILE_F,
    };
    for (Bitboard occ : occupancies) {
        for (Square sq : {A1, D1, D4, E4, H5, H8}) {
            INFO("sq=" << square_to_string(sq) << " occ=" << occ);
            CHECK(queen_attacks_slow(sq, occ) ==
                  (rook_attacks_slow(sq, occ) | bishop_attacks_slow(sq, occ)));
            CHECK(rook_attacks(sq, occ) == rook_attacks_slow(sq, occ));
            CHECK(bishop_attacks(sq, occ) == bishop_attacks_slow(sq, occ));
            CHECK(queen_attacks(sq, occ) == queen_attacks_slow(sq, occ));
        }
    }
}

CPPATLAS_TEST("Position::is_square_attacked and in_check detect all piece attack types and blockers") {
    // Startpos: neither king is in check; pawn/knight squares are attacked appropriately.
    const Position sp = Position::startpos();
    CHECK_FALSE(sp.in_check());
    CHECK_FALSE(sp.is_square_attacked(E1, Color::Black));
    CHECK_FALSE(sp.is_square_attacked(E8, Color::White));
    CHECK(sp.is_square_attacked(E3, Color::White));  // d2/f2 pawns + g1 knight
    CHECK(sp.is_square_attacked(F3, Color::White));  // e2/g2 pawns + g1 knight
    CHECK_FALSE(sp.is_square_attacked(E4, Color::White));
    CHECK_FALSE(sp.is_square_attacked(E4, Color::Black));
    CHECK(sp.is_square_attacked(H6, Color::Black));  // g7 pawn + g8 knight

    // Pawn check on White king (Black pawn on d2 attacks e1).
    {
        const auto res = Position::from_fen("4k3/8/8/8/8/8/3p4/4K3 w - - 0 1");
        REQUIRE(res.has_value());
        CHECK(res->is_square_attacked(E1, Color::Black));
        CHECK(res->in_check());
        CHECK_FALSE(res->is_square_attacked(E8, Color::White));
    }

    // Pawn check on Black king (White pawn on f7 attacks e8).
    {
        const auto res = Position::from_fen("4k3/5P2/8/8/8/8/8/4K3 b - - 0 1");
        REQUIRE(res.has_value());
        CHECK(res->is_square_attacked(E8, Color::White));
        CHECK(res->in_check());
    }

    // Knight check on White king.
    {
        const auto res = Position::from_fen("4k3/8/8/8/8/5n2/8/4K3 w - - 0 1");
        REQUIRE(res.has_value());
        CHECK(res->in_check());
        CHECK(res->is_square_attacked(E1, Color::Black));
        CHECK(res->is_square_attacked(G1, Color::Black));
        CHECK_FALSE(res->is_square_attacked(F1, Color::Black));
    }

    // Unblocked vs blocked rook check.
    {
        const auto unblocked = Position::from_fen("4k3/8/8/8/4r3/8/8/4K3 w - - 0 1");
        REQUIRE(unblocked.has_value());
        CHECK(unblocked->in_check());
        CHECK(unblocked->is_square_attacked(E1, Color::Black));

        const auto blocked = Position::from_fen("4k3/8/8/8/4r3/8/4P3/4K3 w - - 0 1");
        REQUIRE(blocked.has_value());
        CHECK_FALSE(blocked->in_check());
        CHECK_FALSE(blocked->is_square_attacked(E1, Color::Black));
        CHECK(blocked->is_square_attacked(E2, Color::Black));
    }

    // Unblocked vs blocked bishop/queen diagonal check.
    {
        const auto unblocked = Position::from_fen("4k3/8/8/b7/8/8/8/4K3 w - - 0 1");
        REQUIRE(unblocked.has_value());
        CHECK(unblocked->in_check());

        const auto blocked = Position::from_fen("4k3/8/8/b7/8/2N5/8/4K3 w - - 0 1");
        REQUIRE(blocked.has_value());
        CHECK_FALSE(blocked->in_check());
        CHECK(blocked->is_square_attacked(C3, Color::Black));
    }

    // Adjacent enemy king attacks square.
    {
        const auto kings = Position::from_fen("8/8/8/4k3/8/4K3/8/8 w - - 0 1");
        REQUIRE(kings.has_value());
        CHECK(kings->is_square_attacked(E4, Color::White));
        CHECK(kings->is_square_attacked(E4, Color::Black));
        CHECK_FALSE(kings->in_check());
    }
}
