---
title: "Floating point and numerics"
summary: "The standard says very little about how floating point behaves, so IEEE 754 behaviour is something you check for, not something you get. This topic covers NaN and signed zero, conversions that are undefined, excess precision, and the library tools that behave well."
track: "utilities"
minutes: 13
standard:
  - "[basic.fundamental]"
  - "[conv.fpint]"
  - "[conv.double]"
  - "[expr.pre]"
  - "[expr.mul]"
  - "[expr.spaceship]"
  - "[cmp.partialord]"
  - "[numeric.limits.members]"
  - "[charconv.to.chars]"
  - "[charconv.from.chars]"
  - "[numeric.ops.midpoint]"
  - "[c.math.lerp]"
cppreference:
  - title: "Fundamental types (floating-point types)"
    path: "language/types"
  - title: "std::numeric_limits<T>::is_iec559"
    path: "types/numeric_limits/is_iec559"
  - title: "Floating-point conversions and exceptional values (implicit conversions)"
    path: "language/implicit_conversion"
  - title: "std::to_chars"
    path: "utility/to_chars"
  - title: "std::from_chars"
    path: "utility/from_chars"
  - title: "std::midpoint"
    path: "numeric/midpoint"
  - title: "std::lerp"
    path: "numeric/lerp"
  - title: "Mathematical constants"
    path: "numeric/constants"
  - title: "Extended floating-point types (header stdfloat)"
    path: "header/stdfloat"
  - title: "FLT_EVAL_METHOD"
    path: "types/climits/FLT_EVAL_METHOD"
  - title: "Common mathematical functions"
    path: "numeric/math"
prerequisites:
  - "fundamental-types-and-arithmetic-conversions"
  - "constant-expressions"
---

## The one idea

C++ does not say that `double` is an IEEE 754 binary64 number. The core language only requires that the types `float`, `double` and `long double` hold a set of values where each set contains the one before, and that the value representation is implementation-defined. Everything you know about NaN, infinities, signed zero and round-to-nearest comes from the hardware and the compiler, not from the language.

The standard gives you one honest switch for asking. `std::numeric_limits<T>::is_iec559` is true when the type conforms to IEC 559, which is IEEE 754. You can `static_assert` on it, and that is the right way to document that a piece of code depends on IEEE behaviour.

> **Mental model.** A floating-point value is a point on a finite, uneven grid. Every operation computes an exact real answer and then snaps it to a nearby grid point. The standard leaves the grid and the snapping rule to the implementation, and `is_iec559` tells you the implementation chose the IEEE ones.

```cpp
#include <limits>

static_assert(std::numeric_limits<double>::is_iec559,
              "this code assumes IEEE 754 doubles");
static_assert(std::numeric_limits<double>::digits == 53);  // true for binary64
```

When `is_iec559` is true, `has_infinity`, `has_quiet_NaN` and `has_signaling_NaN` are true as well. Note also that division by zero is formally undefined in [expr.mul], including for floating-point operands. On an IEEE platform it yields an infinity or NaN in practice, which is why the `is_iec559` check matters before you rely on it.

## Why 0.1 + 0.2 is not 0.3

The decimal literal `0.1` has no finite binary expansion, so it is stored as the nearest binary64 value, which is slightly above one tenth. The same is true of `0.2` and `0.3`, each with its own small error. The sum of the first two is computed exactly and then rounded, and it lands one grid step above the grid point nearest to `0.3`.

```cpp
#include <cstdio>

int main() {
  double a = 0.1 + 0.2;
  std::printf("%d\n", a == 0.3);   // 0 on an IEEE binary64 platform
  std::printf("%.17g\n", a);       // 0.30000000000000004
}
```

The fix is never to compare computed floating-point values for equality unless you know the computation is exact. Compare with a tolerance chosen for the problem, which is relative for large magnitudes and absolute near zero. A single global epsilon is almost always wrong. `std::numeric_limits<double>::epsilon()` is the gap between 1.0 and the next value, so it is only a sensible tolerance for numbers near 1.

The grid is also uneven. Above 2 to the 24th power, `float` cannot represent every integer, so `16777216.0f + 1.0f` is `16777216.0f` again. Integers are exact in `double` only up to 2 to the 53rd power.

## NaN, ordering, and signed zero

