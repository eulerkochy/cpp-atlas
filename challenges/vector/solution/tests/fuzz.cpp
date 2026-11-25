// solution/tests/fuzz.cpp - differential fuzzer: my::vector (reference solution)
// against std::vector, with random exception injection.
//
// Build (from challenges/vector), e.g.:
//   g++-16 -std=c++23 -Wall -Wextra -g -fsanitize=address,undefined
//          -I solution/include -I tests/support -I tests solution/tests/fuzz.cpp -o fuzz
//   ./fuzz [sequences-per-type] [steps-per-sequence] [seed]
//
// For each element type, random operation sequences are applied to a
// my::vector<X> and a std::vector<X>; after every step the contents (values)
// must agree, the instrumented ledger must show no lifetime errors, and the
// number of live elements must equal the sum of the sizes of all vectors in
// play. Exception injection (cppatlas::ThrowOn) is applied to the my::vector
// operation only; when it fires, the strong guarantee is checked where the
// standard gives it (vector unchanged: same values, size, capacity, data()),
// otherwise only validity (basic guarantee), after which the reference model
// is resynchronised from my::vector's observed state.
//
// When no injection fired and neither vector reallocated, the element
// operation counts (copy/move ctor/assign, dtor) of my::vector and std::vector
// for the same operation are compared and mismatches are tallied per op kind.
#include <my/vector.hpp>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <random>
#include <string>
#include <vector>

#include "tracked.hpp"

using namespace cppatlas;

