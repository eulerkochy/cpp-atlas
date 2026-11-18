---
title: "Integer arithmetic and overflow"
summary: "Unsigned integers wrap around, signed integers do not get to overflow at all, and promotion quietly turns narrow unsigned arithmetic into signed arithmetic. This topic covers the division rules, safe comparison, narrowing, and the newer saturating and checked operations."
track: "utilities"
minutes: 13
standard:
  - "[expr.pre]"
  - "[expr.mul]"
  - "[expr.const]"
  - "[basic.fundamental]"
  - "[conv.integral]"
  - "[dcl.init.list]"
  - "[utility.intcmp]"
  - "[c.math.abs]"
  - "[iterator.range]"
cppreference:
  - title: "Arithmetic operators"
    path: "language/operator_arithmetic"
  - title: "Integer comparison functions (cmp_less, in_range)"
    path: "utility/intcmp"
  - title: "std::in_range"
    path: "utility/in_range"
  - title: "Implicit conversions"
    path: "language/implicit_conversion"
  - title: "Usual arithmetic conversions"
    path: "language/usual_arithmetic_conversions"
  - title: "Saturation arithmetic"
    path: "numeric/add_sat"
  - title: "Undefined behavior"
    path: "language/ub"
  - title: "Fixed width integer types"
    path: "types/integer"
prerequisites:
  - "fundamental-types-and-arithmetic-conversions"
  - "implicit-conversions"
  - "constant-expressions"
---

## The one idea

C++ has two integer worlds with opposite contracts. Unsigned arithmetic is arithmetic modulo a power of two, so overflow is a defined, wrapping result. Signed arithmetic has no such result: if the mathematical value does not fit, the behaviour of the expression is undefined. The language does not wrap signed values even though C++20 requires two's complement representation.

> **Mental model.** An unsigned operation always has an answer, and that answer is reduced modulo 2 to the width. A signed operation has an answer only when the true result fits. When it does not, the program has left the rules, and the optimizer is allowed to have assumed that it never would.

The practical consequence is that a rule you learned for `unsigned` is a bug when you apply it to `int`, and the reverse. The part that surprises experienced programmers is how often an expression that looks unsigned is really signed, because of promotion.

## Signed overflow is undefined, and the compiler uses that

[expr.pre] says that if evaluating an expression produces a result that is not in the range of representable values for its type, the behaviour is undefined. For signed integers this is not a theoretical remark. Compilers use it to reason that `x + 1 > x` is always true.

```cpp
bool f(int x)      { return x + 1 > x; }  // GCC at -O2 on arm64 compiles this to "return true"
bool g(unsigned x) { return x + 1 > x; }  // false when x is UINT_MAX, and the code must handle it
```

You can ask the toolchain for help: `-fsanitize=signed-integer-overflow` reports the problem at run time, `-ftrapv` turns it into a trap, and `-fwrapv` gives it a wrapping meaning as a non-standard extension. Constant evaluation is the standard's own detector. A `constexpr` initializer whose evaluation overflows is not a constant expression, so the compiler must reject it.

```cpp
#include <climits>

// constexpr int a = INT_MAX + 1;   // ill-formed: signed overflow is not a constant expression
constexpr unsigned b = UINT_MAX + 1u;  // OK: unsigned arithmetic wraps, b is 0
static_assert(b == 0);
```

The consequence for checks is that you must test before the operation, never after it. Writing `if (a + b < a)` to detect overflow of a signed `a + b` is itself undefined when it overflows, and the optimizer is free to delete the test because it may assume the sum never wraps. The portable form compares against the limits first.

```cpp
#include <climits>

bool add_overflows(int a, int b) {
  return (b > 0 && a > INT_MAX - b) || (b < 0 && a < INT_MIN - b);
}
// Wrong: return a + b < a;   // evaluates the overflowing addition, then tests it
```

