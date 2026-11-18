---
title: "Random numbers"
summary: "The random library splits randomness into engines that produce raw bits, distributions that shape them into values, and a seed that decides where an engine starts. Each of those parts has traps, from modulo bias and weak seeding to distributions whose output differs between standard libraries."
track: "utilities"
minutes: 12
standard:
  - "[rand.eng.mers]"
  - "[rand.predef]"
  - "[rand.dist.uni.int]"
  - "[rand.dist.uni.real]"
  - "[rand.util.canonical]"
  - "[alg.random.shuffle]"
  - "[alg.random.sample]"
  - "[c.math.rand]"
cppreference:
  - title: "Pseudo-random number generation"
    path: "numeric/random"
  - title: "std::random_device"
    path: "numeric/random/random_device"
  - title: "std::mersenne_twister_engine"
    path: "numeric/random/mersenne_twister_engine"
  - title: "std::uniform_int_distribution"
    path: "numeric/random/uniform_int_distribution"
  - title: "std::uniform_real_distribution"
    path: "numeric/random/uniform_real_distribution"
  - title: "std::seed_seq"
    path: "numeric/random/seed_seq"
  - title: "std::generate_canonical"
    path: "numeric/random/generate_canonical"
  - title: "std::philox_engine"
    path: "numeric/random/philox_engine"
  - title: "std::rand"
    path: "numeric/random/rand"
prerequisites:
  - "algorithms"
  - "concepts-and-constraints"
  - "threads-and-jthread"
---

## The one idea

A random number in C++ comes from three separate objects. A **uniform random bit generator** is a source of unsigned integers spread over a fixed range: an engine such as `std::mt19937`, an adaptor over one, or `std::random_device`. A **distribution** such as `uniform_int_distribution` takes bits from a generator and turns them into the values you actually want. A **seed** decides where a pseudo-random engine starts. Everything you can get wrong is about one of these three: the generator is weaker than you assumed, the distribution is not what you think, or the seed has far fewer possibilities than the engine has states.

```cpp
#include <iostream>
#include <random>

int main() {
  std::random_device rd;                         // seed source: slow, called once
  std::mt19937 gen(rd());                        // engine: deterministic given the seed
  std::uniform_int_distribution<int> die(1, 6);  // distribution: closed interval [1, 6]
  for (int i = 0; i < 5; ++i) std::cout << die(gen) << ' ';
}
```

> **Mental model.** An engine is a deterministic state machine. Same seed, same sequence, on every conforming implementation. Randomness in a program comes only from the seed, and the quality of a program's randomness cannot exceed the quality of its seed.

## Why `rand() % n` is wrong

`std::rand` hands out values in `[0, RAND_MAX]`, where `RAND_MAX` is at least 32767, from hidden global state that you seed with `srand`. Its algorithm and quality are left to the implementation. The remainder trick has a second flaw. Unless `RAND_MAX + 1` is a multiple of `n`, some residues occur more often than others. With a range of 32768 and `n = 6`, the numbers are `5461 * 6 + 2`, so results 0 and 1 are slightly more likely than the others. The effect is tiny for small `n` and severe when `n` is a large fraction of the range. Taking low bits of a weak generator can also be worse than the generator itself.

`std::uniform_int_distribution` avoids the bias; implementations typically do this by consuming as many engine outputs as they need and rejecting values that fall in the uneven tail. It also works with engines whose range is not a power of two. Prefer it to any hand-written reduction.

## Engines and adaptors

The standard supplies three families of engines. `linear_congruential_engine` is tiny and fast and has weak statistical properties. `mersenne_twister_engine`, with the aliases `mt19937` and `mt19937_64`, has a large state and long period. `subtract_with_carry_engine` is the third. **Adaptors** wrap an engine and change its output: `discard_block_engine` throws away part of each block, `independent_bits_engine` repacks bits into a chosen width, and `shuffle_order_engine` (as in `knuth_b`) permutes the output order. `std::default_random_engine` is a typedef whose engine is implementation-defined, so it gives you no portability promise.

The predefined engines have a strong guarantee, because their algorithms and default seeds are specified. The standard states that the 10000th invocation of a default-constructed `mt19937` returns 4123659995, and the other predefined engines have the same kind of check value.

```cpp
#include <iostream>
#include <random>

int main() {
  std::mt19937 g;                        // default seed 5489
  for (int i = 1; i < 10000; ++i) g();
  std::cout << g() << '\n';              // 4123659995 on every conforming implementation
}
```

## Seeding

`std::random_device` is meant to produce non-deterministic numbers from the operating system or hardware. The standard permits an implementation to fall back on a pseudo-random engine if no such source exists, in which case every object may produce the same sequence, so on exotic platforms it can fail to be random at all. Its `entropy()` member is an estimate and not a reliable test of this. It is also slow compared with an engine, and on some systems it degrades when called often. Use it to seed an engine, not as the engine.

The usual one-liner `std::mt19937 gen(std::random_device{}())` seeds with a single 32-bit value. The mt19937 state has 19937 bits, but a single-value seed reduces to 32 bits, so there are at most 2^32 reachable sequences, and the engine is not seeded from anything close to its capacity. Seeding with `1ULL << 32` gives the same engine as seeding with 0. To spread more entropy into the state, give the engine a **seed sequence**:

