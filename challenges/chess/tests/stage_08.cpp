// Stage 8 - transposition-table
// Spec: https://cppatlas.com/build/chess/transposition-table
//
// Transposition table, mate score normalization, iterative deepening, and search limits:
//   - TranspositionTable: probe, store, clear, resize_mb, size, mate score ply normalization
//   - Iterative deepening: on_info callbacks with monotonic depth, non-decreasing nodes, legal PV
//   - TT effectiveness: strictly fewer nodes on transposition-rich positions
//   - SearchLimits: max_nodes, movetime_ms, request_stop()
//   - Mate-in-3 puzzle solved cleanly at depth 6
#include "support/harness.hpp"

#include <chrono>
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

CPPATLAS_PREFLIGHT(has_tt_bound,
                   "stage 8 (transposition-table): chess::TTBound enum needs "
                   "`None`, `Exact`, `Lower`, and `Upper`.",
                   chess::TTBound,
                   requires {
                       V::None;
                       V::Exact;
                       V::Lower;
                       V::Upper;
                   });

CPPATLAS_PREFLIGHT(has_tt_entry,
                   "stage 8 (transposition-table): chess::TTEntry needs "
                   "`key`, `best_move`, `score`, `depth`, and `bound`.",
                   chess::TTEntry,
                   std::default_initializable<V> && requires(V& e) {
                       { e.key } -> std::convertible_to<std::uint64_t>;
                       { e.best_move } -> std::convertible_to<chess::Move>;
                       { e.score } -> std::convertible_to<int>;
                       { e.depth } -> std::convertible_to<int>;
                       { e.bound } -> std::same_as<chess::TTBound&>;
                   });

CPPATLAS_PREFLIGHT(has_tt_class,
                   "stage 8 (transposition-table): chess::TranspositionTable needs "
                   "`explicit TranspositionTable(std::size_t)`, `clear()`, `resize_mb(std::size_t)`, "
                   "`size()`, `probe(uint64_t, TTEntry&)`, and "
                   "`store(uint64_t, int, int, TTBound, Move, int)`.",
                   chess::TranspositionTable,
                   std::default_initializable<V> && std::constructible_from<V, std::size_t> &&
                       requires(V& tt, const V& ctt, std::size_t mb, std::uint64_t key,
                                chess::TTEntry& out, int depth, int score, chess::TTBound bound,
                                chess::Move best_move, int ply) {
                           tt.clear();
                           tt.resize_mb(mb);
                           { ctt.size() } -> std::same_as<std::size_t>;
                           { ctt.probe(key, out) } -> std::same_as<bool>;
                           tt.store(key, depth, score, bound, best_move, ply);
                       });

CPPATLAS_PREFLIGHT(has_searcher_tt_and_stop,
                   "stage 8 (transposition-table): chess::Searcher needs "
                   "`set_use_tt(bool)`, `clear_tt()`, `resize_tt(std::size_t)`, `request_stop()`, "
                   "and `search(Position&, const SearchLimits&, on_info)`.",
                   chess::Searcher,
                   std::constructible_from<V, std::size_t> &&
                       requires(V& s, bool enabled, std::size_t mb, chess::Position& pos,
                                const chess::SearchLimits& limits,
                                std::function<void(const chess::SearchInfo&)> cb) {
                           s.set_use_tt(enabled);
                           s.clear_tt();
                           s.resize_tt(mb);
                           s.request_stop();
                           { s.search(pos, limits, cb) } -> std::same_as<chess::SearchResult>;
                       });

