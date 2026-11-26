#pragma once

#include <chess/eval.hpp>
#include <chess/movegen.hpp>
#include <chess/position.hpp>
#include <chess/tt.hpp>
#include <chess/types.hpp>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <vector>

namespace chess {

struct SearchLimits {
    int max_depth = 64;
    std::uint64_t max_nodes = 0;
    std::int64_t movetime_ms = 0;
};

struct SearchInfo {
    int depth = 0;
    int score = 0;
    std::uint64_t nodes = 0;
    std::int64_t time_ms = 0;
    std::vector<Move> pv;
};

struct SearchResult {
    Move best_move{};
    int score = 0;
    int depth = 0;
    std::uint64_t nodes = 0;
    std::vector<Move> pv;
};

class Searcher {
public:
    explicit Searcher(std::size_t tt_mb = 16) : tt_(tt_mb) {}

    void clear_tt() noexcept { tt_.clear(); }
    void resize_tt(std::size_t mb) { tt_.resize_mb(mb); }
    void set_use_tt(bool enabled) noexcept { use_tt_ = enabled; }
    void request_stop() noexcept { stop_.store(true, std::memory_order_relaxed); }

    SearchResult search(Position& pos, const SearchLimits& limits,
                        std::function<void(const SearchInfo&)> on_info = nullptr) {
        stop_.store(false, std::memory_order_relaxed);
        aborted_ = false;
        nodes_ = 0;
        limits_ = limits;
        start_time_ = std::chrono::steady_clock::now();

        for (auto& k : killers_) k = {Move{}, Move{}};
        for (auto& c : history_) {
            for (auto& r : c) r.fill(0);
        }

        MoveList root_moves;
        generate_legal_moves(pos, root_moves);
        if (root_moves.empty()) {
            return SearchResult{
                Move{}, pos.in_check() ? -MATE_SCORE : 0, 0, 0, {}};
        }

        SearchResult result;
        result.best_move = root_moves[0];

        const int max_depth = std::clamp(limits.max_depth, 1, MAX_PLY - 1);
        for (int depth = 1; depth <= max_depth; ++depth) {
            current_depth_ = depth;
            const int score = alphabeta(pos, depth, -INF_SCORE, INF_SCORE, 0);
            if (aborted_) break;

            result.depth = depth;
            result.score = score;
            result.nodes = nodes_;
            result.pv.clear();
            for (int i = 0; i < pv_length_[0]; ++i) {
                result.pv.push_back(pv_table_[0][i]);
            }
            if (!result.pv.empty()) {
                result.best_move = result.pv[0];
            }

            if (on_info) {
                const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                                         std::chrono::steady_clock::now() - start_time_)
                                         .count();
                on_info(SearchInfo{depth, score, nodes_, elapsed, result.pv});
            }

            if (limits.max_nodes > 0 && nodes_ >= limits.max_nodes) break;
            if (limits.movetime_ms > 0) {
                const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                                         std::chrono::steady_clock::now() - start_time_)
                                         .count();
                if (elapsed >= limits.movetime_ms) break;
            }
        }

        return result;
    }

    int quiesce(Position& pos, int alpha, int beta, int ply) {
        return quiesce_impl<false>(pos, alpha, beta, ply);
    }

