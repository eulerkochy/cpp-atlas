---
title: "std::simd data-parallel types"
summary: "C++26 adds std::simd::vec and std::simd::mask, portable types that hold a fixed number of elements and apply every operation to all of them at once, so that ordinary-looking C++ compiles to SIMD instructions. The rules for implicit conversions, masks, and loads are what make the code portable."
track: "cpp26"
minutes: 14
standard:
  - "[simd.general]"
  - "[simd.syn]"
  - "[simd.class]"
  - "[simd.ctor]"
  - "[simd.mask.class]"
  - "[simd.loadstore]"
  - "[simd.reductions]"
  - "[simd.flags]"
cppreference:
  - title: "Data-parallel types (SIMD)"
    path: "numeric/simd"
  - title: "std::simd::basic_simd (pre-rename page)"
    path: "numeric/simd/basic_simd"
  - title: "Parallelism TS v2 SIMD library"
    path: "experimental/simd"
prerequisites:
  - "floating-point-and-numerics"
  - "fundamental-types-and-arithmetic-conversions"
  - "implicit-conversions"
  - "span-and-mdspan"
  - "parallel-algorithms-and-execution-policies"
---

## The one idea

A `std::simd::vec<float, 8>` is a small value, like an `int`, that holds eight `float`s. Every operator on it works **element-wise**: `a + b` adds lane 0 to lane 0, lane 1 to lane 1, and so on, and a good compiler turns that into one vector instruction. You write the algorithm once for "a vector of elements", and the width is chosen by the platform or by you.

Two consequences shape the whole library. First, a comparison of two vectors gives you not one `bool` but a vector of them, a **mask**, so ordinary `if` stops working and is replaced by mask reductions and `select`. Second, conversions that would silently lose information in scalar code are rejected, because the library is designed so that code which compiles for one width means the same thing at every width.

This is C++26. The library was merged by P1928R15 from the Parallelism TS 2 `std::experimental::simd`. It was then reshaped by P3430R3 (assorted fixes), P3441R2 (`simd_split` renamed to `chunk`), P3480R6 (vectors are ranges), P2664R11 (permutations, gather, and scatter), and finally P3691R1, which renamed the namespace from `std::datapar` to `std::simd` and the types to `basic_vec`, `vec`, `basic_mask`, and `mask`. Everything here follows N5050, the final C++26 draft sent to the international ballot. That ballot closed in October 2026 and was reported as not approved, so check the status before you quote this as published ISO C++.

GCC 16's libstdc++ ships `<simd>` as experimental, and only for x86 targets with at least SSE2. On other targets, including AArch64, the header declares nothing. It never defines `__cpp_lib_simd`, so you cannot detect it with the feature-test macro. Clang 21's libc++ has no `<simd>`. The examples on this page were compiled and run with GCC 16.2 for x86-64 with `-std=c++26 -O2`, through Compiler Explorer, because the local AArch64 machine could not build them.

> **Mental model.** Think of `vec<T, N>` as `std::array<T, N>` in which every operator is applied element by element, plus a strict rule that nothing converts implicitly unless every possible value survives.

## Vectors, masks, and widths

The two class templates are `basic_vec<T, Abi>` and `basic_mask<Bytes, Abi>`. You normally use their aliases:

| Alias | Meaning |
| --- | --- |
| `vec<T>` | the native width for `T` on the target, for example 4 floats with SSE2 or 16 with AVX-512 |
| `vec<T, N>` | exactly `N` elements, emulated with several registers if needed |
| `mask<T, N>` | the mask type produced by comparing two `vec<T, N>` |

`T` must be a **vectorizable type**: a standard integer or character type, `float`, `double`, `std::float16_t`, `std::float32_t`, `std::float64_t`, or `std::complex<T>` where `T` is one of those floating-point types. `bool` and `long double` are not vectorizable. `vec<T, N>` is guaranteed to be supported for every `N` from 1 to 64, and an implementation may support more, with a limit that can differ by `T`. `V::size()` is a constant, and `V::size` itself is an `integral_constant`, so you can use it in template arguments.

```cpp
#include <simd>
#include <cstdio>

namespace simd = std::simd;

int main() {
  simd::vec<float, 4> v([](int i) { return float(i); });   // {0, 1, 2, 3}
  auto w = v * 2.f;                                         // {0, 2, 4, 6}
  std::printf("%g %d\n", simd::reduce(w), int(w.size()));   // prints 12 4
}
```