CPPATLAS_PREFLIGHT(has_position_and_movegen,
                   "stage 8 (transposition-table) builds on stages 1-5: Position::from_fen, "
                   "make_move, unmake_move, generate_legal_moves, and parse_uci_move are required.",
                   chess::Position,
                   requires(V& pos, std::string_view fen, chess::Move m, chess::UndoState& u,
                            chess::MoveList& out, std::string_view uci) {
                       { V::from_fen(fen) } -> std::same_as<std::expected<V, std::string>>;
                       pos.make_move(m, u);
                       pos.unmake_move(m, u);
                       chess::generate_legal_moves(pos, out);
                       { chess::parse_uci_move(pos, uci) } -> std::same_as<std::optional<chess::Move>>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_tt_bound && preflight::has_tt_entry &&
                    preflight::has_tt_class && preflight::has_searcher_tt_and_stop &&
                    preflight::has_position_and_movegen);

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

inline void verify_legal_pv(chess::Position pos, const std::vector<chess::Move>& pv) {
    REQUIRE_MESSAGE(!pv.empty(), "PV must not be empty");
    std::vector<chess::UndoState> undos;
    undos.reserve(pv.size());
    for (std::size_t i = 0; i < pv.size(); ++i) {
        chess::MoveList legal;
        chess::generate_legal_moves(pos, legal);
        INFO("PV index " << i << ", move=" << pv[i].to_uci() << ", fen=" << pos.to_fen());
        REQUIRE_MESSAGE(legal.contains(pv[i]), "PV contains illegal move at index " << i);
        chess::UndoState u{};
        pos.make_move(pv[i], u);
        undos.push_back(u);
    }
    for (std::size_t i = pv.size(); i > 0; --i) {
        pos.unmake_move(pv[i - 1], undos[i - 1]);
    }
}

}  // namespace

CPPATLAS_TEST("TranspositionTable store, probe, clear, and resize_mb work cleanly") {
    chess::TranspositionTable tt(1);
    CHECK(tt.size() > 0);

    chess::TTEntry out{};
    const std::uint64_t k1 = 0x123456789ABCDEF0ULL;
    const std::uint64_t k2 = 0x0FEDCBA987654321ULL;
    const std::uint64_t k3 = 0xAAAABBBBCCCCDDDDULL;

    CHECK_FALSE(tt.probe(k1, out));

    const chess::Move m1(chess::E2, chess::E4, chess::MoveFlag::DoublePawnPush);
    const chess::Move m2(chess::G1, chess::F3, chess::MoveFlag::Quiet);
    const chess::Move m3(chess::D7, chess::D5, chess::MoveFlag::DoublePawnPush);

    tt.store(k1, 5, 125, chess::TTBound::Exact, m1, 2);
    tt.store(k2, 3, -340, chess::TTBound::Lower, m2, 1);
    tt.store(k3, 7, 0, chess::TTBound::Upper, m3, 4);

    REQUIRE(tt.probe(k1, out));
    CHECK(out.key == k1);
    CHECK(out.depth == 5);
    CHECK(out.score == 125);
    CHECK(out.bound == chess::TTBound::Exact);
    CHECK(out.best_move == m1);

    REQUIRE(tt.probe(k2, out));
    CHECK(out.key == k2);
    CHECK(out.depth == 3);
    CHECK(out.score == -340);
    CHECK(out.bound == chess::TTBound::Lower);
    CHECK(out.best_move == m2);

    REQUIRE(tt.probe(k3, out));
    CHECK(out.key == k3);
    CHECK(out.depth == 7);
    CHECK(out.score == 0);
    CHECK(out.bound == chess::TTBound::Upper);
    CHECK(out.best_move == m3);

    tt.clear();
    CHECK_FALSE(tt.probe(k1, out));
    CHECK_FALSE(tt.probe(k2, out));
    CHECK_FALSE(tt.probe(k3, out));

    const std::size_t size_1mb = tt.size();
    tt.resize_mb(4);
    const std::size_t size_4mb = tt.size();
    CHECK(size_4mb > size_1mb);
    CHECK_FALSE(tt.probe(k1, out));

    tt.resize_mb(1);
    CHECK(tt.size() == size_1mb);
}