A NaN is not equal to anything, including itself, and every ordered comparison with a NaN is false. The only comparison that is true is `!=`.

```cpp
#include <compare>
#include <limits>

int main() {
  double n = std::numeric_limits<double>::quiet_NaN();
  bool a = n == n;   // false
  bool b = n != n;   // true
  bool c = n < 1.0;  // false
  bool d = n >= 1.0; // false

  std::partial_ordering o = n <=> 1.0;
  bool u = (o == std::partial_ordering::unordered);  // true
  bool l = o < 0;    // false: unordered is not less
  bool g = o > 0;    // false: nor greater
  (void)a; (void)b; (void)c; (void)d; (void)u; (void)l; (void)g;
}
```

That is why `operator<=>` on a floating-point type returns `std::partial_ordering`, not `strong_ordering`. It has four values: less, equivalent, greater, and unordered. Because `unordered` compares false against every ordering test, `std::sort` with a plain `<` on data that contains a NaN breaks the strict weak ordering requirement, and the behaviour is undefined. Filter NaNs out first, or sort with `std::strong_order`, which is a total order that places NaNs consistently. The details of orderings belong to `three-way-comparison` and `strict-weak-ordering-and-comparators`.

> **Pitfall.** `std::max(a, b)` is defined with `<`. If `a` is a NaN, the comparison is false and the result depends on argument order. `std::fmax`, on the other hand, returns the non-NaN argument. Neither choice is wrong, but mixing them in one codebase gives results that change when a NaN appears.

Signed zero is the other trap. Under IEEE, `+0.0` and `-0.0` compare equal, yet they are different values with different bit patterns, and `std::signbit` and `std::copysign` can tell them apart. Functions such as `std::atan2`, and division in an IEEE environment, give different results for the two zeros. `<=>` treats them as `equivalent`, so a `bit_cast` to an integer is the way to ask whether two doubles are the same object, not just equal numbers.

## Rounding, precision, and `FLT_EVAL_METHOD`

The language lets an implementation evaluate floating-point operands and results in greater range and precision than the type requires, without changing the type. This is [expr.pre]. The macro `FLT_EVAL_METHOD` in `<cfloat>` reports what the implementation does: 0 means each operation is evaluated in its own type, and other values mean wider evaluation. Historic x87 builds used a wider format, which made `a + b == c` depend on whether the intermediate stayed in a register. On the arm64 machine used for the examples in this topic the value is 0.

Fused multiply-add is a modern relative of the same problem, and contraction is allowed whatever `FLT_EVAL_METHOD` says. A compiler that turns `a * b + c` into one fused instruction rounds once instead of twice, which changes the last bit of the result. In a test on this machine, both g++-16 and clang++ at `-O2` produced the fused answer for a carefully chosen input, and `-ffp-contract=off` produced the unfused one. If you need the same bits everywhere, call `std::fma` when you want one rounding, and disable contraction when you want two.

The rounding mode itself is dynamic state. The `<cfenv>` header lets you change it, but the compiler may assume the default mode unless the program says otherwise, so changing it casually is unreliable. The mode is not part of the type, and `std::numeric_limits<T>::round_style` describes the arithmetic's default.

## Conversions that are undefined

Converting a floating-point value to an integer truncates toward zero. If the truncated value does not fit in the destination type, the behaviour is undefined, whether the source is infinity, a NaN, or just a large finite number. This is [conv.fpint]. Converting between floating-point types is similar: a value in range but not exactly representable becomes an implementation-defined choice of one of the two neighbours, and a value out of range is undefined. In practice an IEEE platform gives an infinity, but the language does not promise it.

```cpp
constexpr int a = static_cast<int>(3.99);   // OK: 3
constexpr int b = static_cast<int>(-3.99);  // OK: -3, truncation toward zero

// constexpr int c = static_cast<int>(1e10);
// ill-formed: undefined behaviour is not a constant expression
```

Constant evaluation is a useful probe here. The commented line is rejected by both compilers because the conversion is not a constant expression. At run time the same code compiles and does whatever the hardware does, which is often saturation on arm64 and `INT_MIN` on x86.

Going the other way, from an integer to a floating-point type, an integer that is not exactly representable is rounded to one of the neighbours chosen by the implementation, and one that is out of range is undefined.

## The library tools that behave

