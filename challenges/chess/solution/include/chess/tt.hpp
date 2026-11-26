#pragma once

#include <chess/eval.hpp>
#include <chess/types.hpp>

#include <algorithm>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace chess {

enum class TTBound : std::uint8_t { None = 0, Exact = 1, Lower = 2, Upper = 3 };

struct TTEntry {
    std::uint64_t key = 0;
    Move best_move{};
    std::int16_t score = 0;
    std::uint8_t depth = 0;
    TTBound bound = TTBound::None;
};

class TranspositionTable {
public:
    explicit TranspositionTable(std::size_t megabytes = 16) { resize_mb(megabytes); }

    void clear() noexcept { std::fill(entries_.begin(), entries_.end(), TTEntry{}); }

    void resize_mb(std::size_t mb) {
        const std::size_t bytes =
            (mb == 0) ? sizeof(TTEntry) : (mb * std::size_t{1024} * std::size_t{1024});
        const std::size_t raw_count = std::max<std::size_t>(1, bytes / sizeof(TTEntry));
        const std::size_t pow2_count = std::bit_floor(raw_count);
        entries_.assign(pow2_count, TTEntry{});
        mask_ = pow2_count - 1;
    }

    std::size_t size() const noexcept { return entries_.size(); }

    bool probe(std::uint64_t key, TTEntry& out) const noexcept {
        if (entries_.empty()) return false;
        const TTEntry& e = entries_[key & mask_];
        if (e.bound != TTBound::None && e.key == key) {
            out = e;
            return true;
        }
        return false;
    }

    void store(std::uint64_t key, int depth, int score, TTBound bound, Move best_move,
               int ply) noexcept {
        if (entries_.empty()) return;
        TTEntry& e = entries_[key & mask_];

        int stored_score = score;
        if (stored_score > MATE_THRESHOLD) {
            stored_score += ply;
        } else if (stored_score < -MATE_THRESHOLD) {
            stored_score -= ply;
        }

        const std::uint8_t d = static_cast<std::uint8_t>(std::clamp(depth, 0, 255));
        if (e.bound != TTBound::None && e.key == key && d < e.depth && bound != TTBound::Exact) {
            if (e.best_move.is_null() && !best_move.is_null()) {
                e.best_move = best_move;
            }
            return;
        }

        const Move move_to_store =
            (best_move.is_null() && e.key == key) ? e.best_move : best_move;
        e.key = key;
        e.best_move = move_to_store;
        e.score = static_cast<std::int16_t>(std::clamp(stored_score, -32767, 32767));
        e.depth = d;
        e.bound = bound;
    }

private:
    std::vector<TTEntry> entries_;
    std::size_t mask_ = 0;
};

}  // namespace chess
