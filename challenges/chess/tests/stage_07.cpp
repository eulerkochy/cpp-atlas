// Stage 7 - alpha-beta-and-quiescence
// Spec: https://cppatlas.com/build/chess/alpha-beta-and-quiescence
//
// Alpha-beta negamax search and quiescence search:
//   - Mate-in-1 and Mate-in-2 puzzles (White & Black)
//   - Mate distance preference (shorter mate scores higher)
//   - Terminal checkmate and stalemate handling
//   - Horizon effect avoidance via quiescence search + direct quiesce() checks
//   - Tactical capture / fork resolution and SearchResult / Position invariants
#include "support/harness.hpp"

#include <concepts>
#include <cstddef>
#include <cstdint>
#include <expected>
#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace preflight {

CPPATLAS_PREFLIGHT(has_position_api,
                   "stage 7 (alpha-beta-and-quiescence) builds on stages 1-5: chess::Position needs "
                   "`from_fen`, `to_fen`, and `hash`.",
                   chess::Position,
                   requires(const V& pos, std::string_view fen) {
                       { V::from_fen(fen) } -> std::same_as<std::expected<V, std::string>>;
                       { pos.to_fen() } -> std::same_as<std::string>;
                       { pos.hash() } -> std::same_as<std::uint64_t>;
                   });

CPPATLAS_PREFLIGHT(has_movegen_api,
                   "stage 7 (alpha-beta-and-quiescence) builds on stage 5: chess::generate_legal_moves "
                   "and chess::parse_uci_move are required.",
                   chess::Position,
                   requires(V& pos, chess::MoveList& out, std::string_view uci) {
                       chess::generate_legal_moves(pos, out);
                       { chess::parse_uci_move(pos, uci) } -> std::same_as<std::optional<chess::Move>>;
                   });

CPPATLAS_PREFLIGHT(has_search_limits,
                   "stage 7 (alpha-beta-and-quiescence): chess::SearchLimits needs "
                   "`max_depth`, `max_nodes`, and `movetime_ms`.",
                   chess::SearchLimits,
                   std::default_initializable<V> && requires(V& l) {
                       { l.max_depth } -> std::convertible_to<int>;
                       { l.max_nodes } -> std::convertible_to<std::uint64_t>;
                       { l.movetime_ms } -> std::convertible_to<std::int64_t>;
                   });

CPPATLAS_PREFLIGHT(has_search_info,
                   "stage 7 (alpha-beta-and-quiescence): chess::SearchInfo needs "
                   "`depth`, `score`, `nodes`, `time_ms`, and `pv`.",
                   chess::SearchInfo,
                   requires(const V& info) {
                       { info.depth } -> std::convertible_to<int>;
                       { info.score } -> std::convertible_to<int>;
                       { info.nodes } -> std::convertible_to<std::uint64_t>;
                       { info.time_ms } -> std::convertible_to<std::int64_t>;
                       { info.pv } -> std::convertible_to<const std::vector<chess::Move>&>;
                   });

CPPATLAS_PREFLIGHT(has_search_result,
                   "stage 7 (alpha-beta-and-quiescence): chess::SearchResult needs "
                   "`best_move`, `score`, `depth`, `nodes`, and `pv`.",
                   chess::SearchResult,
                   requires(const V& res) {
                       { res.best_move } -> std::convertible_to<chess::Move>;
                       { res.score } -> std::convertible_to<int>;
                       { res.depth } -> std::convertible_to<int>;
                       { res.nodes } -> std::convertible_to<std::uint64_t>;
                       { res.pv } -> std::convertible_to<const std::vector<chess::Move>&>;
                   });

CPPATLAS_PREFLIGHT(has_searcher,
                   "stage 7 (alpha-beta-and-quiescence): chess::Searcher needs default/`size_t` "
                   "construction, `search(Position&, const SearchLimits&, on_info)`, and "
                   "`quiesce(Position&, int alpha, int beta, int ply)`.",
                   chess::Searcher,
                   std::default_initializable<V> && std::constructible_from<V, std::size_t> &&
                       requires(V& s, chess::Position& pos, const chess::SearchLimits& limits,
                                std::function<void(const chess::SearchInfo&)> cb,
                                int alpha, int beta, int ply) {
                           { s.search(pos, limits) } -> std::same_as<chess::SearchResult>;
                           { s.search(pos, limits, cb) } -> std::same_as<chess::SearchResult>;
                           { s.quiesce(pos, alpha, beta, ply) } -> std::same_as<int>;
                       });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_position_api && preflight::has_movegen_api &&
                    preflight::has_search_limits && preflight::has_search_info &&
                    preflight::has_search_result && preflight::has_searcher);

