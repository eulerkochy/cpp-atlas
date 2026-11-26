#include <chess/chess.hpp>

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace {

#define CHECK(cond)                                                                         \
    do {                                                                                    \
        if (!(cond)) {                                                                      \
            std::fprintf(stderr, "CHECK FAILED (%s:%d): %s\n", __FILE__, __LINE__, #cond);  \
            std::exit(1);                                                                   \
        }                                                                                   \
    } while (false)

void verify_bitboard_mailbox_sync(const chess::Position& pos) {
    using namespace chess;
    Bitboard all_occ = 0;
    Bitboard by_color[2] = {0, 0};
    Bitboard by_type[6] = {0, 0, 0, 0, 0, 0};

    for (Square sq = 0; sq < 64; ++sq) {
        const Piece p = pos.piece_at(sq);
        const Bitboard b = square_bb(sq);
        if (p != Piece::None) {
            all_occ |= b;
            by_color[static_cast<int>(color_of(p))] |= b;
            by_type[static_cast<int>(type_of(p))] |= b;
        }
    }

    CHECK(pos.pieces() == all_occ);
    CHECK(pos.pieces(Color::White) == by_color[0]);
    CHECK(pos.pieces(Color::Black) == by_color[1]);
    CHECK((by_color[0] & by_color[1]) == 0);
    for (int pt = 0; pt < 6; ++pt) {
        const auto ptype = static_cast<PieceType>(pt);
        CHECK(pos.pieces(ptype) == by_type[pt]);
        CHECK(pos.pieces(Color::White, ptype) == (by_color[0] & by_type[pt]));
        CHECK(pos.pieces(Color::Black, ptype) == (by_color[1] & by_type[pt]));
    }
    CHECK(popcount(pos.pieces(Color::White, PieceType::King)) == 1);
    CHECK(popcount(pos.pieces(Color::Black, PieceType::King)) == 1);
}

void verify_movegen_invariants(chess::Position& pos) {
    using namespace chess;
    MoveList pseudo, legal, caps;
    generate_pseudo_legal_moves(pos, pseudo);
    generate_legal_moves(pos, legal);
    generate_legal_captures(pos, caps);

    // No duplicates in legal moves and every legal move is in pseudo-legal moves
    for (std::size_t i = 0; i < legal.size(); ++i) {
        CHECK(pseudo.contains(legal[i]));
        for (std::size_t j = i + 1; j < legal.size(); ++j) {
            CHECK(legal[i] != legal[j]);
        }
        const auto parsed = parse_uci_move(pos, legal[i].to_uci());
        CHECK(parsed.has_value());
        CHECK(*parsed == legal[i]);
    }

    // generate_legal_captures == captures/promotions subset of generate_legal_moves
    std::size_t expected_caps = 0;
    for (const Move m : legal) {
        if (m.is_capture() || m.is_promotion()) {
            ++expected_caps;
            CHECK(caps.contains(m));
        }
    }
    CHECK(caps.size() == expected_caps);
    for (const Move m : caps) {
        CHECK(m.is_capture() || m.is_promotion());
        CHECK(legal.contains(m));
    }

    // Every legal move leaves own king safe
    const Color us = pos.side_to_move();
    const Color them = ~us;
    const std::string fen_before = pos.to_fen();
    const std::uint64_t hash_before = pos.hash();
    UndoState undo;
    for (const Move m : legal) {
        pos.make_move(m, undo);
        CHECK(pos.hash() == pos.compute_hash());
        verify_bitboard_mailbox_sync(pos);
        CHECK(!pos.is_square_attacked(pos.king_square(us), them));
        pos.unmake_move(m, undo);
        CHECK(pos.to_fen() == fen_before);
        CHECK(pos.hash() == hash_before);
        verify_bitboard_mailbox_sync(pos);
    }
}

void run_perft_suite() {
    using namespace chess;
    struct PerftCase {
        const char* name;
        const char* fen;
        int depth;
        std::uint64_t expected;
    };

    const PerftCase cases[] = {
        {"startpos d1", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 1, 20},
        {"startpos d2", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 2, 400},
        {"startpos d3", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 3, 8902},
        {"startpos d4", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 4, 197281},
        {"startpos d5", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 5, 4865609},
        {"kiwipete d1", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 1, 48},
        {"kiwipete d2", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 2, 2039},
        {"kiwipete d3", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97862},
        {"kiwipete d4", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 4, 4085603},
        {"pos3 d1", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 1, 14},
        {"pos3 d2", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 2, 191},
        {"pos3 d3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 3, 2812},
        {"pos3 d4", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4, 43238},
        {"pos4 d1", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 1, 6},
        {"pos4 d2", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 2, 264},
        {"pos4 d3", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 3, 9467},
        {"pos5 d1", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 1, 44},
        {"pos5 d2", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 2, 1486},
        {"pos5 d3", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62379},
        {"pos6 d1", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 1, 46},
        {"pos6 d2", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 2, 2079},
        {"pos6 d3", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 3, 89890},
    };

    for (const auto& tc : cases) {
        auto pos = Position::from_fen(tc.fen);
        CHECK(pos.has_value());
        const auto t0 = std::chrono::steady_clock::now();
        const std::uint64_t got = perft(*pos, tc.depth);
        const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::steady_clock::now() - t0)
                            .count();
        if (got != tc.expected) {
            std::fprintf(stderr, "PERFT MISMATCH %s: got %llu, expected %llu\n", tc.name,
                         static_cast<unsigned long long>(got),
                         static_cast<unsigned long long>(tc.expected));
            std::exit(1);
        }
        std::printf("perft %-14s = %8llu (%lld ms)\n", tc.name,
                    static_cast<unsigned long long>(got), static_cast<long long>(ms));
        std::fflush(stdout);
    }
}

void run_tactics_and_uci_checks() {
    using namespace chess;

    // FEN rejection checks
    CHECK(!Position::from_fen("").has_value());
    CHECK(!Position::from_fen("8/8/8/8/8/8/8 w - - 0 1").has_value());
    CHECK(!Position::from_fen("8/8/8/8/8/8/8/9 w - - 0 1").has_value());
    CHECK(!Position::from_fen("8/8/8/8/8/8/8/7X w - - 0 1").has_value());
    CHECK(!Position::from_fen("4k3/8/8/8/8/8/8/4K3 x - - 0 1").has_value());
    CHECK(!Position::from_fen("4k3/8/8/8/8/8/8/4K3 w KK - 0 1").has_value());
    CHECK(!Position::from_fen("4k3/8/8/8/8/8/8/4K3 w - z9 0 1").has_value());
    CHECK(!Position::from_fen("4k3/8/8/8/8/8/8/8 w - - 0 1").has_value());
    CHECK(!Position::from_fen("4k3/8/8/8/8/8/4K3/4K3 w - - 0 1").has_value());
    CHECK(!Position::from_fen("4k3/8/8/8/8/8/8/4K3 w - - -1 1").has_value());
    CHECK(!Position::from_fen("4k3/8/8/8/8/8/8/4K3 w - - 0 0").has_value());

    // Eval color symmetry check
    {
        auto p1 = Position::from_fen("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
        auto p2 = Position::from_fen("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4");
        CHECK(p1.has_value() && p2.has_value());
        CHECK(evaluate(*p1) == -evaluate(*p2));

        auto w_adv = Position::from_fen("4k3/8/8/8/8/8/4P3/4K2Q w - - 0 1");
        auto b_adv = Position::from_fen("4k2q/4p3/8/8/8/8/8/4K3 b - - 0 1");
        CHECK(w_adv.has_value() && b_adv.has_value());
        CHECK(evaluate(*w_adv) == evaluate(*b_adv));
    }

    // Mate-in-1 (Scholar's mate Qxf7#)
    {
        auto pos = Position::from_fen("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 3");
        CHECK(pos.has_value());
        Searcher s;
        const auto res = s.search(*pos, SearchLimits{.max_depth = 2});
        CHECK(res.best_move.to_uci() == "h5f7");
        CHECK(res.score > MATE_THRESHOLD);
        std::printf("mate-in-1 bestmove=%s score=%d nodes=%llu\n", res.best_move.to_uci().c_str(),
                    res.score, static_cast<unsigned long long>(res.nodes));
    }

    // Mate-in-2 (1. Qa8+ Bxa8 2. Rxa8# or similar: 1. Qg7+ Rxg7 2. Nf6# / smothered / back-rank)
    {
        // Classic mate-in-2: 1. Qxd7+ Nxd7 2. Re8# -> wait, let's use Morphy / standard mate in 2:
        // "2bqkbn1/2pppp2/np2N3/r3P1p1/p2N2B1/5Q2/PPPPKPP1/RNB2r2 w - - 0 1" -> wait use verified M2:
        // "r2qk2r/pb4pp/1n2Pb2/2B2Q2/p1p5/2P5/2B2PPP/RN2R1K1 w - - 1 0" -> actually "3qr2k/pbpp2pp/1p5N/3Q4/2P1P3/P7/1PP2PPP/R4RK1 w - - 0 1": 1. Qg8+ Rxg8 2. Nf7#
        auto pos = Position::from_fen("3qr2k/pbpp2pp/1p5N/3Q4/2P1P3/P7/1PP2PPP/R4RK1 w - - 0 1");
        CHECK(pos.has_value());
        Searcher s;
        const auto res = s.search(*pos, SearchLimits{.max_depth = 4});
        CHECK(res.best_move.to_uci() == "d5g8");
        CHECK(res.score == MATE_SCORE - 3);
        std::printf("mate-in-2 bestmove=%s score=%d nodes=%llu\n", res.best_move.to_uci().c_str(),
                    res.score, static_cast<unsigned long long>(res.nodes));
    }

    // Mate-in-3 (K+Q vs K: 1. Qg1! Kh8 2. Kf6 Kh7 3. Qg7#)
    {
        auto pos = Position::from_fen("6k1/8/4K3/8/8/8/8/Q7 w - - 0 1");
        CHECK(pos.has_value());
        Searcher s;
        const auto res = s.search(*pos, SearchLimits{.max_depth = 6});
        CHECK(res.score == MATE_SCORE - 5);
        std::printf("mate-in-3 bestmove=%s score=%d nodes=%llu\n", res.best_move.to_uci().c_str(),
                    res.score, static_cast<unsigned long long>(res.nodes));
    }

    // TT node reduction check
    {
        auto pos = Position::from_fen("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
        CHECK(pos.has_value());
        Searcher s_no_tt, s_tt;
        s_no_tt.set_use_tt(false);
        const auto r1 = s_no_tt.search(*pos, SearchLimits{.max_depth = 4});
        const auto r2 = s_tt.search(*pos, SearchLimits{.max_depth = 4});
        CHECK(r2.nodes < r1.nodes);
        CHECK(!r1.pv.empty() && !r2.pv.empty());
        std::printf("TT reduction d4: no_tt=%llu, with_tt=%llu\n",
                    static_cast<unsigned long long>(r1.nodes),
                    static_cast<unsigned long long>(r2.nodes));
    }

    // UCI transcript check
    {
        std::istringstream in(
            "uci\n"
            "isready\n"
            "setoption name Hash value 8\n"
            "position startpos moves e2e4 e7e5 g1f3\n"
            "go depth 3\n"
            "quit\n");
        std::ostringstream out;
        UciEngine engine(out);
        engine.loop(in);
        const std::string s = out.str();
        CHECK(s.find("uciok") != std::string::npos);
        CHECK(s.find("readyok") != std::string::npos);
        CHECK(s.find("info depth 3") != std::string::npos);
        CHECK(s.find("bestmove ") != std::string::npos);
    }
}

void run_random_fuzz(int num_games, int max_plies, std::uint64_t seed) {
    using namespace chess;
    std::uint64_t rng_state = seed;
    auto next_u64 = [&]() -> std::uint64_t {
        std::uint64_t z = (rng_state += 0x9E3779B97F4A7C15ULL);
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
        return z ^ (z >> 31);
    };
    Searcher searcher(4);
    std::uint64_t total_plies = 0;

    for (int g = 0; g < num_games; ++g) {
        Position pos = Position::startpos();
        std::vector<Move> played;
        std::vector<UndoState> undos;
        std::vector<std::string> fens;
        std::vector<std::uint64_t> hashes;

        fens.push_back(pos.to_fen());
        hashes.push_back(pos.hash());

        for (int ply = 0; ply < max_plies; ++ply) {
            verify_bitboard_mailbox_sync(pos);
            CHECK(pos.hash() == pos.compute_hash());

            MoveList legal;
            generate_legal_moves(pos, legal);

            // Periodically run full movegen & search invariants
            if ((ply % 7) == 0) {
                verify_movegen_invariants(pos);
            }
            if ((ply % 23) == 0 && !legal.empty()) {
                const std::string before_fen = pos.to_fen();
                const auto res = searcher.search(pos, SearchLimits{.max_depth = 2, .max_nodes = 1500});
                CHECK(pos.to_fen() == before_fen);
                CHECK(legal.contains(res.best_move));
                for (const Move pvm : res.pv) {
                    CHECK(!pvm.is_null());
                }
            }

            if (legal.empty() || pos.is_fifty_move_draw() || pos.is_insufficient_material() ||
                pos.is_repetition(3)) {
                break;
            }

            const std::size_t idx = static_cast<std::size_t>(next_u64() % legal.size());
            const Move chosen = legal[idx];
            UndoState undo;
            pos.make_move(chosen, undo);
            played.push_back(chosen);
            undos.push_back(undo);
            fens.push_back(pos.to_fen());
            hashes.push_back(pos.hash());
            ++total_plies;
        }

        // Unwind the entire game and verify exact restoration at every ply
        for (int i = static_cast<int>(played.size()) - 1; i >= 0; --i) {
            pos.unmake_move(played[static_cast<std::size_t>(i)],
                            undos[static_cast<std::size_t>(i)]);
            CHECK(pos.to_fen() == fens[static_cast<std::size_t>(i)]);
            CHECK(pos.hash() == hashes[static_cast<std::size_t>(i)]);
            CHECK(pos.hash() == pos.compute_hash());
            verify_bitboard_mailbox_sync(pos);
        }
    }
    std::printf("fuzz passed: %d games, %llu plies (seed=%llu)\n", num_games,
                static_cast<unsigned long long>(total_plies),
                static_cast<unsigned long long>(seed));
}

}  // namespace

int main(int argc, char** argv) {
    int games = 120;
    int max_plies = 120;
    std::uint64_t seed = 20261125ULL;
    if (argc >= 2) games = std::atoi(argv[1]);
    if (argc >= 3) max_plies = std::atoi(argv[2]);
    if (argc >= 4) seed = static_cast<std::uint64_t>(std::strtoull(argv[3], nullptr, 10));

    run_perft_suite();
    run_tactics_and_uci_checks();
    run_random_fuzz(games, max_plies, seed);
    return 0;
}