For unsigned values the after-the-fact test is fine, because wrapping is defined: `a + b < a` is true exactly when the unsigned sum wrapped. That asymmetry is another reason to keep sizes and bit patterns unsigned and to keep quantities that can go negative signed.

## Promotion turns unsigned into signed

Operands narrower than `int` are promoted before arithmetic. On a platform with 32-bit `int`, an `unsigned short` becomes an `int`, so multiplying two of them is a signed multiplication that can overflow. The rules for promotion and the usual arithmetic conversions are in `fundamental-types-and-arithmetic-conversions`. Here the consequence matters.

```cpp
constexpr unsigned short a = 65535;
// constexpr auto r = a * a;
// ill-formed with 32-bit int: both promote to int, and 4294836225 does not fit
constexpr auto ok = static_cast<unsigned>(a) * a;  // OK: 4294836225u, unsigned arithmetic
```

The type of `r` would be `int`, not `unsigned short` or `unsigned`. The same trap catches `uint8_t` and `uint16_t` arithmetic in hash functions and checksums. The fix is to convert one operand to `unsigned` before the operation. Writing `1u * a * b` does the same.

## Division and remainder

Division truncates toward zero. This has been required since C++11, where earlier standards left it to the implementation for negative operands. The remainder has the sign of the dividend, and the identity `(a / b) * b + a % b == a` always holds when the quotient is representable.

```cpp
#include <cstdio>

int main() {
  std::printf("%d %d\n", -7 / 2, -7 % 2);   // -3 -1
  std::printf("%d %d\n", 7 / -2, 7 % -2);   // -3 1
}
```

Dividing by zero is undefined for both `/` and `%`. The other case is `INT_MIN / -1`, whose mathematical result 2147483648 does not fit in a 32-bit `int`. [expr.mul] says that when the quotient is not representable, the behaviour of both `a / b` and `a % b` is undefined. So `INT_MIN % -1` is undefined as well, although its mathematical value would be 0. On x86 the hardware traps on it.

> **Standardese.** [expr.mul] states that for integral operands, if the quotient `a / b` is representable in the type of the result, then `(a / b) * b + a % b` equals `a`; otherwise the behaviour of both `a / b` and `a % b` is undefined. This is why the remainder operator shares the hazard of the division.

`std::abs(INT_MIN)` fails the same way: the absolute value is not representable, and [c.math.abs] leaves it undefined. If you need the absolute value of an arbitrary `int`, compute in a wider type or convert to `unsigned` first.

## Comparing mixed signs safely

When a signed and an unsigned operand of the same rank meet, the signed one is converted to unsigned. So `-1 < 1u` is false, because `-1` becomes `UINT_MAX`. The surprise disappears when the unsigned type is narrower: `-1 < static_cast<unsigned short>(1)` is true, because both promote to `int`.

C++20 added comparison functions in `<utility>` that compare by mathematical value. They are `std::cmp_equal`, `cmp_not_equal`, `cmp_less`, `cmp_greater`, `cmp_less_equal` and `cmp_greater_equal`. Next to them is `std::in_range<R>(value)`, which tells you whether a value fits in type `R`.

```cpp
#include <cstdint>
#include <cstdio>
#include <utility>

int main() {
  std::printf("%d %d\n", -1 < 1u, std::cmp_less(-1, 1u));  // 0 1
  std::printf("%d %d\n", std::in_range<unsigned>(-1),
                         std::in_range<std::uint8_t>(255)); // 0 1
}
```

These functions accept only standard and extended integer types. `char`, `bool`, `char8_t`, `char16_t`, `char32_t` and `wchar_t` are rejected at compile time, so `std::cmp_less('a', 1)` is ill-formed. The functions are meant for numbers only.

C++20 also added `std::ssize(c)`, which returns a signed size, so loops over indices need no cast. Together with the previous point, this is the standard cure for the classic loop bug.

