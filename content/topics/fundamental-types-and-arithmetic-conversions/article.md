---
title: "Fundamental types and arithmetic conversions"
summary: "The standard promises minimum widths and an ordering of integer types, not exact sizes, and every arithmetic operator first promotes small operands to int and then pulls both sides to a common type. Most signed and unsigned surprises fall out of those two steps."
track: "types-and-initialization"
minutes: 12
standard:
  - "[basic.fundamental]"
  - "[basic.extended.fp]"
  - "[conv.rank]"
  - "[conv.prom]"
  - "[conv.integral]"
  - "[conv.bool]"
  - "[expr.arith.conv]"
  - "[cstdint.syn]"
  - "[stdfloat.syn]"
cppreference:
  - title: "Fundamental types"
    path: "language/types"
  - title: "Usual arithmetic conversions"
    path: "language/usual_arithmetic_conversions"
  - title: "Arithmetic operators"
    path: "language/operator_arithmetic"
  - title: "Fixed width integer types"
    path: "types/integer"
  - title: "Fixed width floating-point types"
    path: "types/floating-point"
  - title: "Safe integer comparison (std::cmp_less and friends)"
    path: "utility/intcmp"
prerequisites:
  - "value-categories"
---

## The one idea

An arithmetic expression in C++ never operates on the types you wrote. Before a binary operator such as `+`, `<` or `*` does anything, two conversions run. First, every operand narrower than `int` is **promoted**, usually to `int`. Then the **usual arithmetic conversions** bring both operands to a single common type, chosen by a fixed ladder of rules. The operation happens in that common type, and the result has that type.

The standard does not tell you how wide most of these types are. It gives minimum widths, an ordering, and since C++20 a fixed representation for signed integers. Everything else, including whether plain `char` is signed, is the implementation's choice.

> **Mental model.** Small types do not exist in arithmetic: they become `int` on the way in. After that, if one side is unsigned and at least as wide as the other, the signed side becomes unsigned, and negative numbers turn into huge positive ones.

## What the standard guarantees about the integer types

There are five standard signed integer types, `signed char`, `short`, `int`, `long` and `long long`, each with an unsigned counterpart of the same size. Since C++20, [basic.fundamental] states minimum widths for them: 8, 16, 16, 32 and 64 bits. Each type in the list has at least the range of the one before it. `sizeof(char)` is 1 by definition, and a byte has at least 8 bits, but it can have more.

That is the whole guarantee. `int` is 32 bits on every mainstream desktop platform, but 16 bits is conforming. `long` is 64 bits on 64-bit Linux and macOS (the LP64 model) and 32 bits on 64-bit Windows (LLP64). Code that assumes `long` holds a pointer is not portable.

C++20 adopted P1236, the wording for P0907: signed integers are **two's complement**. A signed type of width N holds exactly the values from -2^(N-1) to 2^(N-1)-1, and the same bit pattern is shared with the unsigned type for non-negative values. Two consequences follow. Converting an out-of-range value to a signed type is now well-defined and wraps modulo 2^N, where before C++20 the result was implementation-defined. Signed overflow in arithmetic, however, is still undefined behavior; the integer-arithmetic-and-overflow topic covers that side.

```cpp
#include <climits>

static_assert(static_cast<signed char>(200) == -56);  // guaranteed since C++20
static_assert(static_cast<unsigned>(-1) == UINT_MAX); // modular, always was
```

> **Standardese.** [conv.integral] says that converting an integer to an integer type of width N produces the unique value of the destination type that is congruent to the source modulo 2^N. That sentence covers both signed and unsigned destinations from C++20 on.

## char is three types

`char`, `signed char` and `unsigned char` are three distinct types, even though `char` has the same representation and range as one of the other two. Which one is implementation-defined. On x86-64 Linux and on Apple's arm64 platforms, plain `char` is signed; on arm64 Linux it is unsigned. GCC and Clang let you flip it with `-funsigned-char`, which is a fine way to find code that depends on it.

