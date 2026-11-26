// Stage 1 - board-and-fen
// Spec: https://cppatlas.com/build/chess/board-and-fen
//
// Board representation (64-square mailbox + piece/color bitboards) and FEN
// parsing/serialization via std::expected.
#include "support/harness.hpp"

#include <array>
#include <cstdint>
#include <string>
#include <string_view>

namespace preflight {

CPPATLAS_PREFLIGHT(has_from_fen,
                   "stage 1 (board-and-fen): chess::Position needs "
                   "`static std::expected<Position, std::string> from_fen(std::string_view)`.",
                   chess::Position,
                   requires(std::string_view fen) {
                       { V::from_fen(fen) } -> std::same_as<std::expected<V, std::string>>;
                   });

CPPATLAS_PREFLIGHT(has_startpos,
                   "stage 1 (board-and-fen): chess::Position needs `static Position startpos()`.",
                   chess::Position,
                   requires {
                       { V::startpos() } -> std::same_as<V>;
                   });

CPPATLAS_PREFLIGHT(has_to_fen,
                   "stage 1 (board-and-fen): chess::Position needs `std::string to_fen() const`.",
                   chess::Position,
                   requires(const V& pos) {
                       { pos.to_fen() } -> std::same_as<std::string>;
                   });

CPPATLAS_PREFLIGHT(has_piece_at,
                   "stage 1 (board-and-fen): chess::Position needs `Piece piece_at(Square sq) const`.",
                   chess::Position,
                   requires(const V& pos, chess::Square sq) {
                       { pos.piece_at(sq) } -> std::same_as<chess::Piece>;
                   });

CPPATLAS_PREFLIGHT(has_pieces,
                   "stage 1 (board-and-fen): chess::Position needs `pieces()`, `pieces(Color)`, "
                   "`pieces(PieceType)`, and `pieces(Color, PieceType)` returning `chess::Bitboard`.",
                   chess::Position,
                   requires(const V& pos, chess::Color c, chess::PieceType pt) {
                       { pos.pieces() } -> std::same_as<chess::Bitboard>;
                       { pos.pieces(c) } -> std::same_as<chess::Bitboard>;
                       { pos.pieces(pt) } -> std::same_as<chess::Bitboard>;
                       { pos.pieces(c, pt) } -> std::same_as<chess::Bitboard>;
                   });

CPPATLAS_PREFLIGHT(has_king_square,
                   "stage 1 (board-and-fen): chess::Position needs `Square king_square(Color c) const`.",
                   chess::Position,
                   requires(const V& pos, chess::Color c) {
                       { pos.king_square(c) } -> std::same_as<chess::Square>;
                   });

CPPATLAS_PREFLIGHT(has_metadata,
                   "stage 1 (board-and-fen): chess::Position needs `side_to_move()`, `castling_rights()`, "
                   "`en_passant_square()`, `halfmove_clock()`, and `fullmove_number()` const accessors.",
                   chess::Position,
                   requires(const V& pos) {
                       { pos.side_to_move() } -> std::same_as<chess::Color>;
                       { pos.castling_rights() } -> std::same_as<std::uint8_t>;
                       { pos.en_passant_square() } -> std::same_as<chess::Square>;
                       { pos.halfmove_clock() } -> std::same_as<std::uint16_t>;
                       { pos.fullmove_number() } -> std::same_as<std::uint16_t>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_from_fen && preflight::has_startpos && preflight::has_to_fen &&
                    preflight::has_piece_at && preflight::has_pieces && preflight::has_king_square &&
                    preflight::has_metadata);

namespace {

using namespace chess;

void check_bitboard_mailbox_consistency(const Position& pos, std::string_view context) {
    Bitboard expected_all = 0;
    std::array<Bitboard, 2> expected_color{};
    std::array<Bitboard, 6> expected_type{};
    std::array<std::array<Bitboard, 6>, 2> expected_cp{};

    for (Square sq = 0; sq < 64; ++sq) {
        const Piece p = pos.piece_at(sq);
        if (p == Piece::None) continue;
        const Color c = color_of(p);
        const PieceType pt = type_of(p);
        REQUIRE(c != Color::None);
        REQUIRE(pt != PieceType::None);
        const Bitboard bit = square_bb(sq);
        expected_all |= bit;
        expected_color[static_cast<std::size_t>(c)] |= bit;
        expected_type[static_cast<std::size_t>(pt)] |= bit;
        expected_cp[static_cast<std::size_t>(c)][static_cast<std::size_t>(pt)] |= bit;
    }

    INFO("context: " << context);
    CHECK_MESSAGE(pos.pieces() == expected_all,
                  "pieces() bitboard does not match non-empty squares in piece_at()");
    CHECK_MESSAGE(pos.pieces(Color::White) == expected_color[0],
                  "pieces(White) bitboard does not match White pieces in piece_at()");
    CHECK_MESSAGE(pos.pieces(Color::Black) == expected_color[1],
                  "pieces(Black) bitboard does not match Black pieces in piece_at()");
    CHECK_MESSAGE((pos.pieces(Color::White) & pos.pieces(Color::Black)) == 0,
                  "White and Black bitboards must be disjoint");
    CHECK_MESSAGE((pos.pieces(Color::White) | pos.pieces(Color::Black)) == pos.pieces(),
                  "pieces(White) | pieces(Black) must equal pieces()");

    constexpr std::array<PieceType, 6> types = {PieceType::Pawn, PieceType::Knight, PieceType::Bishop,
                                                PieceType::Rook, PieceType::Queen,  PieceType::King};
    for (PieceType pt : types) {
        const auto idx = static_cast<std::size_t>(pt);
        CHECK_MESSAGE(pos.pieces(pt) == expected_type[idx],
                      "pieces(PieceType) mismatch for piece type index " << idx);
        CHECK_MESSAGE(pos.pieces(Color::White, pt) == expected_cp[0][idx],
                      "pieces(White, PieceType) mismatch for piece type index " << idx);
        CHECK_MESSAGE(pos.pieces(Color::Black, pt) == expected_cp[1][idx],
                      "pieces(Black, PieceType) mismatch for piece type index " << idx);
    }

    CHECK(popcount(pos.pieces(Color::White, PieceType::King)) == 1);
    CHECK(popcount(pos.pieces(Color::Black, PieceType::King)) == 1);
    CHECK(pos.king_square(Color::White) == lsb(pos.pieces(Color::White, PieceType::King)));
    CHECK(pos.king_square(Color::Black) == lsb(pos.pieces(Color::Black, PieceType::King)));
}

}  // namespace

CPPATLAS_TEST("Position::startpos and from_fen(STARTPOS_FEN) match and round-trip") {
    const auto parsed = Position::from_fen(STARTPOS_FEN);
    REQUIRE_MESSAGE(parsed.has_value(),
                    "Position::from_fen(STARTPOS_FEN) failed: " << (parsed.has_value() ? "" : parsed.error()));

    const Position sp = Position::startpos();
    CHECK_MESSAGE(sp.to_fen() == STARTPOS_FEN,
                  "startpos().to_fen() returned \"" << sp.to_fen() << "\", expected \"" << STARTPOS_FEN << "\"");
    CHECK_MESSAGE(parsed->to_fen() == STARTPOS_FEN,
                  "from_fen(STARTPOS_FEN)->to_fen() returned \"" << parsed->to_fen() << "\", expected \""
                                                                 << STARTPOS_FEN << "\"");

    CHECK(sp.side_to_move() == Color::White);
    CHECK(sp.castling_rights() == ALL_CASTLING);
    CHECK(sp.en_passant_square() == SQ_NONE);
    CHECK(sp.halfmove_clock() == 0);
    CHECK(sp.fullmove_number() == 1);

    CHECK(parsed->side_to_move() == Color::White);
    CHECK(parsed->castling_rights() == ALL_CASTLING);
    CHECK(parsed->en_passant_square() == SQ_NONE);
    CHECK(parsed->halfmove_clock() == 0);
    CHECK(parsed->fullmove_number() == 1);
}

CPPATLAS_TEST("startpos places all 32 pieces on exact squares with empty middle ranks") {
    const Position pos = Position::startpos();

    constexpr std::array<PieceType, 8> back_rank = {PieceType::Rook,   PieceType::Knight, PieceType::Bishop,
                                                    PieceType::Queen,  PieceType::King,   PieceType::Bishop,
                                                    PieceType::Knight, PieceType::Rook};

    for (int file = 0; file < 8; ++file) {
        const Square w_back = make_square(file, 0);
        const Square w_pawn = make_square(file, 1);
        const Square b_pawn = make_square(file, 6);
        const Square b_back = make_square(file, 7);

        CHECK_MESSAGE(pos.piece_at(w_back) == make_piece(Color::White, back_rank[static_cast<std::size_t>(file)]),
                      "wrong piece at " << square_to_string(w_back));
        CHECK_MESSAGE(pos.piece_at(w_pawn) == Piece::WhitePawn, "wrong piece at " << square_to_string(w_pawn));
        CHECK_MESSAGE(pos.piece_at(b_pawn) == Piece::BlackPawn, "wrong piece at " << square_to_string(b_pawn));
        CHECK_MESSAGE(pos.piece_at(b_back) == make_piece(Color::Black, back_rank[static_cast<std::size_t>(file)]),
                      "wrong piece at " << square_to_string(b_back));

        for (int rank = 2; rank <= 5; ++rank) {
            const Square empty_sq = make_square(file, rank);
            CHECK_MESSAGE(pos.piece_at(empty_sq) == Piece::None,
                          "expected empty square at " << square_to_string(empty_sq));
        }
    }

    CHECK(pos.king_square(Color::White) == E1);
    CHECK(pos.king_square(Color::Black) == E8);
}

CPPATLAS_TEST("startpos bitboards match mailbox across all colors and piece types") {
    const Position pos = Position::startpos();

    CHECK(popcount(pos.pieces()) == 32);
    CHECK(popcount(pos.pieces(Color::White)) == 16);
    CHECK(popcount(pos.pieces(Color::Black)) == 16);
    CHECK(popcount(pos.pieces(Color::White, PieceType::Pawn)) == 8);
    CHECK(popcount(pos.pieces(Color::Black, PieceType::Pawn)) == 8);
    CHECK(popcount(pos.pieces(PieceType::Knight)) == 4);
    CHECK(popcount(pos.pieces(PieceType::Bishop)) == 4);
    CHECK(popcount(pos.pieces(PieceType::Rook)) == 4);
    CHECK(popcount(pos.pieces(PieceType::Queen)) == 2);
    CHECK(popcount(pos.pieces(PieceType::King)) == 2);

    check_bitboard_mailbox_consistency(pos, "startpos");
}

CPPATLAS_TEST("custom midgame and endgame FENs parse metadata accurately and round-trip") {
    struct FenExpectation {
        std::string_view fen;
        Color stm;
        std::uint8_t castling;
        Square ep;
        std::uint16_t halfmove;
        std::uint16_t fullmove;
        Square white_king;
        Square black_king;
    };

    constexpr std::array<FenExpectation, 4> cases = {{
        {"r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b Kq - 4 6",
         Color::Black, WHITE_OO | BLACK_OOO, SQ_NONE, 4, 6, E1, E8},
        {"rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2",
         Color::Black, ALL_CASTLING, E3, 0, 2, E1, E8},
        {"r3k2r/ppp2ppp/2n5/3pP3/8/8/PPP2PPP/R3K2R w k d6 12 19",
         Color::White, BLACK_OO, D6, 12, 19, E1, E8},
        {"8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 47 89",
         Color::Black, NO_CASTLING, SQ_NONE, 47, 89, A5, H4},
    }};

    for (const auto& tc : cases) {
        INFO("FEN: " << tc.fen);
        const auto res = Position::from_fen(tc.fen);
        REQUIRE_MESSAGE(res.has_value(),
                        "from_fen rejected valid FEN: " << (res.has_value() ? "" : res.error()));
        const Position& pos = *res;
        CHECK(pos.to_fen() == tc.fen);
        CHECK(pos.side_to_move() == tc.stm);
        CHECK(pos.castling_rights() == tc.castling);
        CHECK(pos.en_passant_square() == tc.ep);
        CHECK(pos.halfmove_clock() == tc.halfmove);
        CHECK(pos.fullmove_number() == tc.fullmove);
        CHECK(pos.king_square(Color::White) == tc.white_king);
        CHECK(pos.king_square(Color::Black) == tc.black_king);
        check_bitboard_mailbox_consistency(pos, tc.fen);
    }
}

CPPATLAS_TEST("from_fen rejects empty and structurally malformed FENs with non-empty error") {
    constexpr std::array<std::string_view, 7> bad_fens = {
        "",
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1",                      // 7 ranks
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR/8 w KQkq - 0 1",           // 9 ranks
        "rnbqkbn/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",              // rank 8 has 7 files
        "rnbqkbnrr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",            // rank 8 has 9 files
        "rnbqkbnr/ppppppp2/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",             // digit overflow (7 + 2 = 9)
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",                          // missing fields
    };

    for (const std::string_view fen : bad_fens) {
        INFO("malformed FEN: \"" << fen << "\"");
        const auto res = Position::from_fen(fen);
        CHECK_MESSAGE(!res.has_value(), "expected from_fen to fail on malformed FEN");
        if (!res.has_value()) {
            CHECK_MESSAGE(!res.error().empty(), "expected non-empty diagnostic error message");
        }
    }
}

CPPATLAS_TEST("from_fen rejects invalid piece, side, castling, en passant, and clock fields") {
    constexpr std::array<std::string_view, 9> bad_fens = {
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPXPPP/RNBQKBNR w KQkq - 0 1",             // invalid piece 'X'
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1",             // invalid side 'x'
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR white KQkq - 0 1",         // invalid side "white"
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w X - 0 1",                // invalid castling 'X'
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQx - 0 1",              // invalid castling char 'x'
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e9 0 1",            // invalid ep rank
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq i3 0 1",            // invalid ep file
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq abc 0 1",           // invalid ep length
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1",            // negative halfmove clock
    };

    for (const std::string_view fen : bad_fens) {
        INFO("invalid-field FEN: \"" << fen << "\"");
        const auto res = Position::from_fen(fen);
        CHECK_MESSAGE(!res.has_value(), "expected from_fen to fail on invalid field");
        if (!res.has_value()) {
            CHECK_MESSAGE(!res.error().empty(), "expected non-empty diagnostic error message");
        }
    }
}

CPPATLAS_TEST("from_fen rejects missing or duplicate kings") {
    constexpr std::array<std::string_view, 4> bad_kings = {
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w kq - 0 1",               // missing white king
        "rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1",               // missing black king
        "rnbqkbnr/pppppppp/8/8/8/3K4/PPPPPPPP/RNBQKBNR w KQkq - 0 1",           // duplicate white king
        "rnbqkbnr/pppppppp/8/3k4/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",           // duplicate black king
    };

    for (const std::string_view fen : bad_kings) {
        INFO("bad-king FEN: \"" << fen << "\"");
        const auto res = Position::from_fen(fen);
        CHECK_MESSAGE(!res.has_value(), "expected from_fen to reject missing/duplicate king");
        if (!res.has_value()) {
            CHECK_MESSAGE(!res.error().empty(), "expected non-empty diagnostic error message");
        }
    }
}
