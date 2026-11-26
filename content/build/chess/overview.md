## What you will build

You will write a complete C++23 chess engine across an **11-file engine layout**—10 headers under `include/chess/` (`types.hpp`, `bitboard.hpp`, `magic.hpp`, `position.hpp`, `movegen.hpp`, `eval.hpp`, `tt.hpp`, `search.hpp`, `uci.hpp`, and the `chess.hpp` umbrella) plus `src/main.cpp`—alongside `tools/magic_gen.cpp` (table generator) and `bench/sliding_bench.cpp` (microbenchmark and Perft comparison). By Stage 9 you have a working `chess_engine` binary that parses FENs, computes sliding attacks in under a nanosecond, passes Perft across tricky edge cases, searches with alpha-beta pruning, quiescence, iterative deepening, and a transposition table, detects all draw rules, and plays games over the Universal Chess Interface (UCI).

A chess engine is one of the best systems projects in C++. Every layer is small enough to hold in your head, yet performance and correctness bugs show up immediately in node counts, tactical blunders, or Perft mismatches.

## Why a chess engine

Writing a chess engine forces you to make data representation, bit-level algorithms, state rollback, and search bounds work together without allocating on the hot path:

- **Hybrid board representation.** You pair a 64-square array (for O(1) "what piece is on `e4`?") with 64-bit bitboards (for parallel attack generation and population counts with `<bit>`). Keeping the two in exact sync is the foundation everything else rests on.
- **From 20ns to 1ns sliding attacks.** In Stage 2 you write clean `if constexpr` directional shifts and unary-fold ray loops (~20 ns per lookup). In Stage 3 you compress those rays down to <1 ns O(1) lookups using relevancy masks, Carry-Rippler subset enumeration, sparse random magic numbers, flat fancy tables (`include/chess/magic.hpp`), and a comparison against BMI2 hardware `PEXT`—then measure Amdahl's Law end-to-end with `./cppatlas bench`.
- **Zero-allocation undo.** Copying a `Position` at every node is wasteful; instead `make_move` mutates the board in place and records only the irreversible fields in a tiny `UndoState`, while updating the Zobrist hash with a handful of XORs.
- **Exactness before speed.** Perft verifies legal move generation down to a single miscounted en-passant pin. Once Perft is exact, search bugs stand out clearly in node counts and principal variations.

## Interactive Bitboard Register & Magic/PEXT visualizer

Right here on `/build/chess`, you can use the **Chessboard Workbench** to inspect every stage visually while you code locally:

- Load stage benchmark positions (`Startpos`, `Kiwipete`, `En Passant Pin`, `Mate in 2`, `Quiescence Trap`) or paste any FEN.
- Inspect the live **64-bit Register Strip** (8 rank bytes `[63..56]` down to `[7..0]`) synchronized with board hover, plus `0x...` hex masks, `popcount`, and attack overlays per piece or color in the **Bitboards & Attacks** tab.
- Step through the **20ns → 1ns** pipeline in the **Magic & PEXT** tab: toggle Rook or Bishop on any square to see its relevancy mask, masked occupancy (`occ & mask`), packed `PEXT` bits vs sparse magic multiplication and shift, and constructive collisions.
- Run Perft (`d1`–`d3`) with a clickable per-move divide breakdown, or play moves against a built-in search to check tactical lines.

## How it works

Each stage has a page describing the exact frozen C++23 signatures, design tradeoffs, what the doctest suite checks, and common traps.

1. Read the stage page and implement the described types and functions in `include/chess/`.
2. Run `./cppatlas submit`. It uploads your `include/chess/*.hpp` and `src/main.cpp` files to the grader at `run.cppatlas.com`, prints a live `[tester::#N]` log, and stops at the first failing stage.
3. When the stage passes, `.cppatlas.json` advances to the next stage. Commit it and move on. Earlier stages are re-run every time, so a regression shows up immediately.

