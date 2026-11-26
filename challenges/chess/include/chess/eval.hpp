#pragma once

#include <chess/position.hpp>

namespace chess {

inline constexpr int INF_SCORE = 30000;
inline constexpr int MATE_SCORE = 29000;
inline constexpr int MATE_THRESHOLD = 28000;

inline int evaluate(const Position& pos) noexcept {
    (void)pos;
    return 0;
}

}  // namespace chess
