#pragma once

#include <chess/position.hpp>

#include <algorithm>
#include <array>

namespace chess {

inline constexpr int INF_SCORE = 30000;
inline constexpr int MATE_SCORE = 29000;
inline constexpr int MATE_THRESHOLD = 28000;

namespace detail {

inline constexpr std::array<int, 6> PIECE_VALUES = {100, 320, 330, 500, 900, 0};
inline constexpr std::array<int, 6> PHASE_WEIGHTS = {0, 1, 1, 2, 4, 0};
inline constexpr int MAX_PHASE = 24;
inline constexpr int BISHOP_PAIR_BONUS = 30;

// Piece-square tables oriented visually (row 0 = rank 8, row 7 = rank 1) from White's perspective.
// White square sq maps to (sq ^ 56); Black square sq maps to sq (exact vertical mirror).

inline constexpr std::array<int, 64> PAWN_PST = {
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
};

inline constexpr std::array<int, 64> KNIGHT_PST = {
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
};

inline constexpr std::array<int, 64> BISHOP_PST = {
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
};

inline constexpr std::array<int, 64> ROOK_PST = {
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
};

inline constexpr std::array<int, 64> QUEEN_PST = {
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
};

inline constexpr std::array<int, 64> KING_MG_PST = {
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
};

inline constexpr std::array<int, 64> KING_EG_PST = {
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50
};

inline constexpr std::array<int, 8> PASSED_PAWN_MG = {0, 5, 10, 15, 25, 40, 70, 0};
inline constexpr std::array<int, 8> PASSED_PAWN_EG = {0, 10, 20, 35, 55, 85, 130, 0};

constexpr std::array<std::array<Bitboard, 64>, 2> make_passed_masks() noexcept {
    std::array<std::array<Bitboard, 64>, 2> masks{};
    for (int sq = 0; sq < 64; ++sq) {
        const int f = sq & 7;
        const int r = sq >> 3;
        Bitboard w_mask = 0;
        Bitboard b_mask = 0;
        for (int df = -1; df <= 1; ++df) {
            const int nf = f + df;
            if (nf < 0 || nf > 7) continue;
            for (int rr = r + 1; rr < 8; ++rr) {
                w_mask |= Bitboard{1} << (rr * 8 + nf);
            }
            for (int rr = r - 1; rr >= 0; --rr) {
                b_mask |= Bitboard{1} << (rr * 8 + nf);
            }
        }
        masks[0][sq] = w_mask;
        masks[1][sq] = b_mask;
    }
    return masks;
}

inline constexpr auto PASSED_PAWN_MASKS = make_passed_masks();

}  // namespace detail

inline int evaluate(const Position& pos) noexcept {
    const Color stm = pos.side_to_move();
    if (stm != Color::White && stm != Color::Black) return 0;

    int mg[2] = {0, 0};
    int eg[2] = {0, 0};
    int phase = 0;

    const Bitboard white_pawns = pos.pieces(Color::White, PieceType::Pawn);
    const Bitboard black_pawns = pos.pieces(Color::Black, PieceType::Pawn);

    auto eval_color = [&](Color c) {
        const int ci = static_cast<int>(c);
        const Bitboard enemy_pawns = (c == Color::White) ? black_pawns : white_pawns;

        // Pawns
        Bitboard bb = pos.pieces(c, PieceType::Pawn);
        while (bb != 0) {
            const Square sq = pop_lsb(bb);
            const int idx = (c == Color::White) ? (sq ^ 56) : sq;
            mg[ci] += detail::PIECE_VALUES[0] + detail::PAWN_PST[idx];
            eg[ci] += detail::PIECE_VALUES[0] + detail::PAWN_PST[idx];
            if ((detail::PASSED_PAWN_MASKS[ci][sq] & enemy_pawns) == 0) {
                const int rel_rank = (c == Color::White) ? rank_of(sq) : (7 - rank_of(sq));
                mg[ci] += detail::PASSED_PAWN_MG[rel_rank];
                eg[ci] += detail::PASSED_PAWN_EG[rel_rank];
            }
        }

        // Knights
        bb = pos.pieces(c, PieceType::Knight);
        while (bb != 0) {
            const Square sq = pop_lsb(bb);
            const int idx = (c == Color::White) ? (sq ^ 56) : sq;
            mg[ci] += detail::PIECE_VALUES[1] + detail::KNIGHT_PST[idx];
            eg[ci] += detail::PIECE_VALUES[1] + detail::KNIGHT_PST[idx];
            phase += detail::PHASE_WEIGHTS[1];
        }

        // Bishops
        bb = pos.pieces(c, PieceType::Bishop);
        int bishop_count = 0;
        while (bb != 0) {
            const Square sq = pop_lsb(bb);
            const int idx = (c == Color::White) ? (sq ^ 56) : sq;
            mg[ci] += detail::PIECE_VALUES[2] + detail::BISHOP_PST[idx];
            eg[ci] += detail::PIECE_VALUES[2] + detail::BISHOP_PST[idx];
            phase += detail::PHASE_WEIGHTS[2];
            ++bishop_count;
        }
        if (bishop_count >= 2) {
            mg[ci] += detail::BISHOP_PAIR_BONUS;
            eg[ci] += detail::BISHOP_PAIR_BONUS;
        }

        // Rooks
        bb = pos.pieces(c, PieceType::Rook);
        while (bb != 0) {
            const Square sq = pop_lsb(bb);
            const int idx = (c == Color::White) ? (sq ^ 56) : sq;
            mg[ci] += detail::PIECE_VALUES[3] + detail::ROOK_PST[idx];
            eg[ci] += detail::PIECE_VALUES[3] + detail::ROOK_PST[idx];
            phase += detail::PHASE_WEIGHTS[3];
        }

        // Queens
        bb = pos.pieces(c, PieceType::Queen);
        while (bb != 0) {
            const Square sq = pop_lsb(bb);
            const int idx = (c == Color::White) ? (sq ^ 56) : sq;
            mg[ci] += detail::PIECE_VALUES[4] + detail::QUEEN_PST[idx];
            eg[ci] += detail::PIECE_VALUES[4] + detail::QUEEN_PST[idx];
            phase += detail::PHASE_WEIGHTS[4];
        }

        // King
        const Square ksq = pos.king_square(c);
        if (is_valid_square(ksq)) {
            const int idx = (c == Color::White) ? (ksq ^ 56) : ksq;
            mg[ci] += detail::KING_MG_PST[idx];
            eg[ci] += detail::KING_EG_PST[idx];
        }
    };

    eval_color(Color::White);
    eval_color(Color::Black);

    const int mg_phase = std::min(phase, detail::MAX_PHASE);
    const int eg_phase = detail::MAX_PHASE - mg_phase;
    const int mg_score = mg[0] - mg[1];
    const int eg_score = eg[0] - eg[1];
    const int score = (mg_score * mg_phase + eg_score * eg_phase) / detail::MAX_PHASE;

    return (stm == Color::White) ? score : -score;
}

}  // namespace chess
