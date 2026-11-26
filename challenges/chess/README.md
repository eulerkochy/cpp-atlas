# Build your own chess engine

Nine test-driven stages that take you from FEN parsing and 64-bit bitboards to
magic bitboards, legal move generation (verified with Perft), static evaluation,
alpha-beta search with quiescence, a transposition table with iterative
deepening, and a working UCI engine binary (`chess_engine`) you can connect to
any chess GUI.

Guide and stage pages: <https://cppatlas.com/build/chess>. Grading is remote by
default (`./cppatlas submit`); running the tests locally is optional.

If you get stuck, the reference solution is public at
<https://github.com/eulerkochy/cpp-atlas/tree/main/challenges/chess/solution>.
Try each stage on your own first: the stage page's hints and the failure
messages are meant to get you there.

## Stages

| # | Stage | Spec |
|---|-------|------|
| 1 | Board representation and FEN | <https://cppatlas.com/build/chess/board-and-fen> |
| 2 | Bitboards, directional shifts and naive sliders | <https://cppatlas.com/build/chess/bitboards-and-attacks> |
| 3 | Magic bitboards: from 20ns to 1ns | <https://cppatlas.com/build/chess/magic-bitboards> |
| 4 | Make, unmake and Zobrist hashing | <https://cppatlas.com/build/chess/make-unmake-and-zobrist> |
| 5 | Legal move generation and perft | <https://cppatlas.com/build/chess/movegen-and-perft> |
| 6 | Static evaluation | <https://cppatlas.com/build/chess/evaluation> |
| 7 | Alpha-beta search and quiescence | <https://cppatlas.com/build/chess/alpha-beta-and-quiescence> |
| 8 | Transposition table and iterative deepening | <https://cppatlas.com/build/chess/transposition-table> |
| 9 | UCI protocol and draw detection | <https://cppatlas.com/build/chess/uci-protocol> |

`./cppatlas stages` prints the same list with links.

## Project layout

You edit the headers under `include/chess/` and the engine entry point in
`src/main.cpp`:

- `include/chess/types.hpp` — colors, pieces, squares, `Move`, `Castling`, `UndoState`
- `include/chess/bitboard.hpp` — bitboard helpers (`popcount`, `lsb`, `pop_lsb`) and naive sliding/leaper attacks
- `include/chess/magic.hpp` — magic bitboards: relevancy masks, Carry-Rippler subsets, sparse magics, fancy tables, and PEXT
- `include/chess/position.hpp` — `Position`, FEN parsing/serialization, make/unmake, Zobrist hash, draw detection
- `include/chess/movegen.hpp` — `MoveList`, pseudo-legal and legal move generation, `parse_uci_move`, `perft`
- `include/chess/eval.hpp` — static evaluation (`evaluate`) and score bounds
- `include/chess/tt.hpp` — `TranspositionTable`, `TTEntry`, `TTBound`
- `include/chess/search.hpp` — `Searcher`, `SearchLimits`, `SearchInfo`, `SearchResult`, quiescence
- `include/chess/uci.hpp` — `UciEngine` UCI command loop
- `include/chess/chess.hpp` — umbrella header including all nine headers
- `src/main.cpp` — builds the `chess_engine` UCI executable

Included tools & benchmarks (optional local targets):

- `tools/magic_gen.cpp` — standalone magic number generator & verifier (`magic_gen`)
- `bench/sliding_bench.cpp` — naive vs. magic vs. PEXT sliding attack benchmark (`chess_bench`)

Everything else (`tests/`, `cmake/`, `CMakeLists.txt`, `cppatlas`) is the test
harness.

## Quick start