`std::midpoint(a, b)` in `<numeric>`, since C++20, computes the average without overflowing. For integers the half-way case rounds toward the first argument, so `std::midpoint(1, 2)` is 1 and `std::midpoint(2, 1)` is 2. For floating-point arguments at most one inexact operation occurs.

`std::lerp(a, b, t)` in `<cmath>`, also C++20, interpolates and is specified to return exactly `a` at `t == 0` and exactly `b` at `t == 1`, to be finite for `t` in `[0, 1]`, to be monotonic in `t`, and to extrapolate for `t` outside that range. It is not the same as `a + t * (b - a)`, which fails to return `b` at `t == 1` for some inputs.

`std::to_chars` and `std::from_chars` in `<charconv>` are the correct way to move floating-point numbers through text. The plain `to_chars(first, last, value)` overload produces the shortest representation that `from_chars` will read back to exactly the same value. That is the round-trip guarantee, and the standard only provides it when both functions come from the same implementation. `from_chars` does not accept a leading plus sign or leading white space, it accepts `nan` and `inf`, and when the value is out of range it returns `result_out_of_range` and leaves the destination unmodified.

```cpp
#include <charconv>
#include <cstdio>

int main() {
  char buf[64];
  auto r = std::to_chars(buf, buf + sizeof buf, 0.1 + 0.2);
  *r.ptr = '\0';
  std::puts(buf);                  // 0.30000000000000004

  double back = 0;
  std::from_chars(buf, r.ptr, back);
  std::printf("%d\n", back == 0.1 + 0.2);  // 1: exact round trip

  double v = 7;
  const char s[] = "1e400";
  auto fr = std::from_chars(s, s + 5, v);
  // fr.ec == std::errc::result_out_of_range, and v is still 7
  (void)fr;
}
```

The constants in `<numbers>`, such as `std::numbers::pi` and `std::numbers::e`, come as variable templates such as `std::numbers::pi_v<float>`, plus plain `double` variables such as `std::numbers::pi`. You never need to write `3.14159` by hand.

## Constexpr math, extended types, and fast-math

Before C++23 most of `<cmath>` could not be used in constant expressions. C++23 made constexpr the functions that do not depend on the floating-point environment, among them `fabs`, `floor`, `ceil`, `fmod` and `fma`. C++26 extended this to most of the rest, including `sqrt`, which is not constexpr in C++23. GCC treats many built-ins as constant-foldable as an extension, so a compiler accepting a call is not evidence that the standard allows it.

C++23 also added optional extended floating-point types in `<stdfloat>`: `std::float16_t`, `std::float32_t`, `std::float64_t`, `std::float128_t` and `std::bfloat16_t`. An implementation declares each one through a macro such as `__STDCPP_FLOAT64_T__`. They are distinct types even when they have the same layout as a standard one, so `std::float64_t` is not `double`, and overloads and templates see them separately. On this machine, g++-16 provides all five.

`-ffast-math` is not a faster version of the standard. It is a family of compiler flags that licenses reassociation, ignores NaN and infinity, and assumes no signed zeros. Code that relies on NaN checks, `is_iec559` or exact rounding can silently change meaning. Treat the flag as leaving the standard, and keep it out of any code that handles NaNs or needs reproducible rounding.

## What to remember

- The standard does not require IEEE 754; use `static_assert(std::numeric_limits<T>::is_iec559)` to document the dependency.
- `0.1 + 0.2 != 0.3` because the literals and the sum are each rounded to the binary grid; compare with a problem-specific tolerance.
- A NaN is unequal to everything, and `<=>` on floating point yields `std::partial_ordering`, whose `unordered` value fails every ordering test.
- `+0.0 == -0.0`, but `signbit` and `copysign` see the difference.
- Excess precision and fused multiply-add are allowed, so results can differ between builds; `FLT_EVAL_METHOD` reports the evaluation format.
- Out-of-range float-to-integer conversion is undefined, and constant evaluation rejects it.
- `midpoint` and `lerp` avoid overflow and endpoint errors; integer `midpoint` rounds toward its first argument.
- `to_chars` and `from_chars` round-trip exactly, but only within one implementation.
- C++23 makes the environment-independent `<cmath>` functions constexpr and adds `<stdfloat>`; C++26 adds constexpr for most of the rest.
- `-ffast-math` abandons the semantics above.