```cpp
#include <type_traits>

static_assert(!std::is_same_v<char, signed char>);    // always distinct
static_assert(!std::is_same_v<char, unsigned char>);  // also distinct

bool high_bit(char c) { return c < 0; }  // true for '\xff' only if char is signed
```

The character types `char8_t`, `char16_t`, `char32_t` and `wchar_t` are distinct types too, each with an integer type as its underlying type. Their encoding questions belong to the character-types-and-unicode topic; here they matter only for how they promote.

## Integral promotion

[conv.prom] turns every narrow integer operand into something at least as wide as `int` before arithmetic. The rules are:

- An integer type whose conversion rank is below `int`'s, other than `bool` and the character types listed below, becomes `int` if `int` can hold all its values, otherwise `unsigned int`. This covers `char`, `signed char`, `unsigned char`, `short` and `unsigned short`.
- `bool` becomes `int`, with `false` as 0 and `true` as 1.
- `wchar_t`, `char8_t`, `char16_t` and `char32_t` become the first of `int`, `unsigned int`, `long`, `unsigned long`, `long long` and `unsigned long long` that can hold every value of their underlying type. With a 32-bit `int`, `char32_t` therefore promotes to `unsigned int`.
- An unscoped enumeration without a fixed underlying type promotes along the same list, starting from `int`; one with a fixed underlying type promotes to that type, and then onward.
- A bit-field promotes to `int` if `int` can hold all its values, otherwise `unsigned int` if that can.

```cpp
#include <cstdint>
#include <type_traits>

std::uint8_t a = 200, b = 200;
auto s = a + b;                 // int, value 400: no wraparound at 8 bits
static_assert(std::is_same_v<decltype(s), int>);
static_assert(std::is_same_v<decltype('a' + 'b'), int>);
static_assert(std::is_same_v<decltype(true + true), int>);  // value 2
```

Promotion is why `unsigned short` arithmetic can be undefined. If `int` is 32 bits, both operands of `x * y` become signed `int`, and 65535 times 65535 overflows a signed type.

> **Pitfall.** Multiplying two `unsigned short` or `std::uint16_t` values that are near the top of their range overflows signed `int` on a typical platform. The unsigned operand types do not protect you, because the multiplication happens after promotion. Cast one operand to `unsigned` first, or use `std::uint32_t` from the start.

## Conversion rank and the usual arithmetic conversions

Every integer type has an **integer conversion rank** ([conv.rank]). `long long` outranks `long`, which outranks `int`, then `short`, then `signed char`. An unsigned type has the rank of its signed counterpart. `char`, `signed char` and `unsigned char` share a rank. `bool` ranks lowest of all. The character types have the rank of their underlying types, and an extended integer type ranks below a standard type of the same width.

[expr.arith.conv] then applies these steps in order, for operators such as `+`, `-`, `*`, `/`, `%`, the comparisons, the bitwise operators and the second and third operands of `?:`:

1. If either operand has scoped enumeration type, no conversion is done, and the operands must have the same type.
2. If either operand is floating, an integer operand converts to the floating type; of two floating types, the one of lesser floating-point conversion rank converts to the other, and unordered ranks make the expression ill-formed.
3. Otherwise both operands are promoted, and if the types now match, that is the result.
4. If both are signed or both unsigned, the one of lesser rank converts to the other.
5. If the unsigned operand has rank greater than or equal to the signed one, the signed operand converts to the unsigned type.
6. Otherwise, if the signed type can represent every value of the unsigned type, the unsigned operand converts to the signed type.
7. Otherwise both convert to the unsigned counterpart of the signed type.

Steps 6 and 7 are where the platform leaks in. With LP64, `long` is wider than `unsigned int`, so step 6 applies and `-1L < 1u` is true. On LLP64, `long` and `unsigned int` are both 32 bits, step 7 applies, and the same comparison is false.