```cpp
#include <vector>

void bad(const std::vector<int>& v) {
  // for (std::size_t i = v.size() - 1; i >= 0; --i)  // i >= 0 is always true; v.size() - 1 wraps if empty
}

void good(const std::vector<int>& v) {
  for (auto i = std::ssize(v) - 1; i >= 0; --i) { (void)v[i]; }
  for (auto i = v.size(); i-- > 0; ) { (void)v[i]; }  // unsigned idiom, correct for empty vectors
}
```

> **Pitfall.** An empty vector has `size()` equal to zero, and `size() - 1` is `SIZE_MAX`, a well-defined wrap that is almost never what you meant. The condition `i >= 0` on an unsigned `i` is always true, so the first loop above never ends on its own.

## Narrowing and conversion

Converting any integer to an unsigned type is always modular. Converting to a signed type, when the value does not fit, was implementation-defined until C++20, and since C++20 it is modular too: the result is the unique value congruent to the source modulo 2 to the width. So an `int` holding 200 converts to `std::int8_t` as -56 in every C++20 program.

```cpp
#include <cstdint>

void narrow(int big) {
  std::int8_t a = big;      // if big is 200: -56 since C++20, implementation-defined before
  unsigned u = -1;          // UINT_MAX, always
  // std::int8_t b{big};    // ill-formed: narrowing in list-initialization
  std::int8_t c{100};       // OK: a constant that fits is not narrowing
  (void)a; (void)u; (void)c;
}
```

List-initialization is stricter. A conversion that may change the value is ill-formed unless the source is a constant expression whose value fits. Defined does not mean harmless: a modular conversion still silently changes the number.

## Saturating and checked arithmetic

Two library features give you overflow handling without undefined behaviour. Both are C++26.

Saturating arithmetic in `<numeric>` clamps to the limits of the type. The C++26 draft names the functions `std::add_sat`, `std::sub_sat`, `std::mul_sat` and `std::div_sat`, plus `std::saturate_cast<R>(x)`. These are C++26 additions. The libstdc++ 16 headers used for this topic spell the same operations `saturating_add`, `saturating_sub`, `saturating_mul`, `saturating_div` and `saturating_cast`, so check your library before relying on the draft names.

```cpp
// C++26: std::add_sat(std::int8_t{100}, std::int8_t{100}) == 127
// C++26: std::saturate_cast<std::uint8_t>(-5) == 0
```

Checked arithmetic comes from the C23 header `<stdckdint.h>`, which C++26 adopts. The functions `ckd_add`, `ckd_sub` and `ckd_mul` take a pointer to the result and two integer operands. They return `true` if the result did not fit, and in that case they store the wrapped value.

```cpp
#include <stdckdint.h>  // C++26

int r;
bool overflowed = ckd_add(&r, 2147483647, 1);  // true, and r holds the wrapped result
```

Until your toolchain has them, the compiler builtins `__builtin_add_overflow` and its relatives do the same job in GCC and Clang.

## What to remember

- Unsigned overflow wraps modulo 2 to the width; signed overflow is undefined, and compilers optimize on that.
- Constant evaluation rejects signed overflow, which makes `constexpr` a good test for it.
- `unsigned short * unsigned short` is a signed `int` multiplication; convert an operand to `unsigned` first.
- Division truncates toward zero since C++11, and the remainder takes the sign of the dividend.
- `INT_MIN / -1` and `INT_MIN % -1` are both undefined, as is division by zero and `std::abs(INT_MIN)`.
- `-1 < 1u` is false; use `std::cmp_less` and friends, or `std::in_range`, to compare by value.
- The `cmp_*` functions reject `char` types and `bool`.
- Use `std::ssize` or the `i-- > 0` idiom to avoid `size_t` underflow in loops.
- Narrowing to a signed type is modular since C++20, but list-initialization still forbids narrowing.
- C++26 adds saturating operations in `<numeric>` and checked `ckd_*` operations in `<stdckdint.h>`.