namespace {

// A move-only type whose move constructor may throw: only the basic guarantee.
inline constexpr TrackedTraits kThrowingMoveOnly{.copyable = false, .noexcept_move = false};
using ThrowingMoveOnly = BasicTracked<kThrowingMoveOnly>;

long g_failures = 0;
long g_steps = 0;
long g_injected = 0;
long g_strong_checked = 0;
long g_basic_checked = 0;
std::map<std::string, long> g_count_cmp;       // op -> comparisons
std::map<std::string, long> g_count_mismatch;  // op -> mismatches
std::map<std::string, std::string> g_mismatch_example;

#define FUZZ_CHECK(cond, ...)                                                            \
    do {                                                                                 \
        if (!(cond)) {                                                                   \
            ++g_failures;                                                                \
            std::fprintf(stderr, "FAIL [%s] step %ld op %s: %s -- ", type_name, step, op, #cond); \
            std::fprintf(stderr, __VA_ARGS__);                                           \
            std::fprintf(stderr, "\n");                                                  \
            if (g_failures > 20) std::exit(1);                                           \
        }                                                                                \
    } while (0)

template <class V>
std::vector<int> values_of(const V& v) {
    std::vector<int> out;
    for (std::size_t i = 0; i < v.size(); ++i) out.push_back(v[i].value());
    return out;
}

std::string str(const std::vector<int>& v) {
    std::string s = "[";
    for (std::size_t i = 0; i < v.size() && i < 20; ++i) s += (i ? " " : "") + std::to_string(v[i]);
    if (v.size() > 20) s += " ...";
    return s + "]";
}

struct OpCounts {
    long copy_ctor, move_ctor, copy_assign, move_assign, dtor, value_ctor;
    bool operator==(const OpCounts&) const = default;
};
OpCounts op_counts(const Counts& d) {
    return {d.copy_ctor, d.move_ctor, d.copy_assign, d.move_assign, d.dtor, d.value_ctor};
}
std::string str(const OpCounts& c) {
    char buf[160];
    std::snprintf(buf, sizeof buf, "cc=%ld mc=%ld ca=%ld ma=%ld d=%ld vc=%ld", c.copy_ctor, c.move_ctor,
                  c.copy_assign, c.move_assign, c.dtor, c.value_ctor);
    return buf;
}

template <class X>
void run_type(const char* type_name, unsigned seed, int sequences, int steps_per_seq) {
    constexpr bool copyable = std::is_copy_constructible_v<X>;
    constexpr bool strong_realloc = std::is_nothrow_move_constructible_v<X> || copyable;
    std::mt19937 rng(seed);
    auto rnd = [&](long lo, long hi) {  // inclusive
        return std::uniform_int_distribution<long>(lo, hi)(rng);
    };
    int next_value = 1;

    for (int seq = 0; seq < sequences; ++seq) {
        reset();
        {
            my::vector<X> mine;
            std::vector<X> ref;
            std::vector<int> model;  // values; source of truth after resync
            const int inject_pct = static_cast<int>(rnd(0, 3)) * 10;  // 0, 10, 20, 30 %

            auto resync_ref = [&] {
                ref.clear();
                for (int x : model) ref.emplace_back(x);
            };

            for (long step = 0; step < steps_per_seq; ++step) {
                ++g_steps;
                const std::vector<int> before = values_of(mine);
                const std::size_t cap_before = mine.capacity();
                const X* data_before = mine.data();
                const std::size_t ref_cap_before = ref.capacity();
                const std::size_t n = mine.size();

                const bool inject = rnd(1, 100) <= inject_pct;
                static constexpr Op kOps[] = {Op::value_construct, Op::copy_construct, Op::move_construct,
                                              Op::copy_assign, Op::move_assign};
                const Op inj_op = kOps[rnd(0, 4)];
                const long inj_nth = rnd(1, static_cast<long>(n) + 3);

                // Kind of operation.
                int kind = static_cast<int>(rnd(0, 17));
                if (!copyable && (kind == 0 || kind == 4 || kind == 10 || kind == 11 || kind == 14 || kind == 17)) kind = 1;
                if (n == 0 && (kind == 3 || kind == 6 || kind == 14 || kind == 17)) kind = 2;
                const char* op = "?";

                // Is this operation one for which a throw must leave *this unchanged?
                bool strong = false;
                bool threw = false;
                bool injection_fired = false;
                Counts mine_delta{};
                std::vector<int> expected = before;  // model after the op (if no throw)

                // `apply` runs the operation on a vector type; used for mine (maybe
                // with injection) and then for ref (never with injection).
                const long pos = rnd(0, static_cast<long>(n));                 // insert position
                const long epos = n ? rnd(0, static_cast<long>(n) - 1) : 0;    // erase / alias index
                const long elast = n ? rnd(epos, static_cast<long>(n)) : 0;    // erase range end
                const long res_n = rnd(0, static_cast<long>(n) * 2 + 8);
                const int val = next_value++;

                auto apply = [&](auto& v) {
                    using VV = std::remove_reference_t<decltype(v)>;
                    switch (kind) {
                    case 0: {  // push_back(const T&)
                        op = "push_back(lvalue)";
                        if constexpr (copyable) {
                            const X x(val);
                            v.push_back(x);
                        }
                        break;
                    }
                    case 1: op = "push_back(rvalue)"; v.push_back(X(val)); break;
                    case 2: op = "emplace_back(int)"; v.emplace_back(val); break;
                    case 3: op = "pop_back"; v.pop_back(); break;
                    case 4: {
                        op = "insert(pos, lvalue)";
                        if constexpr (copyable) {
                            const X x(val);
                            v.insert(v.begin() + pos, x);
                        }
                        break;
                    }
                    case 5: op = "insert(pos, rvalue)"; v.insert(v.begin() + pos, X(val)); break;
                    case 6: op = "erase(pos)"; v.erase(v.begin() + epos); break;
                    case 7: op = "erase(first, last)"; v.erase(v.begin() + epos, v.begin() + elast); break;
                    case 8: op = "reserve"; v.reserve(static_cast<std::size_t>(res_n)); break;
                    case 9:
                        op = "clear";
                        if (rnd(0, 3) == 0) v.clear();  // keep vectors from staying tiny
                        break;
                    case 10: {
                        op = "copy ctor";
                        if constexpr (copyable) {
                            VV copy(v);
                            (void)copy;
                        }
                        break;
                    }
                    case 11: {
                        op = "copy assign";
                        if constexpr (copyable) {
                            // assign from a vector of a random size (or self)
                            if (val % 7 == 0) {
                                VV& self = v;
                                v = self;
                            } else {
                                VV other;
                                const int m = val % 13;
                                for (int i = 0; i < m; ++i) other.emplace_back(val * 100 + i);
                                v = other;
                            }
                        }
                        break;
                    }
                    case 12: {
                        op = "move roundtrip";
                        VV tmp(std::move(v));
                        v = std::move(tmp);
                        break;
                    }
                    case 13: {
                        op = "swap twice";
                        VV other;
                        other.emplace_back(val);
                        v.swap(other);
                        swap(v, other);
                        break;
                    }
                    case 14: {
                        op = "push_back(v[i]) aliasing";
                        if constexpr (copyable) v.push_back(v[static_cast<std::size_t>(epos)]);
                        break;
                    }
                    case 15: {
                        op = "insert(begin, back()) aliasing";
                        if constexpr (copyable) {
                            if (!v.empty()) v.insert(v.begin(), v.back());
                            else v.emplace_back(val);
                        } else {
                            v.emplace_back(val);
                        }
                        break;
                    }
                    case 16: op = "emplace(pos, int)"; v.emplace(v.begin() + pos, val); break;
                    case 17: {
                        op = "emplace_back(v[i]) aliasing";
                        if constexpr (copyable) {
                            if (!v.empty()) v.emplace_back(v[static_cast<std::size_t>(epos)]);
                            else v.emplace_back(val);
                        } else {
                            v.emplace_back(val);
                        }
                        break;
                    }
                    }
                };

                // Expected model change + guarantee class.
                switch (kind) {
                case 0: case 1: case 2:
                    expected.push_back(val);
                    strong = strong_realloc || n < cap_before;
                    break;
                case 3: expected.pop_back(); break;
                case 4: case 5: case 16:
                    expected.insert(expected.begin() + pos, val);
                    // at the end: like push_back. In the middle: basic only.
                    strong = static_cast<std::size_t>(pos) == n && (strong_realloc || n < cap_before);
                    break;
                case 6: expected.erase(expected.begin() + epos); break;
                case 7: expected.erase(expected.begin() + epos, expected.begin() + elast); break;
                case 8: strong = strong_realloc; break;
                case 9: break;  // decided at run time (rnd) - handled below
                case 10: strong = true; break;  // the source of a copy is never modified
                case 11: break;
                case 12: case 13: strong = true; break;  // noexcept
                case 14: case 17:
                    if (n) expected.push_back(before[static_cast<std::size_t>(epos)]);
                    else expected.push_back(val);
                    strong = strong_realloc || n < cap_before;
                    break;
                case 15:
                    if (copyable && n) {
                        expected.insert(expected.begin(), before.back());
                        strong = false;  // middle insert
                    } else {
                        expected.push_back(val);
                        strong = strong_realloc || n < cap_before;
                    }
                    break;
                }
                if (kind == 11 && copyable) {
                    if (val % 7 != 0) {
                        expected.clear();
                        for (int i = 0; i < val % 13; ++i) expected.push_back(val * 100 + i);
                    }
                }

                // Run on mine. The rng must be consumed identically for both runs
                // (case 9 draws), so save its state.
                const std::mt19937 rng_saved = rng;
                {
                    CounterScope scope;
                    try {
                        if (inject) {
                            ThrowOn arm(inj_op, inj_nth);
                            apply(mine);
                            injection_fired = arm.fired();
                        } else {
                            apply(mine);
                        }
                    } catch (const InjectedError&) {
                        threw = true;
                        injection_fired = true;
                    }
                    mine_delta = scope.delta();
                }
                if (kind == 9) {
                    // replay the draw to learn whether clear happened
                    std::mt19937 r2 = rng_saved;
                    if (std::uniform_int_distribution<long>(0, 3)(r2) == 0) expected.clear();
                }

                FUZZ_CHECK(counts().lifetime_errors() == 0, "lifetime error: %s",
                           first_lifetime_error().c_str());
                if (counts().lifetime_errors() != 0) clear_lifetime_errors();
                FUZZ_CHECK(mine.capacity() >= mine.size(), "capacity %zu < size %zu", mine.capacity(),
                           mine.size());

                if (threw) {
                    ++g_injected;
                    if (strong) {
                        ++g_strong_checked;
                        const std::vector<int> after = values_of(mine);
                        FUZZ_CHECK(after == before, "strong guarantee violated: before %s after %s",
                                   str(before).c_str(), str(after).c_str());
                        FUZZ_CHECK(mine.capacity() == cap_before && mine.data() == data_before,
                                   "strong guarantee: capacity/data changed (%zu -> %zu)", cap_before,
                                   mine.capacity());
                    } else {
                        ++g_basic_checked;
                    }
                    // Resync the model and ref from mine (valid but unspecified).
                    model = values_of(mine);
                    rng = rng_saved;
                    // consume the case-9 draw on the ref side too
                    if (kind == 9) (void)rnd(0, 3);
                    resync_ref();
                } else {
                    // Run the same op on std::vector (no injection).
                    rng = rng_saved;
                    CounterScope scope;
                    apply(ref);
                    const Counts ref_delta = scope.delta();
                    model = expected;
                    const std::vector<int> got = values_of(mine);
                    const std::vector<int> want = values_of(ref);
                    FUZZ_CHECK(got == want, "my %s vs std %s (model %s)", str(got).c_str(), str(want).c_str(),
                               str(expected).c_str());
                    FUZZ_CHECK(want == expected, "fuzzer model disagrees with std: std %s model %s",
                               str(want).c_str(), str(expected).c_str());
                    if (kind == 12) {
                        FUZZ_CHECK(mine_delta.element_ops() == 0, "vector move did element ops: %s",
                                   to_string(mine_delta).c_str());
                        FUZZ_CHECK(mine.data() == data_before && mine.capacity() == cap_before,
                                   "move roundtrip changed the buffer");
                    }
                    if (kind == 6 || kind == 7) {
                        FUZZ_CHECK(mine.capacity() == cap_before && mine.data() == data_before,
                                   "erase changed the buffer");
                    }
                    if (kind == 8) {
                        FUZZ_CHECK(mine.capacity() >= static_cast<std::size_t>(res_n), "reserve too small");
                        FUZZ_CHECK(res_n <= static_cast<long>(cap_before) ? mine.data() == data_before : true,
                                   "reserve(n <= capacity) reallocated");
                    }
                    // Compare op counts when neither side reallocated and no injection fired.
                    const bool no_realloc = mine.capacity() == cap_before && mine.data() == data_before &&
                                            ref.capacity() == ref_cap_before;
                    if (!injection_fired && no_realloc && kind != 13) {
                        const OpCounts a = op_counts(mine_delta), b = op_counts(ref_delta);
                        ++g_count_cmp[op];
                        if (!(a == b)) {
                            ++g_count_mismatch[op];
                            if (!g_mismatch_example.count(op))
                                g_mismatch_example[op] = "mine {" + str(a) + "} std {" + str(b) + "} n=" +
                                                         std::to_string(n) + " pos=" + std::to_string(pos);
                        }
                    }
                }
                FUZZ_CHECK(counts().live == static_cast<long>(mine.size() + ref.size()),
                           "live %ld != sizes %zu + %zu (leak or double destroy)", counts().live, mine.size(),
                           ref.size());
            }
        }
        {
            const long step = -1;
            const char* op = "end of sequence";
            FUZZ_CHECK(counts().live == 0, "leak: live=%ld", counts().live);
            FUZZ_CHECK(counts().lifetime_errors() == 0, "lifetime: %s", first_lifetime_error().c_str());
        }
    }
}

// Over-aligned element type: std::allocator must return suitably aligned storage.
struct alignas(64) OverAligned {
    int v;
    explicit OverAligned(int x) : v(x) {}
};

void check_over_aligned() {
    my::vector<OverAligned> v;
    for (int i = 0; i < 100; ++i) {
        v.emplace_back(i);
        if (reinterpret_cast<std::uintptr_t>(v.data()) % 64 != 0) {
            std::fprintf(stderr, "FAIL over-aligned storage misaligned\n");
            ++g_failures;
            return;
        }
    }
    for (int i = 0; i < 100; ++i)
        if (v[static_cast<std::size_t>(i)].v != i) ++g_failures;
}

// std::string: heap-owning type, exercised under ASan (no instrumentation).
void check_strings(unsigned seed) {
    std::mt19937 rng(seed);
    my::vector<std::string> a;
    std::vector<std::string> b;
    for (int step = 0; step < 20000; ++step) {
        const int k = static_cast<int>(rng() % 6);
        const std::string s(40 + rng() % 20, static_cast<char>('a' + rng() % 26));
        if (k == 0) { a.push_back(s); b.push_back(s); }
        else if (k == 1 && !a.empty()) { a.pop_back(); b.pop_back(); }
        else if (k == 2) { const auto p = rng() % (a.size() + 1); a.insert(a.begin() + p, s); b.insert(b.begin() + p, s); }
        else if (k == 3 && !a.empty()) { const auto p = rng() % a.size(); a.erase(a.begin() + p); b.erase(b.begin() + p); }
        else if (k == 4 && !a.empty()) { a.insert(a.begin(), a.back()); b.insert(b.begin(), b.back()); }
        else { a.emplace_back(3, 'x'); b.emplace_back(3, 'x'); }
        if (a.size() > 300) { a.clear(); b.clear(); }
        if (a.size() != b.size() || !std::equal(a.begin(), a.end(), b.begin())) {
            std::fprintf(stderr, "FAIL string differential at step %d\n", step);
            ++g_failures;
            return;
        }
    }
    my::vector<std::string> c(a);
    my::vector<std::string> d;
    d = c;
    d = std::move(c);
    if (!(d == a)) ++g_failures;
}

}  // namespace

int main(int argc, char** argv) {
    const int sequences = argc > 1 ? std::atoi(argv[1]) : 200;
    const int steps = argc > 2 ? std::atoi(argv[2]) : 300;
    const unsigned seed = argc > 3 ? static_cast<unsigned>(std::strtoul(argv[3], nullptr, 10)) : 12345u;

    run_type<Tracked>("Tracked", seed, sequences, steps);
    run_type<MayThrowMove>("MayThrowMove", seed + 1, sequences, steps);
    run_type<CopyOnly>("CopyOnly", seed + 2, sequences, steps);
    run_type<MoveOnly>("MoveOnly", seed + 3, sequences, steps);
    run_type<ThrowingMoveOnly>("ThrowingMoveOnly", seed + 4, sequences, steps);
    run_type<NoDefault>("NoDefault", seed + 5, sequences, steps);
    check_over_aligned();
    check_strings(seed);

    std::printf("steps=%ld injected-throws=%ld (strong-checked=%ld basic-only=%ld) failures=%ld\n", g_steps,
                g_injected, g_strong_checked, g_basic_checked, g_failures);
    std::printf("op-count comparison vs std::vector (no realloc, no injection):\n");
    for (const auto& [op, cnt] : g_count_cmp) {
        const long mm = g_count_mismatch.count(op) ? g_count_mismatch[op] : 0;
        std::printf("  %-32s compared=%-7ld mismatches=%ld%s%s\n", op.c_str(), cnt, mm, mm ? "  e.g. " : "",
                    mm ? g_mismatch_example[op].c_str() : "");
    }
    return g_failures == 0 ? 0 : 1;
}

// Compile-time properties (stage 4 and 7).
static_assert(std::is_nothrow_move_constructible_v<my::vector<Tracked>>);
static_assert(std::is_nothrow_move_assignable_v<my::vector<Tracked>>);
static_assert(std::is_nothrow_default_constructible_v<my::vector<NoDefault>>);
static_assert(std::contiguous_iterator<my::vector<int>::iterator>);
static_assert(std::contiguous_iterator<my::vector<int>::const_iterator>);
static_assert(std::ranges::contiguous_range<my::vector<int>>);
static_assert(std::ranges::contiguous_range<const my::vector<int>>);
static_assert(std::ranges::sized_range<my::vector<int>>);
static_assert(std::is_same_v<std::ranges::range_reference_t<const my::vector<int>>, const int&>);
static_assert(!std::is_copy_constructible_v<my::vector<MoveOnly>> || true,
              "copying a vector of move-only T need not compile (it is not SFINAE-constrained, like std)");
