// Stage 4 - make-unmake-and-zobrist
// Spec: https://cppatlas.com/build/chess/make-unmake-and-zobrist
//
// Reversible make_move / unmake_move for every chess move type (quiet, double
// push, capture, en passant, castling, promotions, castling-right revocation)
// and incremental Zobrist hashing matching compute_hash() at every ply.
#include "support/harness.hpp"

#include <array>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace preflight {

CPPATLAS_PREFLIGHT(has_make_unmake,
                   "stage 4 (make-unmake-and-zobrist): chess::Position needs "
                   "`void make_move(Move, UndoState&)` and `void unmake_move(Move, const UndoState&)`.",
                   chess::Position,
                   requires(V& pos, chess::Move m, chess::UndoState& undo, const chess::UndoState& cundo) {
                       pos.make_move(m, undo);
                       pos.unmake_move(m, cundo);
                   });

CPPATLAS_PREFLIGHT(has_zobrist,
                   "stage 4 (make-unmake-and-zobrist): chess::Position needs "
                   "`std::uint64_t hash() const` and `std::uint64_t compute_hash() const`.",
                   chess::Position,
                   requires(const V& pos) {
                       { pos.hash() } -> std::same_as<std::uint64_t>;
                       { pos.compute_hash() } -> std::same_as<std::uint64_t>;
                   });