Grading needs only `curl` and `python3` or `jq` on your machine. No local compiler is required. The grader compiles with GCC 16.2 or Clang 21 in C++23 mode, optionally with AddressSanitizer and UndefinedBehaviorSanitizer.

## Setup

1. **Use the template.** Open [eulerkochy/cpp-chess-challenge](https://github.com/eulerkochy/cpp-chess-challenge) and click **Use this template**, or [create your copy directly](https://github.com/new?template_name=cpp-chess-challenge&template_owner=eulerkochy).
2. **Clone it** (or open it in a Codespace).
3. **Run `./cppatlas submit`.** Implement stage 1 in `include/chess/position.hpp`, then submit. When stage 1 passes, `.cppatlas.json` advances to stage 2; commit that file.
4. **Install the GitHub App.** [Install c-atlas-grader](https://github.com/apps/c-atlas-grader/installations/new) on your account. Choosing "All repositories" is safe: the app ignores any repository without `.cppatlas.json`.
5. **Push.** From then on, `git push` grades your commit automatically and posts a `cppatlas / chess` check on it.

```
git clone https://github.com/<you>/<your-copy>
cd <your-copy>
./cppatlas submit                        # grade stages 1..your current stage, advance on pass
./cppatlas submit --stage 5              # grade stages 1..5 (never advances)
./cppatlas submit --compiler clang       # gcc (default) or clang
./cppatlas submit --sanitize             # AddressSanitizer + UndefinedBehaviorSanitizer
./cppatlas help
```

Your progress lives in `.cppatlas.json` at the repository root, for example `{"challenge":"chess","stage":1}`. If you prefer not to install the GitHub App, `./cppatlas submit` alone is enough, and the repository also includes a manual GitHub Actions workflow under the Actions tab.

If you get stuck, the [reference solution](https://github.com/eulerkochy/cpp-atlas/tree/main/challenges/chess/solution) is public. Try each stage's hints and gotchas first.

## Optional: run the tests locally

Remote grading is the default, while running locally gives you a faster edit-test loop, debugger access, and a `release` build for sliding benchmarks, Perft, and search.

```
./cppatlas doctor                        # checks cmake, ninja, compilers, C++23 & sanitizer probes
./cppatlas test                          # runs stages 1..your current stage, stops on failure
./cppatlas test 5                        # runs stages 1..5 (does not advance progress)
./cppatlas test --preset asan-ubsan      # AddressSanitizer + UndefinedBehaviorSanitizer
./cppatlas test --preset release         # -O3 build for Perft and search
./cppatlas bench                         # builds & runs bench/sliding_bench.cpp in release mode
./cppatlas run                           # builds and launches chess_engine interactively
```

When every stage up to the current one passes, `./cppatlas test` advances `.cppatlas.json` the same way `submit` does.

### Requirements

- CMake 3.25 or newer
- Ninja
- A C++23 compiler: GCC 16.2 or Clang 21

Supported environments, in order of preference:

1. **Tier 1: devcontainer.** The `.devcontainer` ships GCC 16.2 and Clang 21 and matches the grader environment.
2. **Tier 2: macOS.** Homebrew GCC 16.2 or LLVM 21. Apple's bundled Clang may trail on C++23 headers such as `<expected>`.
3. **Tier 3: Windows/MSVC.** Best effort via the `debug` preset; WSL or the devcontainer is recommended for sanitizers.

### Running tests with CMake directly

Tests use doctest with one executable per stage (`stage_01` through `stage_09`), plus `magic_gen`, `chess_bench`, and the `chess_engine` UCI binary:

```
cmake --preset debug
cmake --build --preset debug
ctest --preset debug -L stage-05
```

Use `--preset asan-ubsan` while building stages 3–9 to catch out-of-bounds square indexing (`SQ_NONE == 64`!), uninitialized fields, and UB immediately, and `--preset release` when running `./cppatlas bench`, benchmarking Perft, or playing games with `chess_engine`.