namespace {

inline chess::Position must_fen(std::string_view fen) {
    auto res = chess::Position::from_fen(fen);
    INFO("FEN: " << fen);
    REQUIRE_MESSAGE(res.has_value(),
                    "Position::from_fen failed (stage 1 prerequisite): "
                        << (res.has_value() ? std::string{} : res.error()));
    return *res;
}

inline chess::Move must_uci_move(chess::Position& pos, std::string_view uci) {
    auto m = chess::parse_uci_move(pos, uci);
    INFO("UCI move: " << uci << " in FEN: " << pos.to_fen());
    REQUIRE_MESSAGE(m.has_value(), "parse_uci_move failed for legal move `" << uci << "`");
    return *m;
}

inline void check_search_invariants(chess::Position& pos, const chess::SearchResult& res,
                                    const std::string& fen_before, std::uint64_t hash_before) {
    CHECK(pos.to_fen() == fen_before);
    CHECK(pos.hash() == hash_before);
    CHECK(res.nodes > 0);
    CHECK(res.depth >= 1);
    chess::MoveList legal;
    chess::generate_legal_moves(pos, legal);
    REQUIRE_MESSAGE(!res.best_move.is_null(), "expected a non-null legal best_move");
    CHECK_MESSAGE(legal.contains(res.best_move),
                  "best_move `" << res.best_move.to_uci() << "` must be legal in " << fen_before);
}

}  // namespace