CPPATLAS_PREFLIGHT(has_undo_state,
                   "stage 4 (make-unmake-and-zobrist): chess::UndoState needs "
                   "`captured`, `castling_rights`, `en_passant`, `halfmove_clock`, and `prev_hash`.",
                   chess::UndoState,
                   requires(V u) {
                       { u.captured } -> std::convertible_to<chess::Piece>;
                       { u.castling_rights } -> std::convertible_to<std::uint8_t>;
                       { u.en_passant } -> std::convertible_to<chess::Square>;
                       { u.halfmove_clock } -> std::convertible_to<std::uint16_t>;
                       { u.prev_hash } -> std::convertible_to<std::uint64_t>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_make_unmake && preflight::has_zobrist && preflight::has_undo_state);

namespace {

using namespace chess;

struct PositionSnapshot {
    std::string fen;
    std::uint64_t hash = 0;
    Bitboard all = 0;
    std::array<Bitboard, 2> by_color{};
    std::array<Bitboard, 6> by_type{};
    std::array<std::array<Bitboard, 6>, 2> by_cp{};
    std::array<Square, 2> king_sq{};
    Color stm = Color::None;
    std::uint8_t castling = NO_CASTLING;
    Square ep = SQ_NONE;
    std::uint16_t halfmove = 0;
    std::uint16_t fullmove = 0;
    std::array<Piece, 64> mailbox{};

    static PositionSnapshot capture(const Position& pos) {
        PositionSnapshot s;
        s.fen = pos.to_fen();
        s.hash = pos.hash();
        s.all = pos.pieces();
        s.by_color[0] = pos.pieces(Color::White);
        s.by_color[1] = pos.pieces(Color::Black);
        for (int pt = 0; pt < 6; ++pt) {
            const auto t = static_cast<PieceType>(pt);
            s.by_type[static_cast<std::size_t>(pt)] = pos.pieces(t);
            s.by_cp[0][static_cast<std::size_t>(pt)] = pos.pieces(Color::White, t);
            s.by_cp[1][static_cast<std::size_t>(pt)] = pos.pieces(Color::Black, t);
        }
        s.king_sq[0] = pos.king_square(Color::White);
        s.king_sq[1] = pos.king_square(Color::Black);
        s.stm = pos.side_to_move();
        s.castling = pos.castling_rights();
        s.ep = pos.en_passant_square();
        s.halfmove = pos.halfmove_clock();
        s.fullmove = pos.fullmove_number();
        for (Square sq = 0; sq < 64; ++sq) {
            s.mailbox[sq] = pos.piece_at(sq);
        }
        return s;
    }

    void check_matches(const Position& pos, std::string_view label) const {
        INFO("restoration check: " << label);
        CHECK_MESSAGE(pos.to_fen() == fen, "FEN mismatch after unmake: got \"" << pos.to_fen()
                                                                                << "\", expected \"" << fen << "\"");
        CHECK_MESSAGE(pos.hash() == hash, "hash() mismatch after unmake");
        CHECK_MESSAGE(pos.compute_hash() == hash, "compute_hash() mismatch after unmake");
        CHECK(pos.pieces() == all);
        CHECK(pos.pieces(Color::White) == by_color[0]);
        CHECK(pos.pieces(Color::Black) == by_color[1]);
        for (int pt = 0; pt < 6; ++pt) {
            const auto t = static_cast<PieceType>(pt);
            CHECK(pos.pieces(t) == by_type[static_cast<std::size_t>(pt)]);
            CHECK(pos.pieces(Color::White, t) == by_cp[0][static_cast<std::size_t>(pt)]);
            CHECK(pos.pieces(Color::Black, t) == by_cp[1][static_cast<std::size_t>(pt)]);
        }
        CHECK(pos.king_square(Color::White) == king_sq[0]);
        CHECK(pos.king_square(Color::Black) == king_sq[1]);
        CHECK(pos.side_to_move() == stm);
        CHECK(pos.castling_rights() == castling);
        CHECK(pos.en_passant_square() == ep);
        CHECK(pos.halfmove_clock() == halfmove);
        CHECK(pos.fullmove_number() == fullmove);
        for (Square sq = 0; sq < 64; ++sq) {
            CHECK_MESSAGE(pos.piece_at(sq) == mailbox[sq],
                          "mailbox piece mismatch at " << square_to_string(sq));
        }
    }
};

void check_bitboard_sync(const Position& pos, std::string_view label) {
    INFO("bitboard sync check: " << label);
    Bitboard all = 0;
    Bitboard w = 0;
    Bitboard b = 0;
    for (Square sq = 0; sq < 64; ++sq) {
        const Piece p = pos.piece_at(sq);
        if (p == Piece::None) continue;
        const Bitboard bit = square_bb(sq);
        all |= bit;
        if (color_of(p) == Color::White) {
            w |= bit;
        } else {
            b |= bit;
        }
    }
    CHECK(pos.pieces() == all);
    CHECK(pos.pieces(Color::White) == w);
    CHECK(pos.pieces(Color::Black) == b);
    CHECK(pos.king_square(Color::White) == lsb(pos.pieces(Color::White, PieceType::King)));
    CHECK(pos.king_square(Color::Black) == lsb(pos.pieces(Color::Black, PieceType::King)));
}

Position must_parse(std::string_view fen) {
    const auto res = Position::from_fen(fen);
    REQUIRE_MESSAGE(res.has_value(), "failed to parse FEN \"" << fen << "\": "
                                                              << (res.has_value() ? "" : res.error()));
    return *res;
}

void verify_make_unmake(std::string_view start_fen, Move m, std::string_view expected_fen, std::string_view label) {
    Position pos = must_parse(start_fen);
    const PositionSnapshot before = PositionSnapshot::capture(pos);
    INFO("move: " << m.to_uci() << " (" << label << ")");
    CHECK(pos.hash() == pos.compute_hash());

    UndoState undo{};
    pos.make_move(m, undo);

    CHECK_MESSAGE(pos.to_fen() == expected_fen,
                  "after " << label << " (" << m.to_uci() << "), to_fen() was \"" << pos.to_fen()
                           << "\", expected \"" << expected_fen << "\"");
    CHECK_MESSAGE(pos.hash() == pos.compute_hash(),
                  "after make_move(" << m.to_uci() << "), incremental hash() != compute_hash()");
    check_bitboard_sync(pos, label);

    pos.unmake_move(m, undo);
    before.check_matches(pos, label);
}

}  // namespace

CPPATLAS_TEST("quiet moves and double pawn pushes update metadata, ep square, and restore cleanly") {
    // Quiet knight move by White: increments halfmove clock, keeps fullmove number.
    verify_make_unmake("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 3 5",
                       Move(G1, F3, MoveFlag::Quiet),
                       "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 4 5",
                       "White quiet knight move");

    // Quiet knight move by Black: increments halfmove clock AND fullmove number.
    verify_make_unmake("rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 4 5",
                       Move(G8, F6, MoveFlag::Quiet),
                       "rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 5 6",
                       "Black quiet knight move");

    // Single pawn push resets halfmove clock to 0.
    verify_make_unmake("4k3/8/8/8/8/8/4P3/4K3 w - - 7 12",
                       Move(E2, E3, MoveFlag::Quiet),
                       "4k3/8/8/8/8/4P3/8/4K3 b - - 0 12",
                       "White single pawn push resets halfmove clock");

    // White double pawn push sets en_passant_square to E3 and resets halfmove clock.
    {
        Position pos = must_parse("4k3/8/8/8/3p4/8/4P3/4K3 w - - 5 10");
        const PositionSnapshot before = PositionSnapshot::capture(pos);
        UndoState undo{};
        const Move m(E2, E4, MoveFlag::DoublePawnPush);
        pos.make_move(m, undo);
        CHECK(pos.to_fen() == "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 10");
        CHECK(pos.en_passant_square() == E3);
        CHECK(pos.halfmove_clock() == 0);
        CHECK(pos.side_to_move() == Color::Black);
        CHECK(pos.fullmove_number() == 10);
        CHECK(pos.hash() == pos.compute_hash());
        pos.unmake_move(m, undo);
        before.check_matches(pos, "White double pawn push");
    }

    // Black double pawn push sets en_passant_square to C6 and increments fullmove_number.
    {
        Position pos = must_parse("4k3/2p5/8/3P4/8/8/8/4K3 b - - 6 10");
        const PositionSnapshot before = PositionSnapshot::capture(pos);
        UndoState undo{};
        const Move m(C7, C5, MoveFlag::DoublePawnPush);
        pos.make_move(m, undo);
        CHECK(pos.to_fen() == "4k3/8/8/2pP4/8/8/8/4K3 w - c6 0 11");
        CHECK(pos.en_passant_square() == C6);
        CHECK(pos.halfmove_clock() == 0);
        CHECK(pos.side_to_move() == Color::White);
        CHECK(pos.fullmove_number() == 11);
        CHECK(pos.hash() == pos.compute_hash());
        pos.unmake_move(m, undo);
        before.check_matches(pos, "Black double pawn push");
    }
}

CPPATLAS_TEST("normal captures remove enemy piece, reset halfmove clock, and restore on unmake") {
    verify_make_unmake("4k3/8/8/4n3/3B4/8/8/4K3 w - - 9 20",
                       Move(D4, E5, MoveFlag::Capture),
                       "4k3/8/8/4B3/8/8/8/4K3 b - - 0 20",
                       "White bishop captures Black knight");

    verify_make_unmake("4k3/8/8/4n3/3B4/8/8/4K3 b - - 9 20",
                       Move(E5, D4, MoveFlag::Capture),
                       "4k3/8/8/8/3n4/8/8/4K3 w - - 0 21",
                       "Black knight captures White bishop");
}

CPPATLAS_TEST("en passant captures for White and Black remove the adjacent pawn and restore both pawns") {
    // White en passant: e5xd6 removes Black pawn on d5.
    {
        Position pos = must_parse("4k3/8/8/3pP3/8/8/8/4K3 w - d6 4 15");
        const PositionSnapshot before = PositionSnapshot::capture(pos);
        UndoState undo{};
        const Move m(E5, D6, MoveFlag::EnPassant);
        pos.make_move(m, undo);
        CHECK(pos.to_fen() == "4k3/8/3P4/8/8/8/8/4K3 b - - 0 15");
        CHECK(pos.piece_at(D6) == Piece::WhitePawn);
        CHECK_MESSAGE(pos.piece_at(D5) == Piece::None,
                      "en passant capture must remove the enemy pawn on D5 (adjacent file, not target D6)");
        CHECK(pos.piece_at(E5) == Piece::None);
        CHECK(pos.en_passant_square() == SQ_NONE);
        CHECK(pos.hash() == pos.compute_hash());
        pos.unmake_move(m, undo);
        before.check_matches(pos, "White en passant");
    }

    // Black en passant: d4xe3 removes White pawn on e4.
    {
        Position pos = must_parse("4k3/8/8/8/3pP3/8/8/4K3 b - e3 4 15");
        const PositionSnapshot before = PositionSnapshot::capture(pos);
        UndoState undo{};
        const Move m(D4, E3, MoveFlag::EnPassant);
        pos.make_move(m, undo);
        CHECK(pos.to_fen() == "4k3/8/8/8/8/4p3/8/4K3 w - - 0 16");
        CHECK(pos.piece_at(E3) == Piece::BlackPawn);
        CHECK_MESSAGE(pos.piece_at(E4) == Piece::None,
                      "Black en passant capture must remove the enemy pawn on E4");
        CHECK(pos.piece_at(D4) == Piece::None);
        CHECK(pos.en_passant_square() == SQ_NONE);
        CHECK(pos.hash() == pos.compute_hash());
        pos.unmake_move(m, undo);
        before.check_matches(pos, "Black en passant");
    }
}

CPPATLAS_TEST("kingside and queenside castling move both king and rook and restore cleanly") {
    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 2 20",
                       Move(E1, G1, MoveFlag::KingCastle),
                       "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 3 20",
                       "White kingside castle");

    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 2 20",
                       Move(E1, C1, MoveFlag::QueenCastle),
                       "r3k2r/8/8/8/8/8/8/2KR3R b kq - 3 20",
                       "White queenside castle");

    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 2 20",
                       Move(E8, G8, MoveFlag::KingCastle),
                       "r4rk1/8/8/8/8/8/8/R3K2R w KQ - 3 21",
                       "Black kingside castle");

    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 2 20",
                       Move(E8, C8, MoveFlag::QueenCastle),
                       "2kr3r/8/8/8/8/8/8/R3K2R w KQ - 3 21",
                       "Black queenside castle");
}

