// Stage 9 - uci-protocol
// Spec: https://cppatlas.com/build/chess/uci-protocol
//
// Draw detection and UCI protocol engine:
//   - Position::is_fifty_move_draw(), is_insufficient_material(), is_repetition(threshold)
//   - UciEngine commands: uci, isready, ucinewgame, position startpos/fen [moves ...],
//     go depth/movetime/nodes, quit
//   - End-to-end mini self-play via UciEngine
#include "support/harness.hpp"

#include <concepts>
#include <expected>
#include <istream>
#include <optional>
#include <ostream>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

namespace preflight {

CPPATLAS_PREFLIGHT(has_draw_detection,
                   "stage 9 (uci-protocol): chess::Position needs "
                   "`bool is_repetition(int threshold = 3) const`, "
                   "`bool is_fifty_move_draw() const`, and "
                   "`bool is_insufficient_material() const`.",
                   chess::Position,
                   requires(const V& pos, int threshold) {
                       { pos.is_repetition() } -> std::same_as<bool>;
                       { pos.is_repetition(threshold) } -> std::same_as<bool>;
                       { pos.is_fifty_move_draw() } -> std::same_as<bool>;
                       { pos.is_insufficient_material() } -> std::same_as<bool>;
                   });

CPPATLAS_PREFLIGHT(has_uci_engine,
                   "stage 9 (uci-protocol): chess::UciEngine needs "
                   "`explicit UciEngine(std::ostream&)`, `bool process_line(std::string_view)`, "
                   "`void loop(std::istream&)`, and `const Position& position() const`.",
                   chess::UciEngine,
                   std::constructible_from<V, std::ostream&> &&
                       requires(V& engine, const V& cengine, std::string_view line, std::istream& in) {
                           { engine.process_line(line) } -> std::same_as<bool>;
                           engine.loop(in);
                           { cengine.position() } -> std::same_as<const chess::Position&>;
                       });

CPPATLAS_PREFLIGHT(has_prereq_api,
                   "stage 9 (uci-protocol) builds on stages 1-5: Position::from_fen, startpos, "
                   "make_move, unmake_move, generate_legal_moves, and parse_uci_move are required.",
                   chess::Position,
                   requires(V& pos, const V& cpos, std::string_view fen, chess::Move m,
                            chess::UndoState& u, chess::MoveList& out, std::string_view uci) {
                       { V::from_fen(fen) } -> std::same_as<std::expected<V, std::string>>;
                       { V::startpos() } -> std::same_as<V>;
                       { cpos.to_fen() } -> std::same_as<std::string>;
                       pos.make_move(m, u);
                       pos.unmake_move(m, u);
                       chess::generate_legal_moves(pos, out);
                       { chess::parse_uci_move(pos, uci) } -> std::same_as<std::optional<chess::Move>>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_draw_detection && preflight::has_uci_engine &&
                    preflight::has_prereq_api);

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

inline std::vector<std::string> split_lines(const std::string& text) {
    std::vector<std::string> lines;
    std::istringstream iss(text);
    std::string line;
    while (std::getline(iss, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        lines.push_back(line);
    }
    return lines;
}

inline std::string extract_bestmove(const std::string& output) {
    for (const std::string& line : split_lines(output)) {
        if (line.rfind("bestmove ", 0) == 0) {
            std::istringstream iss(line.substr(9));
            std::string move_tok;
            iss >> move_tok;
            return move_tok;
        }
    }
    return {};
}

}  // namespace

CPPATLAS_TEST("is_fifty_move_draw detects halfmove clock >= 100 and resets on pawn move") {
    const chess::Position clock_99 = must_fen("4k3/8/8/8/8/8/4P3/4K2R w - - 99 60");
    const chess::Position clock_100 = must_fen("4k3/8/8/8/8/8/4P3/4K2R w - - 100 60");

    CHECK_FALSE(clock_99.is_fifty_move_draw());
    CHECK(clock_100.is_fifty_move_draw());

    // Play 100 quiet non-pawn plies from halfmove clock 0.
    chess::Position pos = must_fen("6k1/8/8/8/8/8/4P3/R3K3 w - - 0 1");
    const char* white_cycle[4] = {"a1b1", "b1b2", "b2a2", "a2a1"};
    const char* black_cycle[4] = {"g8h8", "h8g8", "g8h8", "h8g8"};
    for (int ply = 0; ply < 100; ++ply) {
        CHECK_FALSE(pos.is_fifty_move_draw());
        const char* uci = (ply % 2 == 0) ? white_cycle[(ply / 2) % 4] : black_cycle[(ply / 2) % 4];
        const chess::Move m = must_uci_move(pos, uci);
        chess::UndoState u{};
        pos.make_move(m, u);
    }
    CHECK(pos.halfmove_clock() == 100);
    CHECK(pos.is_fifty_move_draw());

    // A pawn move resets the halfmove clock to 0.
    const chess::Move pawn_push = must_uci_move(pos, "e2e4");
    chess::UndoState u{};
    pos.make_move(pawn_push, u);
    CHECK(pos.halfmove_clock() == 0);
    CHECK_FALSE(pos.is_fifty_move_draw());
}

CPPATLAS_TEST("is_insufficient_material classifies trivial and non-trivial endgames") {
    struct Case {
        const char* name;
        const char* fen;
        bool expected;
    };

    const Case cases[] = {
        {"K vs K", "4k3/8/8/8/8/8/8/4K3 w - - 0 1", true},
        {"K+N vs K", "4k3/8/8/8/8/8/8/4K1N1 w - - 0 1", true},
        {"K vs K+N", "4k1n1/8/8/8/8/8/8/4K3 w - - 0 1", true},
        {"K+B vs K", "4k3/8/8/8/8/8/8/4K1B1 w - - 0 1", true},
        {"K vs K+B", "4k1b1/8/8/8/8/8/8/4K3 w - - 0 1", true},
        {"K+B vs K+B same dark square color (c1, f8)", "4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1", true},
        {"K+B vs K+B same light square color (f1, c8)", "2b1k3/8/8/8/8/8/8/4KB2 w - - 0 1", true},
        {"K+P vs K", "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", false},
        {"K+R vs K", "4k3/8/8/8/8/8/8/4K2R w - - 0 1", false},
        {"K+Q vs K", "4k3/8/8/8/8/8/8/3QK3 w - - 0 1", false},
        {"K+B vs K+B opposite square colors (c1, c8)", "2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1", false},
    };

    for (const auto& tc : cases) {
        INFO("case: " << tc.name << ", FEN: " << tc.fen);
        const chess::Position pos = must_fen(tc.fen);
        CHECK(pos.is_insufficient_material() == tc.expected);
    }
}

CPPATLAS_TEST("is_repetition detects threefold repetition and respects unmake_move") {
    chess::Position pos = must_fen(chess::STARTPOS_FEN);
    CHECK_FALSE(pos.is_repetition(3));

    const char* seq[] = {"g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"};
    std::vector<chess::Move> moves;
    std::vector<chess::UndoState> undos;

    for (int i = 0; i < 4; ++i) {
        const chess::Move m = must_uci_move(pos, seq[i]);
        chess::UndoState u{};
        pos.make_move(m, u);
        moves.push_back(m);
        undos.push_back(u);
    }
    // Startpos has now occurred twice.
    CHECK(pos.is_repetition(2));
    CHECK_FALSE(pos.is_repetition(3));

    for (int i = 4; i < 8; ++i) {
        const chess::Move m = must_uci_move(pos, seq[i]);
        chess::UndoState u{};
        pos.make_move(m, u);
        moves.push_back(m);
        undos.push_back(u);
    }
    // Startpos has now occurred three times.
    CHECK(pos.is_repetition(3));
    CHECK(pos.is_repetition());

    // Unmaking the last move drops back to < 3 occurrences of startpos.
    pos.unmake_move(moves.back(), undos.back());
    CHECK_FALSE(pos.is_repetition(3));
}

CPPATLAS_TEST("UciEngine handles uci, isready, ucinewgame, and quit") {
    std::ostringstream oss;
    chess::UciEngine engine(oss);

    CHECK(engine.process_line("uci"));
    const std::string uci_out = oss.str();
    CHECK(uci_out.find("id name ") != std::string::npos);
    CHECK(uci_out.find("id author ") != std::string::npos);
    CHECK(uci_out.find("uciok") != std::string::npos);

    oss.str("");
    oss.clear();
    CHECK(engine.process_line("isready"));
    CHECK(oss.str().find("readyok") != std::string::npos);

    oss.str("");
    oss.clear();
    CHECK(engine.process_line("ucinewgame"));
    CHECK(engine.process_line("isready"));
    CHECK(oss.str().find("readyok") != std::string::npos);

    CHECK_FALSE(engine.process_line("quit"));

    // loop() stops on quit and ignores subsequent lines.
    std::ostringstream loop_out;
    chess::UciEngine loop_engine(loop_out);
    std::istringstream loop_in("uci\nisready\nquit\nisready\n");
    loop_engine.loop(loop_in);

    const std::string transcript = loop_out.str();
    CHECK(transcript.find("uciok") != std::string::npos);
    const std::size_t first_ready = transcript.find("readyok");
    REQUIRE(first_ready != std::string::npos);
    CHECK(transcript.find("readyok", first_ready + 7) == std::string::npos);
}

CPPATLAS_TEST("UciEngine position command updates startpos, fen, and moves accurately") {
    std::ostringstream oss;
    chess::UciEngine engine(oss);

    CHECK(engine.process_line("position startpos"));
    CHECK(engine.position().to_fen() == chess::STARTPOS_FEN);

    CHECK(engine.process_line("position startpos moves e2e4 e7e5 g1f3"));
    CHECK(engine.position().side_to_move() == chess::Color::Black);
    CHECK(engine.position().piece_at(chess::E4) == chess::Piece::WhitePawn);
    CHECK(engine.position().piece_at(chess::E2) == chess::Piece::None);
    CHECK(engine.position().piece_at(chess::E5) == chess::Piece::BlackPawn);
    CHECK(engine.position().piece_at(chess::F3) == chess::Piece::WhiteKnight);
    CHECK(engine.position().piece_at(chess::G1) == chess::Piece::None);

    const std::string fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    CHECK(engine.process_line("position fen " + fen + " moves c7c5 g1f3"));
    CHECK(engine.position().side_to_move() == chess::Color::Black);
    CHECK(engine.position().piece_at(chess::C5) == chess::Piece::BlackPawn);
    CHECK(engine.position().piece_at(chess::F3) == chess::Piece::WhiteKnight);
}

CPPATLAS_TEST("UciEngine go depth, movetime, nodes, and mate score output") {
    {
        // go depth 3 emits info lines and a legal bestmove
        std::ostringstream oss;
        chess::UciEngine engine(oss);
        CHECK(engine.process_line("position startpos moves e2e4 e7e5"));
        CHECK(engine.process_line("go depth 3"));

        const std::string out = oss.str();
        INFO("UCI output:\n" << out);
        CHECK(out.find("info ") != std::string::npos);
        CHECK(out.find("depth ") != std::string::npos);
        CHECK(out.find("score ") != std::string::npos);
        CHECK(out.find("pv ") != std::string::npos);

        const std::string best = extract_bestmove(out);
        REQUIRE_MESSAGE(!best.empty(), "expected `bestmove <uci>` in UCI output");
        chess::Position pos_copy = engine.position();
        CHECK(chess::parse_uci_move(pos_copy, best).has_value());
    }

    {
        // go depth 3 on mate-in-1 outputs score mate 1 and exact bestmove
        std::ostringstream oss;
        chess::UciEngine engine(oss);
        CHECK(engine.process_line("position fen 6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"));
        CHECK(engine.process_line("go depth 3"));

        const std::string out = oss.str();
        INFO("UCI output:\n" << out);
        CHECK(out.find("score mate 1") != std::string::npos);
        CHECK(extract_bestmove(out) == "e1e8");
    }

    {
        // go movetime 50 and go nodes 1000 emit legal bestmoves
        std::ostringstream oss;
        chess::UciEngine engine(oss);
        CHECK(engine.process_line("position startpos"));
        CHECK(engine.process_line("go movetime 50"));

        const std::string best_time = extract_bestmove(oss.str());
        REQUIRE(!best_time.empty());
        chess::Position p1 = engine.position();
        CHECK(chess::parse_uci_move(p1, best_time).has_value());

        oss.str("");
        oss.clear();
        CHECK(engine.process_line("go nodes 1000"));
        const std::string best_nodes = extract_bestmove(oss.str());
        REQUIRE(!best_nodes.empty());
        chess::Position p2 = engine.position();
        CHECK(chess::parse_uci_move(p2, best_nodes).has_value());
    }
}

CPPATLAS_TEST("end-to-end mini self-play via UciEngine produces 6 legal plies") {
    std::ostringstream oss;
    chess::UciEngine engine(oss);
    CHECK(engine.process_line("ucinewgame"));

    std::string moves_arg;
    chess::Position verify_pos = must_fen(chess::STARTPOS_FEN);

    for (int ply = 0; ply < 6; ++ply) {
        const std::string pos_cmd =
            moves_arg.empty() ? "position startpos" : ("position startpos moves" + moves_arg);
        CHECK(engine.process_line(pos_cmd));
        CHECK(engine.position().to_fen() == verify_pos.to_fen());

        oss.str("");
        oss.clear();
        CHECK(engine.process_line("go depth 2"));

        const std::string best = extract_bestmove(oss.str());
        INFO("ply " << ply << ", output:\n" << oss.str());
        REQUIRE_MESSAGE(!best.empty(), "expected bestmove at ply " << ply);

        const std::optional<chess::Move> parsed = chess::parse_uci_move(verify_pos, best);
        REQUIRE_MESSAGE(parsed.has_value(),
                        "UciEngine returned illegal move `" << best << "` at ply " << ply);

        chess::UndoState u{};
        verify_pos.make_move(*parsed, u);
        moves_arg += " " + best;
    }

    CHECK(engine.process_line("position startpos moves" + moves_arg));
    CHECK(engine.position().to_fen() == verify_pos.to_fen());
}