CPPATLAS_TEST("mate-in-1 puzzles find the exact mating move") {
    struct Mate1Case {
        const char* name;
        const char* fen;
        const char* expected_uci;
    };

    const Mate1Case cases[] = {
        {"White back-rank mate Re8#", "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "e1e8"},
        {"Black Queen mate Qxg2#", "6k1/1b3ppp/8/8/8/7q/5PPP/6K1 b - - 0 1", "h3g2"},
        {"White smothered knight mate Nf7#", "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1", "g5f7"},
    };

    chess::Searcher searcher(1);
    for (const auto& tc : cases) {
        INFO("case: " << tc.name);
        chess::Position pos = must_fen(tc.fen);
        const std::string fen_before = pos.to_fen();
        const std::uint64_t hash_before = pos.hash();
        const chess::Move expected = must_uci_move(pos, tc.expected_uci);

        const chess::SearchResult res =
            searcher.search(pos, chess::SearchLimits{.max_depth = 2});

        check_search_invariants(pos, res, fen_before, hash_before);
        INFO("position: " << tc.fen << ", score=" << res.score);
        CHECK(res.best_move == expected);
        CHECK(res.score > chess::MATE_THRESHOLD);
    }
}

CPPATLAS_TEST("mate-in-2 puzzles find the forced key move at depth 4") {
    struct Mate2Case {
        const char* name;
        const char* fen;
        const char* expected_uci;
    };

    const Mate2Case cases[] = {
        // 1. Qe8+ Rxe8 2. Rxe8# (Qe4 clears the e-file for Re1)
        {"White file-clearing Queen sacrifice 1. Qe8+",
         "2r3k1/5ppp/8/8/4Q3/8/5PPP/4R1K1 w - - 0 1", "e4e8"},
        // 1... Qe1+ 2. Rxe1 Rxe1# (Qe5 clears the e-file for Re8)
        {"Black file-clearing Queen sacrifice 1... Qe1+",
         "4r1k1/5ppp/8/4q3/8/8/5PPP/2R3K1 b - - 0 1", "e5e1"},
    };

    chess::Searcher searcher(1);
    for (const auto& tc : cases) {
        INFO("case: " << tc.name);
        chess::Position pos = must_fen(tc.fen);
        const std::string fen_before = pos.to_fen();
        const std::uint64_t hash_before = pos.hash();
        const chess::Move expected = must_uci_move(pos, tc.expected_uci);

        const chess::SearchResult res =
            searcher.search(pos, chess::SearchLimits{.max_depth = 4});

        check_search_invariants(pos, res, fen_before, hash_before);
        INFO("position: " << tc.fen << ", score=" << res.score);
        CHECK(res.best_move == expected);
        CHECK(res.score > chess::MATE_THRESHOLD);
    }
}

CPPATLAS_TEST("search prefers mate-in-1 over mate-in-2 via ply-adjusted mate scores") {
    // Here 1. Qxc8# (h3c8) is mate-in-1 (Bb2 covers g7), while 1. Qxh7+ Kf8 2. Qxf7# is mate-in-2.
    chess::Position pos = must_fen("2r3k1/5p1p/8/6N1/8/7Q/1B3PPP/4R1K1 w - - 0 1");
    const std::string fen_before = pos.to_fen();
    const std::uint64_t hash_before = pos.hash();
    const chess::Move mate_in_1 = must_uci_move(pos, "h3c8");

    chess::Searcher searcher(1);
    const chess::SearchResult res = searcher.search(pos, chess::SearchLimits{.max_depth = 4});

    check_search_invariants(pos, res, fen_before, hash_before);
    CHECK_MESSAGE(res.best_move == mate_in_1,
                  "engine chose " << res.best_move.to_uci() << " instead of mate-in-1 h3c8 "
                                  << "-> check ply-adjusted mate score `MATE_SCORE - ply`");
    CHECK(res.score > chess::MATE_THRESHOLD);

    // Also verify mate-in-1 scores strictly higher than a mate-in-2 in a separate position.
    chess::Position pos_m2 = must_fen("2r3k1/5ppp/8/8/4Q3/8/5PPP/4R1K1 w - - 0 1");
    const chess::SearchResult res_m2 =
        searcher.search(pos_m2, chess::SearchLimits{.max_depth = 4});
    CHECK(res_m2.score > chess::MATE_THRESHOLD);
    CHECK(res.score > res_m2.score);
}

CPPATLAS_TEST("terminal checkmate and stalemate positions return null move and exact scores") {
    chess::Searcher searcher;

    {
        // checkmated side has null best_move and score < -MATE_THRESHOLD
        chess::Position pos = must_fen("4R1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1");
        const std::string fen_before = pos.to_fen();
        const std::uint64_t hash_before = pos.hash();

        const chess::SearchResult res = searcher.search(pos, chess::SearchLimits{.max_depth = 2});
        CHECK(pos.to_fen() == fen_before);
        CHECK(pos.hash() == hash_before);
        CHECK(res.best_move.is_null());
        CHECK(res.score < -chess::MATE_THRESHOLD);
    }

    {
        // stalemated side has null best_move and score == 0
        chess::Position pos = must_fen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
        const std::string fen_before = pos.to_fen();
        const std::uint64_t hash_before = pos.hash();

        const chess::SearchResult res = searcher.search(pos, chess::SearchLimits{.max_depth = 2});
        CHECK(pos.to_fen() == fen_before);
        CHECK(pos.hash() == hash_before);
        CHECK(res.best_move.is_null());
        CHECK(res.score == 0);
    }
}

CPPATLAS_TEST("quiescence search avoids the horizon effect and evaluates hanging captures") {
    chess::Searcher searcher(1);

    {
        // depth-1 search with quiescence avoids QxP?? followed by PxQ
        // White Queen on e5 can capture c5, which is defended by b6.
        // Without quiescence, depth-1 search sees +1 pawn and plays Qxc5??;
        // with quiescence, it sees bxc5 and keeps the Queen.
        chess::Position pos = must_fen("3k4/p7/1p6/2p1Q3/8/8/8/4K3 w - - 0 1");
        const std::string fen_before = pos.to_fen();
        const std::uint64_t hash_before = pos.hash();
        const chess::Move blunder = must_uci_move(pos, "e5c5");

        const chess::SearchResult res = searcher.search(pos, chess::SearchLimits{.max_depth = 1});

        check_search_invariants(pos, res, fen_before, hash_before);
        CHECK_MESSAGE(res.best_move != blunder,
                      "depth-1 search played Qxe5xc5 into bxc5 -> make sure depth == 0 calls quiesce()");
        CHECK(res.score > 500);
    }

    {
        // quiesce() sees immediate capture of a hanging Queen
        // White Rook on d4 can capture undefended Black Queen on d5.
        chess::Position hanging_q = must_fen("4k3/8/8/3q4/3R4/8/8/4K3 w - - 0 1");
        const int static_eval = chess::evaluate(hanging_q);
        const int q_score = searcher.quiesce(hanging_q, -chess::INF_SCORE, chess::INF_SCORE, 0);

        INFO("static_eval=" << static_eval << ", quiesce=" << q_score);
        CHECK(static_eval < -200);
        CHECK_MESSAGE(q_score > 300,
                      "quiesce() should resolve Rxd5 and score White up a Rook (> +300)");
    }

    {
        // quiesce() on a quiet position with no captures matches static evaluate()
        chess::Position quiet = must_fen("4k3/pppp1ppp/8/8/4P3/8/PPPP1PPP/4K3 w - - 0 1");
        const int static_eval = chess::evaluate(quiet);
        const int q_score = searcher.quiesce(quiet, -chess::INF_SCORE, chess::INF_SCORE, 0);
        CHECK(q_score == static_eval);
    }
}

CPPATLAS_TEST("tactical capture and 2-ply knight fork win decisive material") {
    chess::Searcher searcher(1);

    {
        // captures hanging Black Queen
        chess::Position pos = must_fen("4k3/8/8/3q4/8/3R4/8/4K3 w - - 0 1");
        const std::string fen_before = pos.to_fen();
        const std::uint64_t hash_before = pos.hash();
        const chess::Move capture = must_uci_move(pos, "d3d5");

        const chess::SearchResult res = searcher.search(pos, chess::SearchLimits{.max_depth = 2});
        check_search_invariants(pos, res, fen_before, hash_before);
        CHECK(res.best_move == capture);
        CHECK(res.score > 350);
    }

    {
        // finds 2-ply knight fork 1. Nc7+ winning the Black Queen (e2 pawn prevents K+N vs K draw)
        chess::Position pos = must_fen("q3k3/8/8/1N6/8/8/4P3/4K3 w - - 0 1");
        const std::string fen_before = pos.to_fen();
        const std::uint64_t hash_before = pos.hash();
        const chess::Move fork_move = must_uci_move(pos, "b5c7");

        const chess::SearchResult res = searcher.search(pos, chess::SearchLimits{.max_depth = 3});
        check_search_invariants(pos, res, fen_before, hash_before);
        CHECK_MESSAGE(res.best_move == fork_move,
                      "expected knight fork b5c7 (1. Nc7+ followed by 2. Nxa8), got "
                          << res.best_move.to_uci());
        CHECK(res.score > 200);
    }
}