CPPATLAS_TEST("castling rights are revoked by king moves, rook moves, and rook captures on home squares") {
    // King move revokes both of White's castling rights.
    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
                       Move(E1, E2, MoveFlag::Quiet),
                       "r3k2r/8/8/8/8/8/4K3/R6R b kq - 1 1",
                       "White king move clears KQ");

    // Rook moves revoke only the corresponding wing's castling right.
    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
                       Move(H1, G1, MoveFlag::Quiet),
                       "r3k2r/8/8/8/8/8/8/R3K1R1 b Qkq - 1 1",
                       "White H1 rook move clears K");

    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
                       Move(A1, B1, MoveFlag::Quiet),
                       "r3k2r/8/8/8/8/8/8/1R2K2R b Kkq - 1 1",
                       "White A1 rook move clears Q");

    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1",
                       Move(H8, G8, MoveFlag::Quiet),
                       "r3k1r1/8/8/8/8/8/8/R3K2R w KQq - 1 2",
                       "Black H8 rook move clears k");

    verify_make_unmake("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1",
                       Move(A8, B8, MoveFlag::Quiet),
                       "1r2k2r/8/8/8/8/8/8/R3K2R w KQk - 1 2",
                       "Black A8 rook move clears q");

    // Capturing an unmoved rook on its home square must revoke that rook's castling right.
    verify_make_unmake("r3k2r/8/8/8/8/8/1b6/R3K2R b KQkq - 0 1",
                       Move(B2, A1, MoveFlag::Capture),
                       "r3k2r/8/8/8/8/8/8/b3K2R w Kkq - 0 2",
                       "Bxa1 revokes WHITE_OOO");

    verify_make_unmake("r3k2r/6B1/8/8/8/8/8/R3K2R w KQkq - 0 1",
                       Move(G7, H8, MoveFlag::Capture),
                       "r3k2B/8/8/8/8/8/8/R3K2R b KQq - 0 1",
                       "Bxh8 revokes BLACK_OO");
}

