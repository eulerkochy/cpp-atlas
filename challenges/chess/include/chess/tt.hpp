#pragma once

#include <chess/types.hpp>

#include <cstddef>
#include <cstdint>

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
    explicit TranspositionTable(std::size_t megabytes = 16) { (void)megabytes; }

    void clear() noexcept {}

    void resize_mb(std::size_t mb) { (void)mb; }

    std::size_t size() const noexcept { return 0; }

    bool probe(std::uint64_t key, TTEntry& out) const noexcept {
        (void)key;
        (void)out;
        return false;
    }

    void store(std::uint64_t key, int depth, int score, TTBound bound, Move best_move,
               int ply) noexcept {
        (void)key;
        (void)depth;
        (void)score;
        (void)bound;
        (void)best_move;
        (void)ply;
    }
};

}  // namespace chess
