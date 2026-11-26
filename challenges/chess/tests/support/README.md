# Writing chess stage tests

One file per stage: `tests/stage_NN.cpp` -> executable `stage_NN`, ctest test
`stage-NN`, label `stage-NN`. CMake picks up any `tests/stage_01.cpp` ..
`tests/stage_08.cpp` that exists; `./cppatlas` re-configures automatically when
a new one appears.

## The skeleton

```cpp
// Stage 1 - board-and-fen
// Spec: https://cppatlas.com/build/chess/board-and-fen
#include "support/harness.hpp"

namespace preflight {

CPPATLAS_PREFLIGHT(has_from_fen,
    "stage 1 (board-and-fen): chess::Position needs `static std::expected<Position, std::string> from_fen(std::string_view)`.",
    chess::Position,
    requires(std::string_view fen) {
        { V::from_fen(fen) } -> std::same_as<std::expected<V, std::string>>;
    });

CPPATLAS_PREFLIGHT(has_to_fen,
    "stage 1 (board-and-fen): chess::Position needs `std::string to_fen() const`.",
    chess::Position,
    requires(const V& pos) {
        { pos.to_fen() } -> std::same_as<std::string>;
    });

}  // namespace preflight

CPPATLAS_STAGE_GATE(preflight::has_from_fen && preflight::has_to_fen);

CPPATLAS_TEST("Position::startpos round-trips through FEN") {
    const auto pos = chess::Position::startpos();
    CHECK(pos.to_fen() == chess::STARTPOS_FEN);
}
```

## Rules

1. Always `#include "support/harness.hpp"` in stage test files.
2. Preflight the API signatures each stage depends on with clear messages
   naming the stage number, slug, and expected signature.
3. Make sure every failure explains itself: use `INFO(...)` and `CHECK_MESSAGE`
   with actionable hints (`-> likely cause / fix`).
4. Keep tests deterministic and bounded in runtime: use fixed depths, fixed
   node limits, or tight timeouts in search tests so ctest stays well under 60s.
5. Do not leave unfreed heap allocations inside a `CPPATLAS_TEST`: `doctest_main.cpp`
   replaces global `operator new` / `operator delete` to fail any passing test
   that leaks memory (unless `CPPATLAS_NO_ALLOC_CHECK=1`).

## Support headers

| header | contents |
|---|---|
| `harness.hpp` | umbrella include (`<chess/chess.hpp>`, `doctest.h`, `preflight.hpp`, `alloc_check.hpp`) |
| `preflight.hpp` | `CPPATLAS_PREFLIGHT`, `CPPATLAS_STAGE_GATE`, `CPPATLAS_TEST` |
| `alloc_check.hpp` | leaked-storage check (`alloc_check::Scope`, `enabled()`, `failures_in_current_test()`) |
| `doctest.h` | vendored doctest 2.5.3 (single header) |

<!-- maintainer:begin -->
## Verifying a new stage file

```sh
CPPATLAS_CMAKE_ARGS=-DCPPATLAS_SOLUTION=ON ./cppatlas test --preset asan-ubsan
./cppatlas test --only N
CXX=g++-16 ./cppatlas test
CXX=/opt/homebrew/opt/llvm/bin/clang++ ./cppatlas test
```
<!-- maintainer:end -->
