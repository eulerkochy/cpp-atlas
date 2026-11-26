// tests/support/preflight.hpp - stage gating and leak-checked test runner.
//
// Pattern for every stage TU (tests/stage_01.cpp .. tests/stage_08.cpp):
//
//  1. CPPATLAS_PREFLIGHT(id, "message", Subject, requires-expression-on-V);
//     Defines `constexpr bool id` = whether Subject satisfies the requirement
//     and static_asserts it with "message".
//
//  2. CPPATLAS_STAGE_GATE(id1 && id2 && ...);
//     ANDs all preflight results into `cppatlas_stage_ok`.
//
//  3. CPPATLAS_TEST("name") { ...body... }
//     Wraps a doctest TEST_CASE with:
//       - CPPATLAS_STAGE_GATE gating (`if constexpr (cppatlas_stage_ok)`)
//       - CPPATLAS_PROGRESS=1 stderr announcements (used by ./cppatlas)
//       - alloc_check::Scope automatic leak detection on passing tests
#pragma once

#include <concepts>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>

#include "alloc_check.hpp"
#include "doctest.h"

#define CPPATLAS_CAT_IMPL_(a, b) a##b
#define CPPATLAS_CAT_(a, b) CPPATLAS_CAT_IMPL_(a, b)

#define CPPATLAS_PREFLIGHT(id, message, Subject, ...)                        \
    template <class V>                                                       \
    concept cppatlas_preflight_concept_##id = (__VA_ARGS__);                 \
    inline constexpr bool id = cppatlas_preflight_concept_##id<Subject>;    \
    static_assert(id, message)

#define CPPATLAS_STAGE_GATE(...) inline constexpr bool cppatlas_stage_ok = (__VA_ARGS__)

namespace cppatlas::detail {

// With CPPATLAS_PROGRESS=1 (set by ./cppatlas) every test announces itself on
// stderr, so a hanging or crashing test can be named. ./cppatlas strips these lines.
inline bool progress_enabled() noexcept {
    static const bool on = [] {
        const char* v = std::getenv("CPPATLAS_PROGRESS");
        return v != nullptr && *v != '\0' && *v != '0';
    }();
    return on;
}

template <bool Ok, class Body>
void run_stage_test(const char* name, const char* file, int line) {
    if constexpr (Ok) {
        if (progress_enabled()) std::fprintf(stderr, "[cppatlas] running: %s\n", name);
        long leaked_allocs = 0;
        std::size_t leaked_bytes = 0;
        {
            ::cppatlas::alloc_check::Scope allocs;
            Body::run();
            allocs.stop();
            if (allocs.reliable()) {
                leaked_allocs = allocs.live();
                leaked_bytes = allocs.live_bytes();
            }
        }
        if (leaked_allocs > 0 && ::cppatlas::alloc_check::failures_in_current_test() == 0) {
            std::ostringstream os;
            os << leaked_allocs << " allocation(s) (" << leaked_bytes
               << " bytes) made during this test were never freed.\n"
               << "-> Ensure dynamically allocated buffers (such as transposition tables) are freed.";
            const std::string msg = os.str();
            DOCTEST_ADD_FAIL_CHECK_AT(file, line, msg);
        }
    } else {
        (void)name;
        (void)file;
        (void)line;
    }
}

}  // namespace cppatlas::detail

#define CPPATLAS_TEST_IMPL_(name, body)                                                    \
    namespace {                                                                            \
    struct body {                                                                          \
        template <class = void>                                                            \
        static void run();                                                                 \
    };                                                                                     \
    }                                                                                      \
    TEST_CASE(name) {                                                                      \
        ::cppatlas::detail::run_stage_test<cppatlas_stage_ok, body>(name, __FILE__, __LINE__); \
    }                                                                                      \
    template <class>                                                                       \
    void body::run()

#define CPPATLAS_TEST(name) CPPATLAS_TEST_IMPL_(name, CPPATLAS_CAT_(cppatlas_test_body_, __COUNTER__))