CPPATLAS_TEST("all four promotion types (quiet and capture) for White and Black update and restore") {
    struct PromoCase {
        MoveFlag flag;
        char white_char;
        char black_char;
    };

    constexpr std::array<PromoCase, 4> quiet_promos = {{
        {MoveFlag::PromoKnight, 'N', 'n'},
        {MoveFlag::PromoBishop, 'B', 'b'},
        {MoveFlag::PromoRook, 'R', 'r'},
        {MoveFlag::PromoQueen, 'Q', 'q'},
    }};

    for (const auto& pc : quiet_promos) {
        const std::string w_expected = std::string("k3") + pc.white_char + "3/8/8/8/8/8/8/4K3 b - - 0 30";
        verify_make_unmake("k7/4P3/8/8/8/8/8/4K3 w - - 5 30",
                           Move(E7, E8, pc.flag),
                           w_expected,
                           "White quiet promotion");

        const std::string b_expected = std::string("4k3/8/8/8/8/8/8/K3") + pc.black_char + "3 w - - 0 31";
        verify_make_unmake("4k3/8/8/8/8/8/4p3/K7 b - - 5 30",
                           Move(E2, E1, pc.flag),
                           b_expected,
                           "Black quiet promotion");
    }

    constexpr std::array<PromoCase, 4> cap_promos = {{
        {MoveFlag::PromoCaptureKnight, 'N', 'n'},
        {MoveFlag::PromoCaptureBishop, 'B', 'b'},
        {MoveFlag::PromoCaptureRook, 'R', 'r'},
        {MoveFlag::PromoCaptureQueen, 'Q', 'q'},
    }};

    for (const auto& pc : cap_promos) {
        const std::string w_expected = std::string("k2") + pc.white_char + "4/8/8/8/8/8/8/4K3 b - - 0 30";
        verify_make_unmake("k2n4/4P3/8/8/8/8/8/4K3 w - - 5 30",
                           Move(E7, D8, pc.flag),
                           w_expected,
                           "White capture promotion");

        const std::string b_expected = std::string("4k3/8/8/8/8/8/8/K2") + pc.black_char + "4 w - - 0 31";
        verify_make_unmake("4k3/8/8/8/8/8/4p3/K2R4 b - - 5 30",
                           Move(E2, D1, pc.flag),
                           b_expected,
                           "Black capture promotion");
    }
}

