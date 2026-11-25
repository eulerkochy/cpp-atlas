## What you will build

You will write `my::vector<T>`, a dynamic array with a single template parameter and no allocator parameter, in one header: `include/my/vector.hpp`. By the last stage it supports geometric growth, `reserve`, copy and move, `emplace_back`, the strong exception guarantee on reallocation, contiguous iterators and `insert`/`erase` in the middle of the buffer.

Nothing in the challenge is exotic. That is the point: `std::vector` is the smallest container that forces you to confront the whole object model at once.

## Why vector

A vector separates storage from objects. `capacity()` bytes exist long before the first element does, and elements are constructed and destroyed one at a time inside that storage. Getting this right means understanding object lifetime, not just memory management: which objects are alive, who destroys them, and what happens when a constructor throws halfway through.

Three ideas recur across the stages:

- **Lifetime.** You never default-construct elements you do not have. You construct in place, destroy exactly once, and release storage last.
- **Move semantics.** Growing the buffer relocates every element. Whether that is a copy or a move, and whether it may throw, decides which guarantees you can offer.
- **Exception safety.** `push_back` has the strong guarantee when it reallocates. Building that guarantee out of a throwing copy constructor is the hardest and most instructive part of the challenge.

## How it works

Each stage has a page on this site describing the task, what the tests check, hints, common traps and a pointer to how the three major standard libraries solve the same problem.

1. Read the stage page and add the described members to `include/my/vector.hpp`.
2. Run `./cppatlas submit`. It sends your header to the grader at run.cppatlas.com, prints a live `[tester::#N]` log, and stops at the first failing stage.
3. When the stage passes, `.cppatlas.json` advances to the next one. Commit it and move on. Earlier stages are graded again each time, so a regression shows up immediately.

Grading needs only `curl` and `python3` or `jq` on your machine. No local compiler is required. The grader builds with GCC 16.2 or Clang 21 in C++23 mode, optionally under AddressSanitizer and UndefinedBehaviorSanitizer.

The tests count constructions, copies, moves and destructions of instrumented element types, so a leak, a double destroy or an unnecessary copy is a failure, not a silent inefficiency.

## Fairness

The same test suite compiles and passes against `std::vector` when you configure with `-DUSE_STD=ON`. Every assertion therefore checks behavior that the standard guarantees for a conforming implementation. If a test fails on your vector, the standard says your vector is wrong, not merely different from libstdc++. Stage pages mark where a behavior is an implementation choice (such as the growth factor) and the tests deliberately do not depend on it.

## Setup

1. **Use the template.** Open [eulerkochy/cpp-vector-challenge](https://github.com/eulerkochy/cpp-vector-challenge) and click **Use this template**, or [create your copy directly](https://github.com/new?template_name=cpp-vector-challenge&template_owner=eulerkochy).
2. **Clone it** (or open it in a Codespace).
3. **Run `./cppatlas submit`.** For stage 1, first uncomment the marked lines in `include/my/vector.hpp`; the [stage 1 page](/build/vector/empty-vector) shows which. The command prints the tester log and, when the stage passes, advances `.cppatlas.json` to the next stage. Commit that file.
4. **Install the GitHub App.** [Install c-atlas-grader](https://github.com/apps/c-atlas-grader/installations/new) on your account. Choosing "All repositories" is safe: the app ignores any repository that has no `.cppatlas.json`. You can also pick just your challenge repository.
5. **Push.** From then on, `git push` also grades your commit and posts a check named `cppatlas / vector` on it.

```
git clone https://github.com/<you>/<your-copy>
cd <your-copy>
./cppatlas submit                        # grade stages 1..your current stage, advance on pass
./cppatlas submit --stage 3              # grade stages 1..3 (never advances)
./cppatlas submit --compiler clang       # gcc (default) or clang
./cppatlas submit --sanitize             # AddressSanitizer + UndefinedBehaviorSanitizer
./cppatlas help
```

Your progress lives in `.cppatlas.json` at the repository root, for example `{"challenge":"vector","stage":1}`. The App reads that file and `include/my/vector.hpp` at the pushed commit and grades stages 1..current, so commit `.cppatlas.json` after it advances. The stage pages also have a "Run on the grader" panel where you can paste your header and see the same log in the browser.

If you would rather not install the App, `./cppatlas submit` alone is enough, and the repository also ships a manual GitHub Actions workflow (Actions tab, then "tests", then "Run workflow").

If you get stuck, the [reference solution](https://github.com/eulerkochy/cpp-atlas/tree/main/challenges/vector/solution) is public. Try the stage's hints first.

## Optional: run the tests locally

Remote grading is the default. Running the suite on your own machine is a faster loop if you have a toolchain, and it is the only way to attach a debugger. `./cppatlas test` runs the same stages locally, and `./cppatlas doctor` checks your tools against the grader's versions. It is only needed for local testing.

```
./cppatlas doctor        # checks cmake, ninja, compilers, a C++23 probe, a sanitizer probe
./cppatlas test          # runs stages 1..your current stage, stops at the first failure
./cppatlas test 3        # run stages 1..3 (explicit stage numbers never advance your progress)
./cppatlas test --preset asan-ubsan
```

When every stage up to the current one passes, `./cppatlas test` advances `.cppatlas.json` the same way `submit` does.

### Requirements

- CMake 3.25 or newer
- Ninja
- A C++23 compiler: GCC 16.2 or Clang 21

Supported environments, in order of preference:

1. **Tier 1: devcontainer.** The provided `.devcontainer` has GCC 16.2 (the default) and Clang 21 installed. This is the reference environment, and it matches the grader's toolchain.
2. **Tier 2: macOS.** Homebrew GCC 16.2 or LLVM 21. Apple's bundled Clang may lag behind in C++23 library support. macOS has no LeakSanitizer, but the tester's own allocation tracking still reports leaked buffers there.
3. **Tier 3: Windows/MSVC.** Best effort. No UBSan; use the `debug` preset (the devcontainer or WSL is recommended).

### Running tests

Tests use doctest, with one executable per stage. Besides `./cppatlas`, you can drive CTest directly:

```
cmake --preset debug
cmake --build --preset debug
ctest --preset debug -L stage-03
```

The `asan-ubsan` preset builds with AddressSanitizer and UndefinedBehaviorSanitizer. Run it from stage 2 onward: it turns double frees, leaks, out-of-bounds access and misaligned storage into immediate failures, which is exactly the feedback a hand-written container needs.

To check a test against the reference behavior, run the same tests against `std::vector`:

```
CPPATLAS_CMAKE_ARGS="-DUSE_STD=ON" ./cppatlas test
```
