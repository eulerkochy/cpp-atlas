#include <chess/chess.hpp>

#include <algorithm>
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace {

inline void escape_value(std::uint64_t v) noexcept {
#if defined(__GNUC__) || defined(__clang__)
    asm volatile("" : : "r,m"(v) : "memory");
#else
    volatile std::uint64_t sink = v;
    (void)sink;
#endif
}

struct SampleInput {
    chess::Square sq;
    chess::Bitboard occ;
};

std::vector<SampleInput> build_samples(bool quick) {
    constexpr std::array<chess::Square, 8> quick_squares = {
        chess::A1, chess::D4, chess::E4, chess::H8,
        chess::A4, chess::E1, chess::C3, chess::F6,
    };

    std::vector<SampleInput> samples;
    samples.reserve(quick ? 512 : 4096);
    std::uint64_t rng = 0xD1B54A32D192ED03ULL;
    auto next_u64 = [&]() noexcept -> std::uint64_t {
        std::uint64_t z = (rng += 0x9E3779B97F4A7C15ULL);
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
        return z ^ (z >> 31);
    };

    const std::size_t target = quick ? 512 : 4096;
    for (std::size_t i = 0; i < target; ++i) {
        const chess::Square sq = quick ? quick_squares[i % quick_squares.size()]
                                       : static_cast<chess::Square>(i % 64);
        // Sparse-to-medium random occupancies matching realistic chess middlegame density
        const chess::Bitboard occ = next_u64() & next_u64();
        samples.push_back({sq, occ});
    }
    return samples;
}

template <class Fn>
double measure_ns_per_op(const std::vector<SampleInput>& samples, int rounds, Fn&& fn) {
    std::uint64_t checksum = 0;
    // Warmup
    for (const auto& s : samples) {
        checksum ^= fn(s.sq, s.occ);
    }

    const auto t0 = std::chrono::steady_clock::now();
    for (int r = 0; r < rounds; ++r) {
        for (const auto& s : samples) {
            checksum ^= fn(s.sq, s.occ);
        }
    }
    const auto t1 = std::chrono::steady_clock::now();
    escape_value(checksum);

    const double total_ns =
        static_cast<double>(std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0).count());
    const double total_ops = static_cast<double>(samples.size()) * static_cast<double>(rounds);
    return total_ns / std::max(total_ops, 1.0);
}

}  // namespace