CPPATLAS_TEST("TranspositionTable normalizes mate scores relative to root ply") {
    chess::TranspositionTable tt(1);
    const chess::Move m(chess::E1, chess::E8, chess::MoveFlag::Quiet);

    const std::uint64_t k_pos4 = 0x1111222233334444ULL;
    const std::uint64_t k_pos2 = 0x2222333344445555ULL;
    const std::uint64_t k_neg3 = 0x3333444455556666ULL;

    // A mate-in-4-plies score measured from root is MATE_SCORE - 4 when found at ply 4.
    // Stored normalized in TT, it becomes (MATE_SCORE - 4) + 4 == MATE_SCORE.
    tt.store(k_pos4, 4, chess::MATE_SCORE - 4, chess::TTBound::Exact, m, 4);
    tt.store(k_pos2, 4, chess::MATE_SCORE - 2, chess::TTBound::Exact, m, 2);
    tt.store(k_neg3, 4, -(chess::MATE_SCORE - 3), chess::TTBound::Exact, m, 3);

    chess::TTEntry e4{}, e2{}, en3{};
    REQUIRE(tt.probe(k_pos4, e4));
    REQUIRE(tt.probe(k_pos2, e2));
    REQUIRE(tt.probe(k_neg3, en3));

    CHECK_MESSAGE(e4.score == chess::MATE_SCORE,
                  "storing MATE_SCORE - 4 at ply 4 must normalize to MATE_SCORE (got " << e4.score << ")");
    CHECK(e2.score == e4.score);
    CHECK_MESSAGE(en3.score == -chess::MATE_SCORE,
                  "storing -(MATE_SCORE - 3) at ply 3 must normalize to -MATE_SCORE (got "
                      << en3.score << ")");
}

CPPATLAS_TEST("iterative deepening emits monotonic depths, non-decreasing nodes, and legal PV") {
    chess::Position pos =
        must_fen("r1bqk2r/pp1pppbp/2n2np1/2p5/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 2 5");
    const std::string fen_before = pos.to_fen();
    const std::uint64_t hash_before = pos.hash();

    chess::Searcher searcher(1);
    std::vector<chess::SearchInfo> infos;

    const chess::SearchResult res = searcher.search(
        pos, chess::SearchLimits{.max_depth = 4},
        [&](const chess::SearchInfo& info) { infos.push_back(info); });

    CHECK(pos.to_fen() == fen_before);
    CHECK(pos.hash() == hash_before);
    REQUIRE(infos.size() == 4);

    std::uint64_t prev_nodes = 0;
    for (int i = 0; i < 4; ++i) {
        const auto& info = infos[static_cast<std::size_t>(i)];
        CHECK(info.depth == i + 1);
        CHECK(info.nodes > 0);
        CHECK(info.nodes >= prev_nodes);
        CHECK(info.time_ms >= 0);
        verify_legal_pv(pos, info.pv);
        prev_nodes = info.nodes;
    }

    CHECK(res.depth == 4);
    CHECK(res.nodes >= prev_nodes);
    REQUIRE(!res.pv.empty());
    CHECK(res.pv.front() == res.best_move);
    CHECK(infos.back().pv.front() == res.best_move);
    CHECK(infos.back().score == res.score);
}

CPPATLAS_TEST("transposition table reduces search nodes on transposition-rich positions") {
    struct Case {
        const char* name;
        const char* fen;
        int depth;
    };

    const Case cases[] = {
        // Fine #70: classic endgame with high king-move transposition density
        {"Fine #70 king-and-pawn endgame at depth 6",
         "8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1", 6},
        // Balanced middlegame at depth 4
        {"Middlegame position at depth 4",
         "r2q1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7", 4},
    };

    for (const auto& tc : cases) {
        INFO("case: " << tc.name);
        chess::Position pos_tt = must_fen(tc.fen);
        chess::Position pos_no_tt = must_fen(tc.fen);

        chess::Searcher with_tt(2);
        with_tt.set_use_tt(true);

        chess::Searcher without_tt(2);
        without_tt.set_use_tt(false);

        const chess::SearchLimits limits{.max_depth = tc.depth};
        const chess::SearchResult res_tt = with_tt.search(pos_tt, limits);
        const chess::SearchResult res_no_tt = without_tt.search(pos_no_tt, limits);

        chess::MoveList legal;
        chess::generate_legal_moves(pos_tt, legal);
        REQUIRE(!res_tt.best_move.is_null());
        REQUIRE(!res_no_tt.best_move.is_null());
        CHECK(legal.contains(res_tt.best_move));
        CHECK(legal.contains(res_no_tt.best_move));

        INFO("TT nodes=" << res_tt.nodes << ", no-TT nodes=" << res_no_tt.nodes);
        CHECK_MESSAGE(res_tt.nodes < res_no_tt.nodes,
                      "enabling the transposition table must reduce visited nodes ("
                          << res_tt.nodes << " vs " << res_no_tt.nodes << ")");
    }
}