```cpp
#include <type_traits>

static_assert(!(-1 < 0u));  // step 5: -1 becomes UINT_MAX
static_assert(std::is_same_v<decltype(1u + 1ll), long long>);  // step 6 wherever long long
                                                               // is wider than unsigned int
// On LP64, long and unsigned long are both 64 bits:
//   1ul + 1ll has type unsigned long long (step 7)
```

Mixing an unscoped enumeration with a floating type, or two different enumeration types, was deprecated in C++20 and is ill-formed in C++26.

## Signed and unsigned comparison traps

Step 5 means any comparison between a negative `int` and an `unsigned int` or `std::size_t` is wrong. Compilers warn under `-Wsign-compare`, which `-Wall` enables in C++ for GCC. The common shapes are a container's `size()` compared with a signed index, `v.size() - 1` on an empty vector wrapping to the maximum value, and a countdown loop over an unsigned index whose condition `i >= 0` is always true.

```cpp
#include <utility>
#include <vector>

bool safe(int i, const std::vector<int>& v) {
  // return i < v.size();          // i == -1 converts to a huge value: false
  return std::cmp_less(i, v.size());  // C++20: compares mathematical values
}
```

C++20 added `std::cmp_equal`, `std::cmp_less` and the rest of the family in `<utility>`, which compare the mathematical values of any two standard integer types, and `std::ssize`, which returns a signed size.

## bool, fixed-width types and extended floating types

**bool.** A boolean conversion ([conv.bool]) turns a zero value, a null pointer or a null member pointer into `false` and anything else into `true`; `bool b = 0.5;` is `true`. Going the other way, `bool` promotes to `int`. Incrementing a `bool` was removed in C++17, and decrementing it was never allowed.

**Fixed-width integers.** `<cstdint>` provides `std::int8_t` through `std::int64_t` and their unsigned counterparts. They are optional: they exist only if the implementation has a type of exactly that width with no padding bits. `std::int_leastN_t` and `std::int_fastN_t` for 8, 16, 32 and 64 are always present. `std::uint8_t` is almost always an alias for `unsigned char`, so it promotes to `int` and streams as a character.

**Floating types.** `float`, `double` and `long double` only promise that each has at least the precision of the one before; IEEE 754 is what implementations do, and `std::numeric_limits<T>::is_iec559` reports it. C++23 (P1467) added optional **extended floating-point types** in `<stdfloat>`: `std::float16_t`, `std::float32_t`, `std::float64_t`, `std::float128_t` and `std::bfloat16_t`, with literal suffixes such as `f16` and `bf16`. They are distinct from the standard types even when the format matches, and P1467 gave every floating type a **floating-point conversion rank**. A conversion from a higher rank to a lower one is no longer implicit when an extended type is involved.

```cpp
#include <stdfloat>
#include <type_traits>

std::float16_t h = 1.0f16;    // OK
// std::float16_t g = 1.0;    // ill-formed: double has greater rank
static_assert(std::is_same_v<decltype(1.0f + 1.0f32), std::float32_t>);
// same rank as float, but the extended type has the greater subrank
```

Precision, rounding and special values are the floating-point-and-numerics topic's subject.

## What to remember

- The standard fixes minimum widths (8, 16, 16, 32, 64 bits) and an ordering, not sizes; LP64 and LLP64 disagree about `long`.
- Since C++20 signed integers are two's complement and narrowing integer conversions wrap modulo 2^N; signed arithmetic overflow is still undefined.
- `char`, `signed char` and `unsigned char` are distinct; `char`'s signedness is implementation-defined.
- Operands narrower than `int`, including `bool`, `char` and `unsigned short`, are promoted to `int` before arithmetic.
- In mixed comparisons, an unsigned operand of equal or higher rank wins, so `-1 < 0u` is false; use `std::cmp_less` and `std::ssize`.
- Whether a signed type absorbs an unsigned one depends on the platform's widths.
- Exact-width `std::intN_t` types are optional; the `least` and `fast` variants are not.
- C++23 extended floating types have their own conversion ranks and do not accept implicit narrowing from `double`.