1. **Use this template.** Click **Use this template** on
   <https://github.com/eulerkochy/cpp-chess-challenge>
   (or go to
   <https://github.com/new?template_name=cpp-chess-challenge&template_owner=eulerkochy>)
   to create your own copy.
2. **Clone it** (or open it in a Codespace).
3. **Run `./cppatlas submit`.** All starter headers already compile with stub
   implementations; stage 1 fails deterministically until you implement
   `Position::from_fen`, `Position::startpos`, and `Position::to_fen` (see
   <https://cppatlas.com/build/chess/board-and-fen>). `./cppatlas submit`
   sends your 11 engine files to the grader at <https://run.cppatlas.com>,
   prints a live `[tester::#N]` log, and when the stage passes advances
   `.cppatlas.json` to the next stage. Commit that file.
4. **Install the GitHub App.** Go to
   <https://github.com/apps/c-atlas-grader/installations/new>. Choosing "All
   repositories" is safe: repositories without a `.cppatlas.json` are ignored.
   Or pick just this repository.
5. **Push.** From then on, `git push` also grades your commit and posts a check
   named `cppatlas / chess` on it.

`./cppatlas submit` needs only `curl` and `python3` or `jq`. No local compiler
is required. The grader uses GCC 16.2 (default) or Clang 21 in C++23 mode.

```
./cppatlas submit                      # stages 1..current; advances on pass
./cppatlas submit --stage 3            # stages 1..3, never advances
./cppatlas submit --compiler clang     # gcc (default) or clang
./cppatlas submit --sanitize           # AddressSanitizer + UndefinedBehaviorSanitizer
./cppatlas help                        # all commands
```

Prefer a manual run on GitHub instead? The repository also has a workflow:
Actions tab, then "tests", then "Run workflow". It does not run on push.

## The edit-submit loop

1. Read the stage page (start with stage 1).
2. Edit the relevant header(s) under `include/chess/` (and `src/main.cpp` if needed).
3. Run `./cppatlas submit`.

`./cppatlas submit` grades stages 1 through your **current stage** and **stops
at the first failing stage**, so earlier stages act as regression tests while
you work on later ones. Keep all non-template free function definitions in
headers marked `inline` so multiple test translation units link without ODR
errors.

### Your progress: `.cppatlas.json`

The file `.cppatlas.json` at the repository root records which stage you are on:

```json
{"challenge":"chess","stage":1}
```

When stages 1..*stage* all pass, `./cppatlas submit` advances the file and tells you
which stage is next and where its page is.

**Commit the file after it advances** (`git add .cppatlas.json`). The GitHub App
reads the stage from that file at the pushed commit and grades stages
1..*stage*, so a push is green when your current stage passes. Explicit forms
(`--stage 3`, `./cppatlas test 3`, `--only 3`) never change the file. The file
must exist and `stage` must be 1 to 9, otherwise `./cppatlas` reports a clear
error. Once stage 9 passes you are done.

### Sanitizers

```
./cppatlas submit --sanitize
```

`--sanitize` grades with AddressSanitizer and UndefinedBehaviorSanitizer. Use
it whenever a stage crashes or reports memory corruption: an out-of-bounds
square index, uninitialized undo state, or transposition table bug becomes an
immediate, precisely located report. It is slower, so use the plain run for
the quick loop.

## Running the UCI engine locally

Once you reach stage 9 (or anytime you want to test `chess_engine`), build and
launch the interactive UCI binary with:

```
./cppatlas run
./cppatlas run --preset release        # optimized -O3/-O2 build for fast search
```

You can type UCI commands directly on stdin:

```
uci
isready
position startpos moves e2e4 e7e5
go depth 5
quit
```

To play against your engine or run engine matches, point any UCI-compatible GUI
(Cutechess, BanksiaGUI, Arena, Nibbler, or `lichess-bot`) at the built
executable `build/release/chess_engine` (created by `cmake --preset release &&
cmake --build --preset release --target chess_engine`).

## Optional: run the tests locally

Remote grading is the default. Running the suite on your own machine is a
faster loop and lets you use a debugger, but it needs a toolchain
(see [Requirements](#requirements)). The commands below are only for local
testing.

```
./cppatlas doctor            # checks cmake, ninja, compilers, C++23 and sanitizer probes
./cppatlas test              # stages 1..current stage; advances when they pass
./cppatlas test --no-advance # same, but leave .cppatlas.json alone
./cppatlas test 3            # stages 1..3 (never advances)
./cppatlas test --only 3     # just stage 3 (never advances)
./cppatlas test -v           # full compiler / test output
./cppatlas test --preset asan-ubsan
./cppatlas test --preset release
./cppatlas run               # build and run chess_engine interactively
./cppatlas bench             # build (release) and run sliding attack benchmark
./cppatlas magic-gen         # build (release) and run magic number generator
./cppatlas stages            # list stages and spec links
./cppatlas clean             # delete build/
```

`./cppatlas doctor` compares your tools with the grader's versions and prints
warnings. It never fails hard, and you do not need it for `submit`. A stage
that runs longer than 30 s locally is killed and the test case it was in is
named (change the limit with `CPPATLAS_TIMEOUT=60`).

### Option A: dev container / GitHub Codespaces (recommended)

Open the repository in a Codespace, or in VS Code run "Dev Containers: Reopen
in Container". You get GCC 16.2, Clang 21, CMake, Ninja, ccache, gdb and lldb,
with the sanitizers working.

```
./cppatlas test
```

Default compiler in the container is GCC 16.2 (`CXX=g++`). To use Clang for a
run: `CXX=clang++-21 ./cppatlas test`. Each compiler keeps its own build
directory, so switching is cheap.

### Option B: your own machine

You need bash, CMake, Ninja and a C++23 compiler (see [Requirements](#requirements)).

```
./cppatlas doctor
./cppatlas test
```

## Plain CMake and CTest (local)

`./cppatlas test` is a thin wrapper. The same thing by hand:

```
cmake --preset debug                  # or: asan-ubsan, release
cmake --build --preset debug
ctest --preset debug                  # all stages
ctest --preset debug -L stage-04      # one stage
```

Targets are `chess_engine`, `magic_gen`, `chess_bench`, and `stage_01` ... `stage_09`.

## Requirements

Only for local testing (`./cppatlas test` / `./cppatlas run`). `./cppatlas submit` needs just `curl` and `python3` or `jq`.

- bash (the `./cppatlas` script is bash 3.2 compatible)
- CMake 3.25 or newer (`CMakeLists.txt` requires 3.23; `CMakePresets.json` uses preset schema version 6, which needs 3.25)
- Ninja
- A C++23 compiler and standard library (`<bit>`, `std::expected`). The verified ones are **GCC 16.2** and **Clang 21**; older compilers are unsupported.
- Optional: ccache (used automatically if found)

## Grading on push, and the manual workflow

Installing the GitHub App (step 4 of the quick start) grades every `git push`
on repositories that have a `.cppatlas.json`. The app reads `.cppatlas.json` and
your 11 engine files at the pushed commit, grades stages 1..*stage*, and posts a
check run named `cppatlas / chess` on the commit. Remember to commit
`.cppatlas.json` after it advances, otherwise the push is graded on the old
stage.

`.github/workflows/test.yml` is a manual fallback for people who do not install
the App. It runs only when you start it (Actions tab, then "tests", then "Run
workflow"), reads your stage from `.cppatlas.json`, and runs stages 1..*stage*
with `./cppatlas test <stage>` inside the dev container image, for GCC 16.2 and
Clang 21, with the `debug` and `asan-ubsan` presets.

## License and third-party code

Your solution is yours. The test harness uses [doctest](https://github.com/doctest/doctest)
2.5.3 (MIT, Copyright (c) 2016-2023 Viktor Kirilov), vendored unmodified as
`tests/support/doctest.h`; its license is `tests/support/doctest.LICENSE.txt`
and the provenance is in `tests/support/THIRD_PARTY.md`.

<!-- maintainer:begin -->
---

## Maintainers

This section is removed together with `solution/` and `ci.sh` when the template
repository is extracted.

- `-DCPPATLAS_SOLUTION=ON` builds the tests and `chess_engine` against
  `solution/include/chess/` (the private reference solution) instead of
  `include/chess/`:
  `CPPATLAS_CMAKE_ARGS="-DCPPATLAS_SOLUTION=ON" ./cppatlas test 9`.
- `./ci.sh` runs `debug-starter`, `debug-solution`, `asan-ubsan-solution`,
  `release-solution` (including `solution/tests/fuzz.cpp`), and
  `export-template` under GCC and Clang. `./ci.sh --help` lists all flags and
  legs; logs go to `build/ci/`.
- `scripts/export-template.sh <outdir>` writes the learner template tree (no
  `solution/`, `ci.sh` or maintainer blocks; `.cppatlas.json` reset to stage 1)
  for the `eulerkochy/cpp-chess-challenge` repository. Blocks between
  `maintainer:begin` / `maintainer:end` marker lines are stripped from the copy.
- Adding a stage test: see `tests/support/README.md`.
<!-- maintainer:end -->
