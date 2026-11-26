// Stage 6 - evaluation
// Spec: https://cppatlas.com/build/chess/evaluation
//
// Static evaluation from the side-to-move's perspective:
//   - Score constants: INF_SCORE > MATE_SCORE > MATE_THRESHOLD > 0
//   - Material balance, piece-square tables, and tapered/endgame awareness
//   - Color-flip / rank-mirror symmetry and side-to-move sign negation
//   - Bounded strictly inside (-MATE_THRESHOLD, MATE_THRESHOLD)
#include "support/harness.hpp"

#include <cctype>
#include <concepts>
#include <expected>
#include <sstream>
#include <string>
#include <string_view>

namespace preflight {

CPPATLAS_PREFLIGHT(has_from_fen,
                   "stage 6 (evaluation) builds on stage 1: chess::Position needs "
                   "`static std::expected<Position, std::string> from_fen(std::string_view)`.",
                   chess::Position,
                   requires(std::string_view fen) {
                       { V::from_fen(fen) } -> std::same_as<std::expected<V, std::string>>;
                   });

CPPATLAS_PREFLIGHT(has_startpos,
                   "stage 6 (evaluation) builds on stage 1: chess::Position needs "
                   "`static Position startpos()`.",
                   chess::Position,
                   requires {
                       { V::startpos() } -> std::same_as<V>;
                   });

CPPATLAS_PREFLIGHT(has_score_constants,
                   "stage 6 (evaluation): chess namespace needs integer constants "
                   "`INF_SCORE`, `MATE_SCORE`, and `MATE_THRESHOLD`.",
                   chess::Position,
                   requires {
                       { chess::INF_SCORE } -> std::convertible_to<int>;
                       { chess::MATE_SCORE } -> std::convertible_to<int>;
                       { chess::MATE_THRESHOLD } -> std::convertible_to<int>;
                   });

CPPATLAS_PREFLIGHT(has_evaluate,
                   "stage 6 (evaluation): chess namespace needs "
                   "`int evaluate(const Position& pos)`.",
                   chess::Position,
                   requires(const V& pos) {
                       { chess::evaluate(pos) } -> std::same_as<int>;
                   });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_from_fen && preflight::has_startpos &&
                    preflight::has_score_constants && preflight::has_evaluate);

