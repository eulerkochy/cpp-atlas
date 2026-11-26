#pragma once

#include <chess/position.hpp>
#include <chess/types.hpp>

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>

namespace chess {

struct MoveList {
    std::array<Move, 256> moves{};
    std::size_t count = 0;

    constexpr void push_back(Move m) noexcept {
        if (count < moves.size()) moves[count++] = m;
    }

    constexpr std::size_t size() const noexcept { return count; }
    constexpr bool empty() const noexcept { return count == 0; }
    constexpr void clear() noexcept { count = 0; }

    constexpr Move* begin() noexcept { return moves.data(); }
    constexpr Move* end() noexcept { return moves.data() + count; }
    constexpr const Move* begin() const noexcept { return moves.data(); }
    constexpr const Move* end() const noexcept { return moves.data() + count; }

    constexpr Move& operator[](std::size_t i) noexcept { return moves[i]; }
    constexpr const Move& operator[](std::size_t i) const noexcept { return moves[i]; }

    constexpr bool contains(Move m) const noexcept {
        for (std::size_t i = 0; i < count; ++i) {
            if (moves[i] == m) return true;
        }
        return false;
    }
};

inline void generate_pseudo_legal_moves(const Position& pos, MoveList& out) {
    (void)pos;
    out.clear();
}

inline void generate_legal_moves(Position& pos, MoveList& out) {
    (void)pos;
    out.clear();
}

inline void generate_legal_captures(Position& pos, MoveList& out) {
    (void)pos;
    out.clear();
}

inline std::optional<Move> parse_uci_move(Position& pos, std::string_view uci) {
    (void)pos;
    (void)uci;
    return std::nullopt;
}

inline std::uint64_t perft(Position& pos, int depth) {
    (void)pos;
    (void)depth;
    return 0;
}

}  // namespace chess