CPPATLAS_TEST("search respects max_nodes, movetime_ms, and request_stop()") {
    const std::string_view fen =
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

    {
        // max_nodes limit stops search near the node budget
        chess::Position pos = must_fen(fen);
        chess::Searcher searcher(1);

        const chess::SearchResult res =
            searcher.search(pos, chess::SearchLimits{.max_depth = 10, .max_nodes = 2000});

        chess::MoveList legal;
        chess::generate_legal_moves(pos, legal);
        CHECK(res.depth >= 1);
        CHECK(res.nodes > 0);
        CHECK_MESSAGE(res.nodes <= 20000,
                      "max_nodes=2000 should terminate near the node budget (visited " << res.nodes
                                                                                       << ")");
        REQUIRE(!res.best_move.is_null());
        CHECK(legal.contains(res.best_move));
    }

    {
        // movetime_ms limit returns promptly with a legal move
        chess::Position pos = must_fen(fen);
        chess::Searcher searcher(1);

        const auto t0 = std::chrono::steady_clock::now();
        const chess::SearchResult res =
            searcher.search(pos, chess::SearchLimits{.max_depth = 20, .movetime_ms = 100});
        const auto elapsed_ms =
            std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() -
                                                                  t0)
                .count();

        chess::MoveList legal;
        chess::generate_legal_moves(pos, legal);
        CHECK(res.depth >= 1);
        CHECK(res.nodes > 0);
        CHECK_MESSAGE(elapsed_ms < 1500,
                      "movetime_ms=100 took " << elapsed_ms << " ms (> 1500 ms)");
        REQUIRE(!res.best_move.is_null());
        CHECK(legal.contains(res.best_move));
    }

    {
        // request_stop() halts iterative deepening cleanly
        chess::Position pos = must_fen(fen);
        chess::Searcher searcher(1);

        const chess::SearchResult res = searcher.search(
            pos, chess::SearchLimits{.max_depth = 20},
            [&](const chess::SearchInfo& info) {
                if (info.depth >= 2) searcher.request_stop();
            });

        chess::MoveList legal;
        chess::generate_legal_moves(pos, legal);
        CHECK(res.depth >= 2);
        CHECK(res.depth < 20);
        REQUIRE(!res.best_move.is_null());
        CHECK(legal.contains(res.best_move));
    }
}

CPPATLAS_TEST("iterative deepening with TT solves a mate-in-3 puzzle at depth 6") {
    // 1. Qxe8+ Rxe8 2. Rxe8+ Rxe8 3. Rxe8#
    chess::Position pos = must_fen("r1r1b1k1/5ppp/8/8/8/4Q3/4RPPP/4R1K1 w - - 0 1");
    const chess::Move expected = must_uci_move(pos, "e3e8");

    chess::Searcher searcher(2);
    const chess::SearchResult res = searcher.search(pos, chess::SearchLimits{.max_depth = 6});

    chess::MoveList legal;
    chess::generate_legal_moves(pos, legal);
    REQUIRE(!res.best_move.is_null());
    CHECK(legal.contains(res.best_move));
    CHECK(res.best_move == expected);
    CHECK(res.score > chess::MATE_THRESHOLD);
    verify_legal_pv(pos, res.pv);
}