int main(int argc, char** argv) {
    bool quick = false;
    for (int i = 1; i < argc; ++i) {
        const std::string_view arg(argv[i]);
        if (arg == "--quick") {
            quick = true;
        } else {
            std::fprintf(stderr, "usage: %s [--quick]\n", argv[0]);
            return 2;
        }
    }

    const auto samples = build_samples(quick);
    const int slow_rounds = quick ? 200 : 8000;
    const int map_rounds = quick ? 200 : 8000;
    const int magic_rounds = quick ? 2000 : 80000;

    // Build relevancy-masked std::unordered_map baseline.
    std::array<chess::Bitboard, 64> rook_masks{};
    std::array<chess::Bitboard, 64> bishop_masks{};
    std::array<std::unordered_map<chess::Bitboard, chess::Bitboard>, 64> rook_maps;
    std::array<std::unordered_map<chess::Bitboard, chess::Bitboard>, 64> bishop_maps;

    std::array<bool, 64> active_squares{};
    if (quick) {
        for (const auto& s : samples) active_squares[s.sq] = true;
    } else {
        active_squares.fill(true);
    }

    bool masks_ready = true;
    for (chess::Square sq = 0; sq < 64; ++sq) {
        rook_masks[sq] = chess::rook_relevancy_mask(sq);
        bishop_masks[sq] = chess::bishop_relevancy_mask(sq);
        if (rook_masks[sq] == 0 || bishop_masks[sq] == 0) {
            masks_ready = false;
        }
        if (!active_squares[sq]) continue;
        if (rook_masks[sq] != 0) {
            chess::for_each_subset(rook_masks[sq], [&](chess::Bitboard sub) {
                rook_maps[sq].emplace(sub, chess::rook_attacks_slow(sq, sub));
            });
        }
        if (bishop_masks[sq] != 0) {
            chess::for_each_subset(bishop_masks[sq], [&](chess::Bitboard sub) {
                bishop_maps[sq].emplace(sub, chess::bishop_attacks_slow(sq, sub));
            });
        }
    }

    if (!masks_ready) {
        std::printf("chess_bench: relevancy masks / sliding attacks are not implemented yet.\n");
        return 0;
    }

    // Force initialization of magic tables before timing.
    escape_value(chess::queen_attacks_magic(chess::D4, 0ULL));

    auto map_rook = [&](chess::Square sq, chess::Bitboard occ) -> chess::Bitboard {
        const auto& m = rook_maps[sq];
        const auto it = m.find(occ & rook_masks[sq]);
        return it != m.end() ? it->second : 0ULL;
    };
    auto map_bishop = [&](chess::Square sq, chess::Bitboard occ) -> chess::Bitboard {
        const auto& m = bishop_maps[sq];
        const auto it = m.find(occ & bishop_masks[sq]);
        return it != m.end() ? it->second : 0ULL;
    };
    auto map_queen = [&](chess::Square sq, chess::Bitboard occ) -> chess::Bitboard {
        return map_rook(sq, occ) | map_bishop(sq, occ);
    };

    const double rook_slow_ns = measure_ns_per_op(
        samples, slow_rounds,
        [](chess::Square sq, chess::Bitboard occ) { return chess::rook_attacks_slow(sq, occ); });
    const double bishop_slow_ns = measure_ns_per_op(
        samples, slow_rounds,
        [](chess::Square sq, chess::Bitboard occ) { return chess::bishop_attacks_slow(sq, occ); });
    const double queen_slow_ns = measure_ns_per_op(
        samples, slow_rounds,
        [](chess::Square sq, chess::Bitboard occ) { return chess::queen_attacks_slow(sq, occ); });

    const double rook_map_ns = measure_ns_per_op(samples, map_rounds, map_rook);
    const double bishop_map_ns = measure_ns_per_op(samples, map_rounds, map_bishop);
    const double queen_map_ns = measure_ns_per_op(samples, map_rounds, map_queen);

    const double rook_magic_ns = measure_ns_per_op(
        samples, magic_rounds,
        [](chess::Square sq, chess::Bitboard occ) { return chess::rook_attacks_magic(sq, occ); });
    const double bishop_magic_ns = measure_ns_per_op(
        samples, magic_rounds,
        [](chess::Square sq, chess::Bitboard occ) { return chess::bishop_attacks_magic(sq, occ); });
    const double queen_magic_ns = measure_ns_per_op(
        samples, magic_rounds,
        [](chess::Square sq, chess::Bitboard occ) { return chess::queen_attacks_magic(sq, occ); });

    auto safe_ratio = [](double num, double den) -> double {
        return num / std::max(den, 0.05);
    };

    std::printf("=== Sliding Attack Microbenchmark (%s) ===\n", quick ? "quick" : "full");
    std::printf("%-10s %12s %14s %12s %15s\n",
                "Piece", "Naive (ns)", "HashMap (ns)", "Magic (ns)", "Speedup vs Naive");
    std::printf("%-10s %12.2f %14.2f %12.2f %14.1fx\n",
                "Rook", rook_slow_ns, rook_map_ns, rook_magic_ns,
                safe_ratio(rook_slow_ns, rook_magic_ns));
    std::printf("%-10s %12.2f %14.2f %12.2f %14.1fx\n",
                "Bishop", bishop_slow_ns, bishop_map_ns, bishop_magic_ns,
                safe_ratio(bishop_slow_ns, bishop_magic_ns));
    std::printf("%-10s %12.2f %14.2f %12.2f %14.1fx\n",
                "Queen", queen_slow_ns, queen_map_ns, queen_magic_ns,
                safe_ratio(queen_slow_ns, queen_magic_ns));

    // Perft benchmark (Amdahl's Law in full movegen + make/unmake).
    struct PerftBench {
        const char* name;
        const char* fen;
        int depth;
        std::uint64_t expected;
    };
    const std::array<PerftBench, 2> perft_cases = {{
        {"Startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", quick ? 3 : 4,
         quick ? 8902ULL : 197281ULL},
        {"Kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
         quick ? 2 : 3, quick ? 2039ULL : 97862ULL},
    }};

    std::printf("\n=== Perft Benchmark ===\n");
    for (const auto& tc : perft_cases) {
        auto pos = chess::Position::from_fen(tc.fen);
        if (!pos.has_value()) {
            std::printf("%-10s depth %d: skipped (Position::from_fen unavailable)\n",
                        tc.name, tc.depth);
            continue;
        }
        const auto t0 = std::chrono::steady_clock::now();
        const std::uint64_t nodes = chess::perft(*pos, tc.depth);
        const auto t1 = std::chrono::steady_clock::now();
        const double secs = std::max(
            static_cast<double>(std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0).count()) /
                1e9,
            1e-9);
        const double mnps = (static_cast<double>(nodes) / 1e6) / secs;
        std::printf("%-10s depth %d: %8llu nodes in %6.2f ms (%.2f Mnodes/s)%s\n",
                    tc.name, tc.depth, static_cast<unsigned long long>(nodes),
                    secs * 1e3, mnps,
                    (nodes == tc.expected ? "" : " [MISMATCH]"));
    }

    return 0;
}