The constructor used here is the **generator constructor**. It calls the callable once for each index, in increasing order, passing `integral_constant<simd-size-type, i>`, which converts to `int`. Each lane can therefore be computed from a compile-time index. The generator constructor is `explicit`, so you must write it as direct initialization.

`operator[]` returns the element **by value**. You can read a lane but not assign to one, so `v[0] = 5` does not compile. To change selected lanes, build a new vector with `select`. Since P3480, a `vec` is also a read-only random-access range, so `for (float x : v)` works.

## The value-preserving rule

Every implicit conversion into a `vec` is checked by one rule from [simd.general]: the conversion from `U` to `T` is **value-preserving** if every possible value of `U` can be represented in `T`. The broadcast constructor, which turns a scalar into a vector with every lane equal to it, accepts an arithmetic argument only when its conversion is value-preserving. Binary operators take two `basic_vec` parameters, so a scalar operand must go through that constructor.

```cpp
#include <simd>
#include <utility>

namespace simd = std::simd;
using V = simd::vec<float, 4>;

template <class A, class B>
concept multipliable = requires(A a, B b) { a * b; };

static_assert(multipliable<V, float>);              // 2.f broadcasts
static_assert(!multipliable<V, int>);               // int -> float can lose values
static_assert(multipliable<simd::vec<double, 4>, int>);
static_assert(!multipliable<simd::vec<short, 4>, int>);   // even v + 1 fails for short
static_assert(multipliable<V, decltype(std::cw<2>)>);     // a constant that fits is fine
```

`int` to `float` is not value-preserving, because `float` has only 24 bits of significand. `int` to `short` obviously is not either, which surprises people who write `v + 1` for a `vec<short>`. The fix is to write the literal in the right type, or to pass a compile-time constant such as `std::cw<1>`. A constant is checked for whether its particular value is representable, not whether its whole type is.

The same rule makes vector-to-vector conversion `explicit` whenever it could lose values or would lower the conversion rank. `vec<float, 4>` converts implicitly to `vec<double, 4>`, but going from `vec<double, 4>` to `vec<float, 4>` needs an explicit construction or a cast. The generator's return type is checked the same way, so a generator returning `int` for a `vec<float>` does not compile.

> **Pitfall.** Code that is idiomatic for scalars, such as `x * 2` or `y + 1`, fails to compile for `vec<float>` and `vec<short>`. That is intentional. In scalar code, the usual arithmetic conversions would quietly change the type of the expression, while in SIMD code a changed element type would change the vector's width.

## Masks instead of `bool`

A comparison such as `a < b` returns `mask_type`, one boolean per lane. `basic_mask` has no conversion to `bool`, so `if (a < b)` does not compile. You decide what you mean and say it with a reduction:

- `all_of(m)`, `any_of(m)`, and `none_of(m)` collapse a mask to one `bool`;
- `reduce_count(m)` counts the true lanes;
- `reduce_min_index(m)` and `reduce_max_index(m)` find the first and last true lane.

To make a per-lane choice, the SIMD version of `?:`, use `select(mask, a, b)`. It takes lane `i` from `a` where `mask[i]` is true and from `b` otherwise. Both sides are always computed, so it is a blend, not a branch.

```cpp
#include <simd>
#include <cstdio>

namespace simd = std::simd;
using V = simd::vec<float, 4>;

int main() {
  V v([](int i) { return float(i); });           // {0, 1, 2, 3}
  auto small = v < 2.f;                          // {true, true, false, false}
  // if (small) { }                              // error: no conversion to bool
  std::printf("%d %d %d\n", simd::any_of(small), simd::all_of(small),
              int(simd::reduce_count(small)));   // prints 1 0 2
  V r = simd::select(small, v, V(-1.f));         // {0, 1, -1, -1}
  std::printf("%g %g\n", r[1], r[2]);            // prints 1 -1
}
```

The Parallelism TS spelled this `where(mask, v) = x`. N5050 has no where-expressions. `select`, and the masked overloads of loads, stores, and reductions, replace them.

## Loading and storing

A `vec` is a value, so data moves between it and memory explicitly. N5050 provides two families, and the difference between them is the precondition:

- `unchecked_load<V>(range)` and `unchecked_store(v, range)` require the range to hold at least `V::size()` elements. If the range's size is a constant, a smaller size is ill-formed; otherwise it is undefined behaviour.
- `partial_load<V>(range)` and `partial_store(v, range)` accept any size. Lanes past the end of the range are loaded as `T()`, which is zero, and are not stored.

