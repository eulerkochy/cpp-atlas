#pragma once

#include <chess/eval.hpp>
#include <chess/movegen.hpp>
#include <chess/position.hpp>
#include <chess/tt.hpp>
#include <chess/types.hpp>

#include <atomic>
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
        (void)pos;
        (void)limits;
        (void)on_info;
        return {};
    }

    int quiesce(Position& pos, int alpha, int beta, int ply) {
        (void)pos;
        (void)alpha;
        (void)beta;
        (void)ply;
        return 0;
    }

private:
    TranspositionTable tt_;
    bool use_tt_ = true;
    std::atomic<bool> stop_{false};
};

}  // namespace chess