namespace {

inline chess::Position must_fen(std::string_view fen) {
    auto res = chess::Position::from_fen(fen);
    INFO("FEN: " << fen);
    REQUIRE_MESSAGE(res.has_value(),
                    "Position::from_fen failed (stage 1 prerequisite): "
                        << (res.has_value() ? std::string{} : res.error()));
    return *res;
}

inline std::string swap_case_str(std::string_view s) {
    std::string out(s);
    for (char& ch : out) {
        const auto uch = static_cast<unsigned char>(ch);
        if (std::isupper(uch)) {
            ch = static_cast<char>(std::tolower(uch));
        } else if (std::islower(uch)) {
            ch = static_cast<char>(std::toupper(uch));
        }
    }
    return out;
}

// Produces the color-flipped, rank-mirrored twin (1<->8, White<->Black, stm toggled,
// castling rights swapped White<->Black, ep rank flipped 3<->6).
inline std::string mirror_fen_colors_and_ranks(std::string_view fen) {
    std::istringstream iss{std::string(fen)};
    std::string board, stm, castling, ep, halfmove, fullmove;
    iss >> board >> stm >> castling >> ep >> halfmove >> fullmove;

    std::string ranks[8];
    std::size_t idx = 0;
    std::size_t start = 0;
    while (idx < 8) {
        const std::size_t slash = board.find('/', start);
        const std::string_view rank_sv =
            (slash == std::string::npos) ? std::string_view(board).substr(start)
                                         : std::string_view(board).substr(start, slash - start);
        ranks[idx++] = swap_case_str(rank_sv);
        if (slash == std::string::npos) break;
        start = slash + 1;
    }

    std::string mirrored_board;
    for (int i = 7; i >= 0; --i) {
        if (i < 7) mirrored_board.push_back('/');
        mirrored_board += ranks[i];
    }

    const std::string mirrored_stm = (stm == "w") ? "b" : "w";

    std::string mirrored_castling;
    if (castling != "-") {
        if (castling.find('k') != std::string::npos) mirrored_castling.push_back('K');
        if (castling.find('q') != std::string::npos) mirrored_castling.push_back('Q');
        if (castling.find('K') != std::string::npos) mirrored_castling.push_back('k');
        if (castling.find('Q') != std::string::npos) mirrored_castling.push_back('q');
    }
    if (mirrored_castling.empty()) mirrored_castling = "-";

    std::string mirrored_ep = ep;
    if (ep.size() == 2) {
        if (ep[1] == '3') mirrored_ep[1] = '6';
        else if (ep[1] == '6') mirrored_ep[1] = '3';
    }

    return mirrored_board + " " + mirrored_stm + " " + mirrored_castling + " " +
           mirrored_ep + " " + halfmove + " " + fullmove;
}

inline std::string toggle_stm_fen(std::string_view fen) {
    std::istringstream iss{std::string(fen)};
    std::string board, stm, castling, ep, halfmove, fullmove;
    iss >> board >> stm >> castling >> ep >> halfmove >> fullmove;
    const std::string next_stm = (stm == "w") ? "b" : "w";
    return board + " " + next_stm + " " + castling + " " + ep + " " + halfmove + " " + fullmove;
}

}  // namespace

CPPATLAS_TEST("score constants satisfy INF_SCORE > MATE_SCORE > MATE_THRESHOLD > 0") {
    INFO("INF_SCORE=" << chess::INF_SCORE << ", MATE_SCORE=" << chess::MATE_SCORE
                      << ", MATE_THRESHOLD=" << chess::MATE_THRESHOLD);
    CHECK(chess::MATE_THRESHOLD > 10000);
    CHECK(chess::MATE_SCORE > chess::MATE_THRESHOLD);
    CHECK(chess::INF_SCORE > chess::MATE_SCORE);
}

CPPATLAS_TEST("startpos evaluates to exactly 0") {
    const chess::Position pos = must_fen(chess::STARTPOS_FEN);
    const chess::Position start = chess::Position::startpos();
    INFO("symmetric starting position must have static evaluation 0");
    CHECK(chess::evaluate(pos) == 0);
    CHECK(chess::evaluate(start) == 0);
}

CPPATLAS_TEST("color-flipped and rank-mirrored twin positions evaluate identically") {
    const std::string_view fens[] = {
        // Asymmetric Sicilian/Italian middlegame with castling rights
        "r1bqk2r/pp1pppbp/2n2np1/2p5/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 2 5",
        // Asymmetric castling rights + en passant target square
        "r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N2N2/PPP1BPPP/R1BQK2R w Kq d6 0 8",
        // Materially imbalanced middlegame (White up an exchange + pawn)
        "2r2rk1/1p1nbppp/p2p1n2/4p3/3NP3/1BN1BP2/PPPQ2PP/2KR3R w - - 0 14",
        // Endgame with passed pawn and active king
        "8/5pk1/6p1/3P3p/4K3/8/6PP/8 b - - 0 40",
        // Queen vs Rook + minor piece imbalance
        "3r1rk1/ppp2ppp/2n5/3q4/3P4/2N2N2/PPP2PPP/R2Q1RK1 b - - 0 12",
    };

    for (const std::string_view fen : fens) {
        const std::string flipped = mirror_fen_colors_and_ranks(fen);
        const chess::Position pos = must_fen(fen);
        const chess::Position twin = must_fen(flipped);
        const int eval_pos = chess::evaluate(pos);
        const int eval_twin = chess::evaluate(twin);
        INFO("original FEN: " << fen);
        INFO("mirrored FEN: " << flipped);
        CHECK_MESSAGE(eval_pos == eval_twin,
                      "color-flipped & rank-mirrored position should have equal side-to-move eval "
                      "(got "
                          << eval_pos << " vs " << eval_twin
                          << ") -> verify PST rank flipping and piece-color signs");
    }
}

