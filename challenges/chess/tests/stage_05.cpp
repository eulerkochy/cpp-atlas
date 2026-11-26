// Stage 5 - movegen-and-perft
// Spec: https://cppatlas.com/build/chess/movegen-and-perft
//
// Pseudo-legal & legal move generation (pins, double check, en passant
// horizontal pin, castling legality, promotions), capture/promotion filtering,
// UCI move parsing, and exact Perft node counts.
#include "support/harness.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <optional>
#include <set>
#include <string>
#include <string_view>

namespace preflight {

CPPATLAS_PREFLIGHT(has_movelist,
                   "stage 5 (movegen-and-perft): chess::MoveList needs `push_back`, `size`, "
                   "`empty`, `clear`, `contains`, and range iteration.",
                   chess::MoveList,
                   requires(V list, const V& clist, chess::Move m) {
                       list.push_back(m);
                       list.clear();
                       { clist.size() } -> std::same_as<std::size_t>;
                       { clist.empty() } -> std::same_as<bool>;
                       { clist.contains(m) } -> std::same_as<bool>;
                       { clist.begin() } -> std::same_as<const chess::Move*>;
                       { clist.end() } -> std::same_as<const chess::Move*>;
                   });

CPPATLAS_PREFLIGHT(has_movegen_fns,
                   "stage 5 (movegen-and-perft): movegen.hpp needs `generate_pseudo_legal_moves`, "
                   "`generate_legal_moves`, `generate_legal_captures`, `parse_uci_move`, and `perft`.",
                   chess::Position,
                   requires(V& pos, const V& cpos, chess::MoveList& out, std::string_view uci, int depth) {
                       chess::generate_pseudo_legal_moves(cpos, out);
                       chess::generate_legal_moves(pos, out);
                       chess::generate_legal_captures(pos, out);
                       { chess::parse_uci_move(pos, uci) } -> std::same_as<std::optional<chess::Move>>;
                       { chess::perft(pos, depth) } -> std::same_as<std::uint64_t>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_movelist && preflight::has_movegen_fns);

namespace {

using namespace chess;

Position must_parse(std::string_view fen) {
    const auto res = Position::from_fen(fen);
    REQUIRE_MESSAGE(res.has_value(), "failed to parse FEN \"" << fen << "\": "
                                                              << (res.has_value() ? "" : res.error()));
    return *res;
}

bool has_uci(const MoveList& list, std::string_view uci) {
    for (const Move m : list) {
        if (m.to_uci() == uci) return true;
    }
    return false;
}

std::set<std::string> uci_set(const MoveList& list) {
    std::set<std::string> out;
    for (const Move m : list) {
        out.insert(m.to_uci());
    }
    return out;
}

}  // namespace

CPPATLAS_TEST("startpos has 20 unique legal moves and parse_uci_move validates moves") {
    Position pos = Position::startpos();
    MoveList legal;
    MoveList pseudo;
    generate_legal_moves(pos, legal);
    generate_pseudo_legal_moves(pos, pseudo);

    CHECK_MESSAGE(legal.size() == 20, "startpos must have 20 legal moves, got " << legal.size());
    CHECK(pseudo.size() == 20);
    CHECK_MESSAGE(uci_set(legal).size() == legal.size(), "legal move list must contain no duplicates");

    for (const Move m : legal) {
        const auto parsed = parse_uci_move(pos, m.to_uci());
        REQUIRE_MESSAGE(parsed.has_value(), "parse_uci_move failed on legal move " << m.to_uci());
        CHECK(*parsed == m);
    }

    const auto e2e4 = parse_uci_move(pos, "e2e4");
    REQUIRE(e2e4.has_value());
    CHECK(e2e4->from() == E2);
    CHECK(e2e4->to() == E4);
    CHECK(e2e4->flag() == MoveFlag::DoublePawnPush);

    const auto g1f3 = parse_uci_move(pos, "g1f3");
    REQUIRE(g1f3.has_value());
    CHECK(g1f3->from() == G1);
    CHECK(g1f3->to() == F3);
    CHECK(g1f3->flag() == MoveFlag::Quiet);

    CHECK_FALSE(parse_uci_move(pos, "e2e5").has_value());
    CHECK_FALSE(parse_uci_move(pos, "e1e2").has_value());
    CHECK_FALSE(parse_uci_move(pos, "zzzz").has_value());
    CHECK_FALSE(parse_uci_move(pos, "").has_value());
    CHECK_FALSE(parse_uci_move(pos, "e2e4q").has_value());
}

CPPATLAS_TEST("absolute pins restrict pinned pieces to the pin ray") {
    // Orthogonal pin: White rook on E2 pinned by Black rook on E7 to White king on E1.
    {
        Position pos = must_parse("4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK(has_uci(legal, "e2e3"));
        CHECK(has_uci(legal, "e2e6"));
        CHECK(has_uci(legal, "e2e7"));
        CHECK_FALSE_MESSAGE(has_uci(legal, "e2d2"), "orthogonally pinned rook cannot leave the E-file");
        CHECK_FALSE_MESSAGE(has_uci(legal, "e2f2"), "orthogonally pinned rook cannot leave the E-file");
    }

    // Diagonal pin on knight: knight on D2 pinned by Black bishop on A5 to White king on E1.
    {
        Position pos = must_parse("4k3/8/8/b7/8/8/3N4/4K3 w - - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        for (const Move m : legal) {
            CHECK_MESSAGE(m.from() != D2, "diagonally pinned knight on D2 must have zero legal moves, saw "
                                              << m.to_uci());
        }
    }

    // Diagonal pin on pawn: pawn on C3 pinned by Black bishop on B4 to White king on E1.
    {
        Position pos = must_parse("4k3/8/8/8/1b6/2P5/8/4K3 w - - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK_MESSAGE(has_uci(legal, "c3b4"), "pinned pawn on C3 must be allowed to capture the pinning bishop on B4");
        CHECK_FALSE_MESSAGE(has_uci(legal, "c3c4"), "pinned pawn on C3 cannot push forward off the pin ray");
    }
}

CPPATLAS_TEST("double check allows only king moves") {
    // White king on E1 is in double check from Black rook on E4 and Black knight on F3.
    // White has Q on D1 and R on A4 that could capture if it were single check.
    Position pos = must_parse("r3k3/8/8/8/R3r3/5n2/8/3QK3 w - - 0 1");
    REQUIRE(pos.in_check());

    MoveList legal;
    generate_legal_moves(pos, legal);
    CHECK_MESSAGE(legal.size() == 2, "expected only 2 legal king escapes (e1f1, e1f2), got " << legal.size());
    for (const Move m : legal) {
        CHECK_MESSAGE(m.from() == E1,
                      "in double check only king moves are legal, saw " << m.to_uci());
    }
    CHECK(has_uci(legal, "e1f1"));
    CHECK(has_uci(legal, "e1f2"));
    CHECK_FALSE(has_uci(legal, "a4e4"));
    CHECK_FALSE(has_uci(legal, "d1f3"));
}

CPPATLAS_TEST("en passant horizontal pin is excluded while safe en passant is legal") {
    // Classic horizontal pin: White king on A5, Black pawn on D5, White pawn on E5, Black rook on H5.
    // Capturing e5xd6 removes BOTH pawns from rank 5, exposing White's king to the Black rook!
    {
        Position pos = must_parse("8/8/8/K2pP2r/8/8/8/7k w - d6 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK_FALSE_MESSAGE(has_uci(legal, "e5d6"),
                            "e5xd6 en passant exposes A5 king to H5 rook and MUST be excluded");
        CHECK_FALSE(parse_uci_move(pos, "e5d6").has_value());
        CHECK(has_uci(legal, "e5e6"));
    }

    // Without the pinning rook, e5xd6 is legal and flagged as MoveFlag::EnPassant.
    {
        Position pos = must_parse("8/8/8/3pP3/8/8/4K3/7k w - d6 0 1");
        const auto ep = parse_uci_move(pos, "e5d6");
        REQUIRE_MESSAGE(ep.has_value(), "legal en passant e5d6 was not generated");
        CHECK(ep->flag() == MoveFlag::EnPassant);
    }
}

CPPATLAS_TEST("castling legality enforces path, check, attacked squares, b1 exception, and rights") {
    // Both sides clear with rights: both e1g1 and e1c1 are legal.
    {
        Position pos = must_parse("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK(has_uci(legal, "e1g1"));
        CHECK(has_uci(legal, "e1c1"));
    }

    // Blocked queenside path (queen on d1).
    {
        Position pos = must_parse("r3k2r/8/8/8/8/8/8/R2QK2R w KQkq - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK(has_uci(legal, "e1g1"));
        CHECK_FALSE(has_uci(legal, "e1c1"));
    }

    // King in check: neither castling move is legal.
    {
        Position pos = must_parse("r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK_FALSE(has_uci(legal, "e1g1"));
        CHECK_FALSE(has_uci(legal, "e1c1"));
    }

    // Transit squares d1 and f1 attacked: neither castling move is legal.
    {
        Position pos = must_parse("r3k2r/8/8/8/3r1r2/8/8/R3K2R w KQkq - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK_FALSE(has_uci(legal, "e1g1"));
        CHECK_FALSE(has_uci(legal, "e1c1"));
    }

    // Target squares c1 and g1 attacked: neither castling move is legal.
    {
        Position pos = must_parse("r3k2r/8/8/8/2r3r1/8/8/R3K2R w KQkq - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK_FALSE(has_uci(legal, "e1g1"));
        CHECK_FALSE(has_uci(legal, "e1c1"));
    }

    // Only b1 is attacked (rook passes through b1, king does NOT): queenside castling IS legal!
    {
        Position pos = must_parse("r3k2r/8/8/8/1r6/8/8/R3K2R w KQkq - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK_MESSAGE(has_uci(legal, "e1c1"),
                      "queenside castling must remain legal when only b1 is attacked");
    }

    // Missing White castling rights: neither castling move is legal.
    {
        Position pos = must_parse("r3k2r/8/8/8/8/8/8/R3K2R w kq - 0 1");
        MoveList legal;
        generate_legal_moves(pos, legal);
        CHECK_FALSE(has_uci(legal, "e1g1"));
        CHECK_FALSE(has_uci(legal, "e1c1"));
    }
}

CPPATLAS_TEST("promotions generate all four piece choices for quiet pushes and captures") {
    Position pos = must_parse("k2n4/2P5/8/8/8/8/8/4K3 w - - 0 1");
    MoveList legal;
    generate_legal_moves(pos, legal);

    for (std::string_view uci : {"c7c8n", "c7c8b", "c7c8r", "c7c8q", "c7d8n", "c7d8b", "c7d8r", "c7d8q"}) {
        CHECK_MESSAGE(has_uci(legal, uci), "missing promotion move " << uci);
        CHECK(parse_uci_move(pos, uci).has_value());
    }
    CHECK_FALSE(parse_uci_move(pos, "c7c8").has_value());
    CHECK_FALSE(parse_uci_move(pos, "c7d8").has_value());
}

CPPATLAS_TEST("generate_legal_captures matches the capture and promotion subset of generate_legal_moves") {
    constexpr std::array<std::string_view, 3> fens = {
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        "k2n4/2P5/8/8/8/8/8/4K3 w - - 0 1",
        "8/8/8/3pP3/8/8/4K3/7k w - d6 0 1",
    };

    for (std::string_view fen : fens) {
        INFO("FEN: " << fen);
        Position pos = must_parse(fen);
        MoveList all_legal;
        MoveList caps;
        generate_legal_moves(pos, all_legal);
        generate_legal_captures(pos, caps);

        std::set<std::string> expected_caps;
        for (const Move m : all_legal) {
            if (m.is_capture() || m.is_promotion()) {
                expected_caps.insert(m.to_uci());
            }
        }

        for (const Move m : caps) {
            CHECK_MESSAGE((m.is_capture() || m.is_promotion()),
                          "generate_legal_captures returned quiet non-promotion move " << m.to_uci());
            CHECK_MESSAGE(all_legal.contains(m),
                          "generate_legal_captures returned move not in generate_legal_moves: " << m.to_uci());
        }
        CHECK_MESSAGE(uci_set(caps).size() == caps.size(), "generate_legal_captures returned duplicate moves");
        CHECK(uci_set(caps) == expected_caps);
    }
}

CPPATLAS_TEST("perft matches standard ground truth across all 6 positions and preserves Position") {
    struct PerftCase {
        std::string_view name;
        std::string_view fen;
        int depth;
        std::uint64_t expected;
    };

    constexpr std::array<PerftCase, 16> cases = {{
        {"startpos", STARTPOS_FEN, 1, 20},
        {"startpos", STARTPOS_FEN, 2, 400},
        {"startpos", STARTPOS_FEN, 3, 8902},
        {"startpos", STARTPOS_FEN, 4, 197281},
        {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 1, 48},
        {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 2, 2039},
        {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97862},
        {"pos3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 1, 14},
        {"pos3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 2, 191},
        {"pos3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 3, 2812},
        {"pos3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4, 43238},
        {"pos4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 1, 6},
        {"pos4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 2, 264},
        {"pos4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 3, 9467},
        {"pos5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62379},
        {"pos6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 3, 89890},
    }};

    // Also include depth 1 & 2 for pos5 and pos6.
    constexpr std::array<PerftCase, 4> extra = {{
        {"pos5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 1, 44},
        {"pos5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 2, 1486},
        {"pos6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 1, 46},
        {"pos6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 2, 2079},
    }};

    for (const auto& tc : cases) {
        Position pos = must_parse(tc.fen);
        const std::string orig_fen = pos.to_fen();
        const std::uint64_t orig_hash = pos.hash();
        const std::uint64_t got = perft(pos, tc.depth);
        INFO(tc.name << " depth " << tc.depth);
        CHECK_MESSAGE(got == tc.expected,
                      tc.name << " perft(" << tc.depth << ") = " << got << ", expected " << tc.expected);
        CHECK(pos.to_fen() == orig_fen);
        CHECK(pos.hash() == orig_hash);
    }

    for (const auto& tc : extra) {
        Position pos = must_parse(tc.fen);
        const std::string orig_fen = pos.to_fen();
        const std::uint64_t orig_hash = pos.hash();
        const std::uint64_t got = perft(pos, tc.depth);
        INFO(tc.name << " depth " << tc.depth);
        CHECK_MESSAGE(got == tc.expected,
                      tc.name << " perft(" << tc.depth << ") = " << got << ", expected " << tc.expected);
        CHECK(pos.to_fen() == orig_fen);
        CHECK(pos.hash() == orig_hash);
    }
}