CPPATLAS_TEST("nested 8-ply make/unmake sequence restores Kiwipete bit-for-bit") {
    constexpr std::string_view kiwipete =
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    Position pos = must_parse(kiwipete);
    const PositionSnapshot root = PositionSnapshot::capture(pos);

    const std::array<Move, 8> line = {
        Move(E1, G1, MoveFlag::KingCastle),
        Move(H3, G2, MoveFlag::Capture),
        Move(F3, F6, MoveFlag::Capture),
        Move(E7, F6, MoveFlag::Capture),
        Move(D5, E6, MoveFlag::Capture),
        Move(E8, C8, MoveFlag::QueenCastle),
        Move(A2, A4, MoveFlag::DoublePawnPush),
        Move(B4, A3, MoveFlag::EnPassant),
    };

    std::vector<UndoState> undos(line.size());
    std::vector<PositionSnapshot> ply_snaps;
    ply_snaps.reserve(line.size());

    for (std::size_t i = 0; i < line.size(); ++i) {
        ply_snaps.push_back(PositionSnapshot::capture(pos));
        pos.make_move(line[i], undos[i]);
        INFO("after ply " << (i + 1) << ": " << line[i].to_uci());
        CHECK(pos.hash() == pos.compute_hash());
        check_bitboard_sync(pos, "nested ply");
    }

    for (std::size_t i = line.size(); i-- > 0;) {
        pos.unmake_move(line[i], undos[i]);
        ply_snaps[i].check_matches(pos, "unmaking nested ply");
    }
    root.check_matches(pos, "full nested line unmake");
}

CPPATLAS_TEST("Zobrist hash matches compute_hash, agrees on transpositions, and distinguishes states") {
    // 1. Nf3 Nf6 2. Nc3 Nc6  vs  1. Nc3 Nc6 2. Nf3 Nf6
    Position p1 = Position::startpos();
    Position p2 = Position::startpos();
    REQUIRE(p1.to_fen() == STARTPOS_FEN);
    CHECK(p1.hash() != 0ULL);
    CHECK(p1.hash() == p1.compute_hash());

    UndoState u{};
    p1.make_move(Move(G1, F3, MoveFlag::Quiet), u);
    p1.make_move(Move(G8, F6, MoveFlag::Quiet), u);
    p1.make_move(Move(B1, C3, MoveFlag::Quiet), u);
    p1.make_move(Move(B8, C6, MoveFlag::Quiet), u);

    p2.make_move(Move(B1, C3, MoveFlag::Quiet), u);
    p2.make_move(Move(B8, C6, MoveFlag::Quiet), u);
    p2.make_move(Move(G1, F3, MoveFlag::Quiet), u);
    p2.make_move(Move(G8, F6, MoveFlag::Quiet), u);

    CHECK(p1.to_fen() == p2.to_fen());
    CHECK(p1.hash() == p1.compute_hash());
    CHECK(p2.hash() == p2.compute_hash());
    CHECK_MESSAGE(p1.hash() == p2.hash(),
                  "transposition via different move orders must produce the exact same Zobrist hash");

    // Distinct side to move, en passant square, and castling rights produce distinct hashes.
    const Position base = must_parse("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1");
    const Position flipped_stm = must_parse("4k3/8/8/3pP3/8/8/8/4K3 b - - 0 1");
    const Position with_ep = must_parse("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");

    CHECK(base.hash() != 0ULL);
    CHECK(base.hash() == base.compute_hash());
    CHECK(flipped_stm.hash() == flipped_stm.compute_hash());
    CHECK(with_ep.hash() == with_ep.compute_hash());
    CHECK(base.hash() != flipped_stm.hash());
    CHECK(base.hash() != with_ep.hash());
    CHECK(flipped_stm.hash() != with_ep.hash());

    const Position c_all = must_parse("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const Position c_kq = must_parse("r3k2r/8/8/8/8/8/8/R3K2R w Kq - 0 1");
    const Position c_none = must_parse("r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1");
    CHECK(c_all.hash() != c_kq.hash());
    CHECK(c_all.hash() != c_none.hash());
    CHECK(c_kq.hash() != c_none.hash());
}