CPPATLAS_TEST("flipping only side-to-move negates static evaluation") {
    const std::string_view fens[] = {
        "r2q1rk1/ppp1bppp/2np1n2/4p3/3PP3/2N2N1P/PPP1BPP1/R1BQ1RK1 w - - 0 9",
        "4k3/8/8/3Q4/8/8/4P3/4K3 w - - 0 1",
        "2r2rk1/pp2bppp/2n1pn2/q7/3P4/2N1BN2/PPQ1BPPP/2R2RK1 w - - 0 12",
        "8/2p2pk1/6p1/3P4/4K3/8/6PP/8 w - - 0 35",
    };

    for (const std::string_view fen : fens) {
        const std::string black_fen = toggle_stm_fen(fen);
        const chess::Position white_pos = must_fen(fen);
        const chess::Position black_pos = must_fen(black_fen);
        const int eval_w = chess::evaluate(white_pos);
        const int eval_b = chess::evaluate(black_pos);
        INFO("white-to-move FEN: " << fen);
        INFO("black-to-move FEN: " << black_fen);
        CHECK_MESSAGE(eval_w == -eval_b,
                      "evaluate() must return score relative to side-to-move "
                      "(evaluate(white) == -evaluate(black), got "
                          << eval_w << " vs " << eval_b << ")");
    }
}

CPPATLAS_TEST("material advantage ordering and minimum centipawn margins") {
    // Symmetric base with equal pawns and kings -> eval == 0.
    // Adding a single White piece on d3/c3 isolates material value cleanly.
    const int eval_equal = chess::evaluate(must_fen("4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 1"));
    const int eval_pawn = chess::evaluate(must_fen("4k3/pppp4/8/8/8/3P4/PPPP4/4K3 w - - 0 1"));
    const int eval_knight = chess::evaluate(must_fen("4k3/pppp4/8/8/8/2N5/PPPP4/4K3 w - - 0 1"));
    const int eval_bishop = chess::evaluate(must_fen("4k3/pppp4/8/8/8/2B5/PPPP4/4K3 w - - 0 1"));
    const int eval_rook = chess::evaluate(must_fen("4k3/pppp4/8/8/8/2R5/PPPP4/4K3 w - - 0 1"));
    const int eval_queen = chess::evaluate(must_fen("4k3/pppp4/8/8/8/2Q5/PPPP4/4K3 w - - 0 1"));

    INFO("equal=" << eval_equal << " +P=" << eval_pawn << " +N=" << eval_knight
                  << " +B=" << eval_bishop << " +R=" << eval_rook << " +Q=" << eval_queen);

    CHECK(eval_equal == 0);
    CHECK(eval_pawn >= 50);
    CHECK(eval_knight >= 200);
    CHECK(eval_bishop >= 200);
    CHECK(eval_rook >= 350);
    CHECK(eval_queen >= 700);

    CHECK(eval_pawn > eval_equal);
    CHECK(eval_knight > eval_pawn);
    CHECK(eval_bishop > eval_pawn);
    CHECK(eval_rook > eval_knight);
    CHECK(eval_rook > eval_bishop);
    CHECK(eval_queen > eval_rook);
}

