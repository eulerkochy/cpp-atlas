---
title: "Bit manipulation"
summary: "C++20 gave bits a real library in the header bit, and it also pinned down shifts on signed numbers. The traps that remain are shift counts, integer promotion on small types, and the preconditions of a few functions."
track: "utilities"
minutes: 13
standard:
  - "[bit]"
  - "[bit.cast]"
  - "[bit.byteswap]"
  - "[bit.endian]"
  - "[bit.pow.two]"
  - "[bit.rotate]"
  - "[bit.count]"
  - "[expr.shift]"
  - "[expr.unary.op]"
  - "[conv.prom]"
  - "[class.bit]"
  - "[support.types.byteops]"
cppreference:
  - title: "Bit manipulation (header bit)"
    path: "header/bit"
  - title: "std::bit_cast"
    path: "numeric/bit_cast"
  - title: "std::popcount"
    path: "numeric/popcount"
  - title: "std::bit_ceil"
    path: "numeric/bit_ceil"
  - title: "std::rotl"
    path: "numeric/rotl"
  - title: "std::byteswap"
    path: "numeric/byteswap"
  - title: "std::endian"
    path: "types/endian"
  - title: "Arithmetic operators (shift operators)"
    path: "language/operator_arithmetic"
  - title: "std::byte"
    path: "types/byte"
  - title: "Bit-field"
    path: "language/bit_field"
prerequisites:
  - "fundamental-types-and-arithmetic-conversions"
  - "strict-aliasing-and-undefined-behavior"
---

## The one idea

Bit work in C++ goes wrong in three places: the operand is narrower than `int` and gets promoted, the shift count is out of range, or the function has a precondition that nobody read. The `<bit>` header, added in C++20, removes most of the hand-written loops and compiler intrinsics. What is left are those three traps.

> **Mental model.** Treat every integer as a fixed-width row of bits, but remember that arithmetic and shifts first widen anything smaller than `int` to `int`. The `<bit>` functions skip that step: they look at the width of the exact type you pass.

Since C++20 the language also says that signed integers use two's complement. That is why the rules for shifting signed values could finally be written as plain arithmetic.

## What `<bit>` offers

The counting and rotating functions work on unsigned integer types only: `unsigned char`, `unsigned short`, `unsigned int`, the longer unsigned types, and extended unsigned types. They do not accept signed types, plain `char`, `bool`, `char8_t`, `char16_t`, `char32_t` or `wchar_t`. Calling `std::popcount(1)` is rejected at compile time because `1` is an `int`.

```cpp
#include <bit>
#include <cstdint>
#include <cstdio>

int main() {
  std::printf("%d\n", std::popcount(0b1011u));            // 3
  std::printf("%d\n", std::countl_zero(1u));              // 31 for a 32-bit unsigned int
  std::printf("%d\n", std::countl_zero(std::uint8_t{1})); // 7: the width of uint8_t, not of int
  std::printf("%d\n", std::countr_zero(8u));              // 3
  std::printf("%d\n", std::bit_width(255u));              // 8
  std::printf("%d\n", std::has_single_bit(0u));           // 0: zero is not a power of two
}
```

The second and third lines show the point of the mental model. `countl_zero` counts from the top of the type you gave it, not from the top of an `int`.

`rotl` and `rotr` rotate within the width of the type, and a negative count rotates the other way, so `std::rotl(x, -1)` equals `std::rotr(x, 1)`. Unlike a built-in shift, a rotate count of any value is defined.

```cpp
#include <bit>
#include <cstdint>

static_assert(std::rotl(std::uint8_t{0x81}, 1) == 0x03);
static_assert(std::rotl(std::uint8_t{0x81}, -1) == 0xC0);
static_assert(std::byteswap(std::uint16_t{0x1234}) == 0x3412);  // C++23
```

The power-of-two helpers are `has_single_bit`, `bit_floor`, `bit_ceil` and `bit_width`. `bit_floor(37u)` is 32, `bit_ceil(37u)` is 64, and `bit_width(0u)` is 0. `bit_floor(0)` is 0, and `bit_ceil(0)` is 1.

> **Standardese.** [bit.pow.two] says `bit_ceil(x)` is the smallest power of two not smaller than `x`, and that the behaviour is undefined if that value is not representable in the type. So `bit_ceil(0x80000001u)` is undefined for a 32-bit `unsigned`, and because the function is `constexpr`, constant evaluation rejects the call instead of returning a wrapped value.

`std::byteswap`, added in C++23, reverses the bytes of any integer type, signed ones included. It does not know about endianness. To convert between a wire order and the host order, compare `std::endian::native` against `std::endian::little` or `std::endian::big`. If `native` equals neither, the platform is mixed-endian, which is rare but allowed.

## `bit_cast`

`std::bit_cast<To>(from)` reinterprets the object representation of `from` as a value of type `To`. Both types must have the same size and be trivially copyable, or the call does not compile. It is `constexpr` when neither type contains a pointer, a union, a reference, or a volatile member, which makes it the sanctioned way to look inside a float in a constant expression.

```cpp
#include <bit>
#include <cstdint>

// Assumes IEEE binary32 float and a 32-bit unsigned.
static_assert(std::bit_cast<std::uint32_t>(1.0f) == 0x3f800000u);
// std::bit_cast<float>(std::uint64_t{1});  // ill-formed: sizes differ
```

Unlike `reinterpret_cast`, `bit_cast` creates a new object, so there is no aliasing problem. The `strict-aliasing-and-undefined-behavior` topic explains why `*reinterpret_cast<uint32_t*>(&f)` is not equivalent. If some bit pattern in the source does not correspond to a valid value of `To`, for example when casting arbitrary bytes to `bool`, the behaviour is undefined.