```cpp
#include <array>
#include <cstdint>
#include <random>

std::mt19937 make_engine() {
  std::random_device rd;
  std::array<std::uint32_t, 8> seed_data;
  for (auto& x : seed_data) x = rd();
  std::seed_seq seq(seed_data.begin(), seed_data.end());
  return std::mt19937(seq);              // state filled from 256 bits of seed data
}
```

`seed_seq` scrambles whatever it is given into as many 32-bit words as the engine asks for. It cannot create entropy that was not there, so eight words from a bad `random_device` are still a bad seed.

## Distributions are not portable

Engines are specified exactly; distributions are not. The standard says what distribution a class produces, such as uniform over `[a, b]`, but not which algorithm computes it or how many engine outputs it uses. As a result, the same engine and seed can yield different dice rolls on libstdc++ and libc++, and `std::shuffle` is just as unspecified. The raw engine output is the same everywhere.

If you need reproducible results across platforms, for tests with golden files or for networked simulations, take the engine's raw output and write the mapping yourself, or ship your own distribution implementation. Within one build of one library the sequence is reproducible, but an upgrade of the library may change it.

Distributions can also hold **state**. A normal distribution, for example, commonly produces values in pairs and keeps the spare one. Calling `reset()` discards such cached state, so the next call draws fresh engine output. Copying a distribution copies this state with it. If you want one fixed stream per task, do not share distribution objects between tasks.

## Ranges and types

`uniform_int_distribution<T>(a, b)` is a closed interval: both `a` and `b` can occur. Passing `a > b` violates a precondition and is undefined behavior; nothing swaps the bounds. The type `T` must be one of `short`, `int`, `long`, `long long` or their unsigned versions. The effect of `char`, `signed char`, `unsigned char`, `char8_t`, `wchar_t` or `bool` is undefined. libstdc++ accepts `char`, libc++ rejects it with a `static_assert`, and neither tells you what the standard does. Generate an `int` and cast.

`uniform_real_distribution<T>(a, b)` is **half-open**, `[a, b)`. The mathematics says `b` never appears, but floating-point rounding is a known trouble: the function `generate_canonical`, which underlies it, was specified in a way that let several implementations occasionally return exactly `1.0` for `float`, a defect tracked as LWG 2524. Code that divides by `1 - x` or uses `x` as an array index scaled by the size must not rely on the upper bound being excluded without a guard. A closed real interval is hard to build: using `nextafter(b)` as the upper limit does not always work because of rounding.

`std::generate_canonical<double, 53>(gen)` yields a real in `[0, 1)` using the stated number of bits. It is the building block for most real-valued distributions, and the place the rounding problem comes from.

## Shuffling, sampling, and threads

`std::shuffle(first, last, gen)` permutes a range using a generator. `std::random_shuffle` was deprecated in C++14 and removed in C++17 because it relied on `rand`. `std::sample(first, last, out, n, gen)` (C++17) selects `n` elements without replacement. The result preserves the order of the input only if the input iterators are forward iterators, and which elements are chosen is unspecified in the sense described for distributions: different libraries select differently.

Engines and distributions are ordinary objects with no internal locking. Calling `operator()` on the same object from two threads at once is a data race. Give each thread its own engine, for example a `thread_local` one, and seed each from a seed sequence built from distinct values. Sharing one engine behind a mutex is correct but serializes the threads.

## C++26 additions

C++26 adds `std::philox_engine` with the aliases `philox4x32` and `philox4x64`. This is a **counter-based** engine: its state is small and a position in the sequence can be addressed directly, which suits parallel work where each thread or work item takes its own stream. The aliases have a specified check value for the 10000th output, and GCC 16.2 produces 1955073260 for `philox4x32`, matching it. C++26 also adds `std::ranges::generate_random`, which fills a range with random numbers drawn from a generator, optionally through a distribution. GCC 16.2 does not provide it, so it has not been run for this topic.

## What to remember

- Engine, distribution, and seed are separate; randomness comes only from the seed.
- `rand() % n` is biased unless `n` divides `RAND_MAX + 1`; use `uniform_int_distribution`.
- Predefined engines are fully specified: `mt19937` default-constructed yields 4123659995 on its 10000th call, on every conforming implementation.
- Distributions and `shuffle` are not specified at the algorithm level, so they differ between libraries.
- `uniform_int_distribution` is `[a, b]` and requires `a <= b`; `uniform_real_distribution` is `[a, b)`, with a rounding caveat in `generate_canonical`.
- Only the listed standard integer types work with the integer distributions; `char` and `bool` have undefined effects.
- `random_device` may be deterministic on some platforms and is slow; use it to seed.
- One 32-bit seed reaches at most 2^32 states of `mt19937`; `seed_seq` helps spread seed data but cannot create entropy.
- Do not share an engine or distribution between threads without synchronization.
- `reset()` clears a distribution's cached state; `sample` is stable only with forward iterators.
- C++26 adds `philox_engine` and `ranges::generate_random`.