CPPATLAS_TEST("side-to-move perspective reflects winning or losing material") {
    const std::string_view white_up_queen_w =
        "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const std::string_view white_up_queen_b =
        "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";

    const int score_w = chess::evaluate(must_fen(white_up_queen_w));
    const int score_b = chess::evaluate(must_fen(white_up_queen_b));

    CHECK_MESSAGE(score_w > 700,
                  "when White is up a Queen and White is to move, evaluate() must be > +700 (got "
                      << score_w << ")");
    CHECK_MESSAGE(score_b < -700,
                  "when White is up a Queen and Black is to move, evaluate() must be < -700 (got "
                      << score_b << ")");
    CHECK(score_w == -score_b);

    const int black_up_rook_b =
        chess::evaluate(must_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR b - - 0 1"));
    CHECK(black_up_rook_b > 350);
}

CPPATLAS_TEST("piece-square tables reward centralization and active endgame king") {
    {
        // centralized knight scores higher than corner knight
        const int central_nf3 = chess::evaluate(must_fen("4k3/8/8/8/8/5N2/8/4K3 w - - 0 1"));
        const int central_nd4 = chess::evaluate(must_fen("4k3/8/8/8/3N4/8/8/4K3 w - - 0 1"));
        const int corner_na1 = chess::evaluate(must_fen("4k3/8/8/8/8/8/8/N3K3 w - - 0 1"));
        const int corner_nh1 = chess::evaluate(must_fen("4k3/8/8/8/8/8/8/4K2N w - - 0 1"));

        INFO("Nf3=" << central_nf3 << " Nd4=" << central_nd4 << " Na1=" << corner_na1
                    << " Nh1=" << corner_nh1);
        CHECK(central_nf3 > corner_na1);
        CHECK(central_nf3 > corner_nh1);
        CHECK(central_nd4 > corner_na1);
        CHECK(central_nd4 > corner_nh1);
    }

    {
        // central pawn scores higher than passive rim pawn
        const int central_e4 = chess::evaluate(must_fen("4k3/8/8/8/4P3/8/8/4K3 w - - 0 1"));
        const int central_d4 = chess::evaluate(must_fen("4k3/8/8/8/3P4/8/8/4K3 w - - 0 1"));
        const int rim_a3 = chess::evaluate(must_fen("4k3/8/8/8/8/P7/8/4K3 w - - 0 1"));
        const int rim_h3 = chess::evaluate(must_fen("4k3/8/8/8/8/7P/8/4K3 w - - 0 1"));

        INFO("e4=" << central_e4 << " d4=" << central_d4 << " a3=" << rim_a3 << " h3=" << rim_h3);
        CHECK(central_e4 > rim_a3);
        CHECK(central_e4 > rim_h3);
        CHECK(central_d4 > rim_a3);
        CHECK(central_d4 > rim_h3);
    }

    {
        // endgame king near center scores higher than corner king
        const int king_e4 = chess::evaluate(must_fen("4k3/8/8/8/4K3/4P3/8/8 w - - 0 1"));
        const int king_a1 = chess::evaluate(must_fen("4k3/8/8/8/8/4P3/8/K7 w - - 0 1"));

        INFO("Ke4=" << king_e4 << " Ka1=" << king_a1);
        CHECK_MESSAGE(king_e4 > king_a1,
                      "in a K+P vs K endgame, centralized king (e4) must outscore corner king (a1)");
    }
}

CPPATLAS_TEST("static evaluation stays strictly inside (-MATE_THRESHOLD, MATE_THRESHOLD)") {
    const std::string_view fens[] = {
        chess::STARTPOS_FEN,
        "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
        "4k3/QQQQQQQQ/8/8/8/8/8/4K3 w - - 0 1",
        "4k3/qqqqqqqq/8/8/8/8/8/4K3 b - - 0 1",
        "4k3/8/8/8/8/8/qqqqqqqq/4K3 w - - 0 1",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    };

    for (const std::string_view fen : fens) {
        const int score = chess::evaluate(must_fen(fen));
        INFO("FEN: " << fen << ", score=" << score);
        CHECK(score > -chess::MATE_THRESHOLD);
        CHECK(score < chess::MATE_THRESHOLD);
    }
}