Both families also take an iterator and a count, or an iterator and a sentinel, and an optional mask that disables lanes. Flags tune them. `flag_convert` allows a load whose element type conversion is not value-preserving, `flag_aligned` promises alignment to `alignment_v<V, U>`, and `flag_overaligned<N>` promises alignment to `N` bytes.

```cpp
#include <simd>
#include <cstddef>
#include <span>

namespace simd = std::simd;

void saxpy(float a, std::span<const float> x, std::span<float> y) {
  using V = simd::vec<float>;                    // native width
  constexpr std::size_t W = V::size();
  std::size_t i = 0;
  for (; i + W <= x.size(); i += W) {            // full vectors
    V xv = simd::unchecked_load<V>(x.data() + i, W);
    V yv = simd::unchecked_load<V>(y.data() + i, W);
    simd::unchecked_store(a * xv + yv, y.data() + i, W);
  }
  std::size_t rest = x.size() - i;               // 0 .. W-1 elements left
  V xv = simd::partial_load<V>(x.data() + i, rest);
  V yv = simd::partial_load<V>(y.data() + i, rest);
  simd::partial_store(a * xv + yv, y.data() + i, rest);
}
```

The main loop uses unchecked operations because the bound already guarantees that enough elements exist. The tail uses partial operations, so no scalar epilogue is needed.

> **Standardese.** [simd.loadstore] specifies a partial load as producing, for each lane `i`, `mask[i] && i < ranges::size(r) ? static_cast<T>(ranges::data(r)[i]) : T()`. Missing lanes are value-initialized. They are never read from memory, so a partial load at the end of an allocation is safe.

## Reductions, math, and permutations

`reduce(v)` combines all lanes with `std::plus<>`. `reduce(v, op)` accepts a commutative operation that takes and returns `vec<T, 1>`, and it combines the lanes as a generalized sum, in an unspecified order and grouping. The masked form `reduce(v, mask, op, identity)` ignores disabled lanes and returns `identity` when no lane is selected. You must supply the identity unless `op` is `plus<>`, `multiplies<>`, `bit_and<>`, `bit_or<>`, or `bit_xor<>`. `reduce_min` and `reduce_max` are shortcuts.

`<simd>` provides `vec` overloads of nearly all of `<cmath>`, including `sqrt`, `sin`, `exp`, `fma`, `hypot`, and the classification functions. It also provides `<bit>` functions such as `popcount` and `countl_zero` for integer vectors, and complex functions for vectors of `std::complex`. `min`, `max`, `minmax`, and `clamp` work element-wise.

P2664 added data movement. `permute(v, idx_fn)` reorders lanes by a compile-time index function, and another overload takes a run-time index vector. `compress(v, mask)` packs the selected lanes to the front, and `expand` does the reverse. `unchecked_gather_from` and `partial_gather_from` read from indexed positions in a range, and `unchecked_scatter_to` and `partial_scatter_to` write to them. `chunk<V>(big)` splits a wider vector into pieces, and `cat(a, b, ...)` joins vectors.

[simd.general] also says that the element-wise operations of a single operator are **unsequenced** with respect to each other. That is what allows a single instruction to perform them. It matters for user-supplied callables, such as the one passed to `reduce`: a callable that depends on order or keeps shared state is not suitable.

## What to remember

- `std::simd::vec<T, N>` is a value holding `N` elements, and every operator acts lane by lane. `vec<T>` picks the native width.
- Implicit conversions must be value-preserving. That rejects `vec<float> * 2` and `vec<short> + 1`. Write `2.f`, cast explicitly, or use `std::cw<2>`.
- Comparisons give masks, not `bool`. Use `all_of`, `any_of`, `none_of`, or `reduce_count`, and use `select` for a per-lane choice.
- `operator[]` reads a lane by value, so you cannot assign through it.
- Use `unchecked_load` and `unchecked_store` for full vectors and `partial_load` and `partial_store` for the tail. Missing lanes load as zero.
- The final names come from P3691: namespace `std::simd`, `basic_vec`, `vec`, `basic_mask`, `mask`. Older papers and pages say `basic_simd` or `std::datapar`.
- GCC 16 ships `<simd>` experimentally for x86 with SSE2 only, and it does not define `__cpp_lib_simd`. Clang 21 has none.