## Shifts: the counts

A shift expression has undefined behaviour when the right operand is negative or is greater than or equal to the width of the promoted left operand. This holds for `<<` and `>>`, signed and unsigned, and it is what makes `1u << 32` undefined for a 32-bit `unsigned`. The result is not zero, and nothing else is promised either.

```cpp
// constexpr unsigned a = 1u << 32;
// ill-formed: shift count >= width, so not a constant expression

constexpr unsigned mask(unsigned n) {
  return n == 0 ? 0u : ~0u >> (32 - n);  // n == 32 gives all ones; 0 must be handled
}
```

The classic form `(1u << n) - 1` for the low `n` bits fails at `n == 32`. Guard the edge cases explicitly, as the function above does for zero.

The type of the result is the promoted type of the left operand alone. The type of the count does not matter.

## Shifts: signedness and promotion

Right shift of a negative signed number was implementation-defined before C++20. Since C++20 it is the arithmetic shift: the result rounds toward negative infinity. That differs from division, which truncates toward zero.

```cpp
#include <cstdio>

int main() {
  std::printf("%d %d\n", -7 >> 1, -7 / 2);  // -4 -3 in C++20 and later
  int a = -1;
  std::printf("%d\n", a << 3);              // -8, well-defined since C++20
}
```

Left shift of a signed value used to be undefined for a negative left operand, and for results that did not fit even in the unsigned counterpart type. Since C++20 the result is the mathematical product reduced modulo 2 to the power of the width, interpreted as signed. So `-1 << 3` is `-8`, and `1 << 31` is `INT_MIN` for a 32-bit `int`. The count rules above still apply.

Integer promotion is the second trap. Each operand of a shift or bitwise operator is promoted separately, so a `std::uint8_t` or `unsigned short` becomes `int` first.

```cpp
#include <cstdint>
#include <cstdio>

int main() {
  std::uint8_t b = 0x0F;
  std::printf("%d\n", ~b);                   // -16, not 240: ~ works on the promoted int
  std::printf("%d\n", ~b == 0xF0);           // 0
  std::printf("%d\n", std::uint8_t(~b));     // 240: convert back to the narrow type
  std::uint8_t c = 0x80;
  std::printf("%d\n", c << 24);              // -2147483648: promoted to int, defined in C++20
}
```

Assume 32-bit `int` for those results. The fix is to convert back to the narrow type after the operation, or to work in `unsigned` throughout. The promotion rules themselves belong to `fundamental-types-and-arithmetic-conversions`.

> **Pitfall.** Shifting a `uint8_t` or `unsigned short` left is not an unsigned operation. The operand is promoted to `int`, so the result of `std::uint8_t{0x80} << 24` is the negative `int` `INT_MIN`, not the unsigned value 2147483648.

## Masks, `std::byte` and bit-fields

For raw memory, `std::byte` is an `enum class : unsigned char` that supports the bitwise operators and shifts but no arithmetic. That stops you adding two bytes by accident. Convert with `std::to_integer<int>(b)`, and build a byte by list-initializing from a constant.

```cpp
#include <cstddef>

constexpr std::byte lo{0x0F};
constexpr std::byte hi = lo << 4;               // 0xF0, and the type stays std::byte
static_assert(std::to_integer<int>(hi) == 240);
static_assert((hi | lo) == std::byte{0xFF});
```

Reading multi-byte values from a buffer is where bit work, promotion and endianness meet. The portable way to decode a big-endian value is with shifts, which give the same answer on every host. Each byte is widened to `std::uint32_t` before it is shifted, because shifting the byte directly would promote it to `int` and push the top byte into the sign bit. When the value is already sitting in an integer in network order, `std::endian::native` selects whether a `std::byteswap` is needed.

```cpp
#include <bit>
#include <cstddef>
#include <cstdint>

constexpr std::uint32_t load_be32(const std::byte* p) {
  return (std::uint32_t(p[0]) << 24) | (std::uint32_t(p[1]) << 16) |
         (std::uint32_t(p[2]) << 8)  |  std::uint32_t(p[3]);
}

constexpr std::uint32_t be_to_host(std::uint32_t v) {  // byteswap is C++23
  if constexpr (std::endian::native == std::endian::little) return std::byteswap(v);
  else return v;
}
```

The first function never mentions endianness, which is the point: arithmetic on values is host-independent, and only the interpretation of raw memory depends on the host.

Bit-fields look convenient, but the order of allocation, whether a field may straddle a storage unit, and how the compiler packs them are implementation-defined. Use them for compact in-memory flags, and use explicit shifts and masks for anything that must match a file format or a protocol. The standard does not promise that two compilers produce the same layout.

## What to remember

- `<bit>` functions need unsigned integer types and look at the width of the exact type; `countl_zero(uint8_t{1})` is 7.
- `bit_ceil` is undefined when the result does not fit, and constant evaluation catches it. `bit_floor(0)` is 0 and `bit_ceil(0)` is 1.
- `rotl` and `rotr` accept any count; a negative count reverses the direction.
- `std::byteswap` is C++23 and works on any integer type; `std::endian` is the way to ask about host order.
- `bit_cast` needs equal sizes and trivially copyable types, works in constant expressions, and avoids the aliasing rules.
- A shift count that is negative or at least the promoted width is undefined, for both directions.
- Since C++20, right shift of a negative number is arithmetic, and left shift of a signed number is modular.
- Operands smaller than `int` are promoted before `~`, `<<`, `>>` and the other bit operators.
- Use `std::byte` for raw bytes, and avoid bit-fields for external formats.