private:
    static constexpr int MAX_PLY = 128;

    static int piece_value(PieceType pt) noexcept {
        switch (pt) {
        case PieceType::Pawn: return 100;
        case PieceType::Knight: return 320;
        case PieceType::Bishop: return 330;
        case PieceType::Rook: return 500;
        case PieceType::Queen: return 900;
        case PieceType::King: return 20000;
        default: return 0;
        }
    }

    static int score_capture(const Position& pos, Move m) noexcept {
        int score = 0;
        if (m.flag() == MoveFlag::EnPassant) {
            score = 100 * 10 - 100;
        } else if (m.is_capture()) {
            const Piece victim = pos.piece_at(m.to());
            const Piece attacker = pos.piece_at(m.from());
            score = piece_value(type_of(victim)) * 10 - piece_value(type_of(attacker));
        }
        if (m.is_promotion()) {
            score += piece_value(m.promotion_type());
        }
        return score;
    }

    int score_move(const Position& pos, Move m, Move tt_move, int ply) const noexcept {
        if (!tt_move.is_null() && m == tt_move) return 1000000;
        if (m.is_capture() || m.is_promotion()) {
            return 100000 + score_capture(pos, m);
        }
        if (ply < MAX_PLY) {
            if (m == killers_[ply][0]) return 50000;
            if (m == killers_[ply][1]) return 40000;
        }
        const Color us = pos.side_to_move();
        if (us == Color::White || us == Color::Black) {
            return history_[static_cast<std::size_t>(us)][m.from()][m.to()];
        }
        return 0;
    }

    static void pick_best_move(MoveList& moves, std::array<int, 256>& scores,
                               std::size_t index) noexcept {
        std::size_t best_idx = index;
        int best_score = scores[index];
        for (std::size_t i = index + 1; i < moves.size(); ++i) {
            if (scores[i] > best_score) {
                best_score = scores[i];
                best_idx = i;
            }
        }
        if (best_idx != index) {
            std::swap(moves[index], moves[best_idx]);
            std::swap(scores[index], scores[best_idx]);
        }
    }

    void check_limits() noexcept {
        if (current_depth_ <= 1) return;
        if (stop_.load(std::memory_order_relaxed)) {
            aborted_ = true;
            return;
        }
        if (limits_.max_nodes > 0 && nodes_ >= limits_.max_nodes) {
            aborted_ = true;
            return;
        }
        if (limits_.movetime_ms > 0 && (nodes_ & 1023u) == 0) {
            const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                                     std::chrono::steady_clock::now() - start_time_)
                                     .count();
            if (elapsed >= limits_.movetime_ms) {
                aborted_ = true;
            }
        }
    }

    template <bool CheckLimits>
    int quiesce_impl(Position& pos, int alpha, int beta, int ply) {
        if constexpr (CheckLimits) {
            check_limits();
            if (aborted_) return 0;
        }

        ++nodes_;

        if (ply >= MAX_PLY - 1) {
            return evaluate(pos);
        }
        if (ply > 0 && (pos.is_repetition(2) || pos.is_insufficient_material())) {
            return 0;
        }

        const bool in_check = pos.in_check();
        if (!in_check) {
            if (ply > 0 && pos.is_fifty_move_draw()) return 0;
            const int stand_pat = evaluate(pos);
            if (stand_pat >= beta) return beta;
            if (stand_pat > alpha) alpha = stand_pat;
        }

        MoveList moves;
        if (in_check) {
            generate_legal_moves(pos, moves);
            if (moves.empty()) {
                return -(MATE_SCORE - ply);
            }
        } else {
            generate_legal_captures(pos, moves);
        }

        std::array<int, 256> scores{};
        for (std::size_t i = 0; i < moves.size(); ++i) {
            scores[i] = score_capture(pos, moves[i]);
        }

        UndoState undo;
        for (std::size_t i = 0; i < moves.size(); ++i) {
            pick_best_move(moves, scores, i);
            const Move m = moves[i];
            pos.make_move(m, undo);
            const int score = -quiesce_impl<CheckLimits>(pos, -beta, -alpha, ply + 1);
            pos.unmake_move(m, undo);
            if constexpr (CheckLimits) {
                if (aborted_) return 0;
            }
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }

        return alpha;
    }

    int alphabeta(Position& pos, int depth, int alpha, int beta, int ply) {
        if (ply < MAX_PLY) pv_length_[ply] = 0;

        check_limits();
        if (aborted_) return 0;

        if (ply > 0 && (pos.is_repetition(2) || pos.is_insufficient_material())) {
            return 0;
        }

        if (depth <= 0) {
            return quiesce_impl<true>(pos, alpha, beta, ply);
        }

        if (ply >= MAX_PLY - 1) {
            ++nodes_;
            return evaluate(pos);
        }

        ++nodes_;

        const int orig_alpha = alpha;
        Move tt_move{};
        if (use_tt_) {
            TTEntry entry{};
            if (tt_.probe(pos.hash(), entry)) {
                tt_move = entry.best_move;
                if (ply > 0 && entry.depth >= depth) {
                    int tt_score = entry.score;
                    if (tt_score > MATE_THRESHOLD) {
                        tt_score -= ply;
                    } else if (tt_score < -MATE_THRESHOLD) {
                        tt_score += ply;
                    }
                    if (entry.bound == TTBound::Exact) return tt_score;
                    if (entry.bound == TTBound::Lower && tt_score >= beta) return tt_score;
                    if (entry.bound == TTBound::Upper && tt_score <= alpha) return tt_score;
                }
            }
        }

        MoveList moves;
        generate_legal_moves(pos, moves);
        if (moves.empty()) {
            return pos.in_check() ? -(MATE_SCORE - ply) : 0;
        }

        if (ply > 0 && pos.is_fifty_move_draw()) {
            return 0;
        }

        std::array<int, 256> scores{};
        for (std::size_t i = 0; i < moves.size(); ++i) {
            scores[i] = score_move(pos, moves[i], tt_move, ply);
        }

        int best_score = -INF_SCORE;
        Move best_move = moves[0];
        UndoState undo;

        for (std::size_t i = 0; i < moves.size(); ++i) {
            pick_best_move(moves, scores, i);
            const Move m = moves[i];

            pos.make_move(m, undo);
            const int score = -alphabeta(pos, depth - 1, -beta, -alpha, ply + 1);
            pos.unmake_move(m, undo);

            if (aborted_) return 0;

            if (score > best_score) {
                best_score = score;
                best_move = m;
                if (score > alpha) {
                    alpha = score;
                    if (ply < MAX_PLY) {
                        pv_table_[ply][0] = m;
                        const int child_len = (ply + 1 < MAX_PLY) ? pv_length_[ply + 1] : 0;
                        const int copy_len = std::min(child_len, MAX_PLY - 1 - ply);
                        for (int j = 0; j < copy_len; ++j) {
                            pv_table_[ply][1 + j] = pv_table_[ply + 1][j];
                        }
                        pv_length_[ply] = 1 + copy_len;
                    }
                    if (alpha >= beta) {
                        if (!m.is_capture() && !m.is_promotion() && ply < MAX_PLY) {
                            if (killers_[ply][0] != m) {
                                killers_[ply][1] = killers_[ply][0];
                                killers_[ply][0] = m;
                            }
                            const Color us = pos.side_to_move();
                            if (us == Color::White || us == Color::Black) {
                                int& h = history_[static_cast<std::size_t>(us)][m.from()][m.to()];
                                h = std::min(30000, h + depth * depth);
                            }
                        }
                        break;
                    }
                }
            }
        }

        if (use_tt_ && !aborted_) {
            TTBound bound = TTBound::Exact;
            if (best_score <= orig_alpha) {
                bound = TTBound::Upper;
            } else if (best_score >= beta) {
                bound = TTBound::Lower;
            }
            tt_.store(pos.hash(), depth, best_score, bound, best_move, ply);
        }

        return best_score;
    }

    TranspositionTable tt_;
    bool use_tt_ = true;
    std::atomic<bool> stop_{false};

    bool aborted_ = false;
    int current_depth_ = 0;
    std::uint64_t nodes_ = 0;
    SearchLimits limits_{};
    std::chrono::steady_clock::time_point start_time_{};

    std::array<std::array<Move, 2>, MAX_PLY> killers_{};
    std::array<std::array<std::array<int, 64>, 64>, 2> history_{};
    std::array<std::array<Move, MAX_PLY>, MAX_PLY> pv_table_{};
    std::array<int, MAX_PLY> pv_length_{};
};

}  // namespace chess
