---
title: "Strict aliasing and undefined behavior"
summary: "Why the optimizer relies on type-based alias analysis, what [basic.lval] permits, why union punning fails in C++, and how std::bit_cast replaces pointer casts."
track: memory-model
minutes: 10
standard:
  - "[basic.lval]"
  - "[intro.abstract]"
  - "[expr.reinterpret.cast]"
  - "[bit.cast]"
  - "[class.union]"
  - "[class.mem.general]"
cppreference:
  - title: "Undefined behavior"
    path: "language/ub"
  - title: "The as-if rule"
    path: "language/as_if"
  - title: "reinterpret_cast conversion"
    path: "language/reinterpret_cast"
  - title: "std::bit_cast"
    path: "numeric/bit_cast"
  - title: "std::memcpy"
    path: "string/byte/memcpy"
  - title: "Union declaration"
    path: "language/union"
prerequisites:
  - "casts-and-qualifiers"
  - "object-lifetime-and-storage"
---

When programmers complain that an optimizing compiler "broke" working debug code at `-O2`, the underlying culprit is almost always **undefined behavior (UB)**—frequently triggered by type punning across unrelated pointers. Understanding what the C++ abstract machine promises, and why it refuses to alias `float*` with `uint32_t*`, separates predictable low-level systems code from ticking time bombs.

## The contract behind undefined behavior and as-if

Under `[intro.abstract]`, a conforming C++ compiler must preserve the observable behavior of any program executing well-defined operations—known as the **as-if rule**. When an operation triggers undefined behavior, the standard imposes zero requirements on the resulting execution.

Crucially, UB is not a local runtime hiccup that merely yields a surprising integer. Optimizing compilers treat UB as **unreachable**: if execution reaches a path that unconditionally violates a rule, the compiler may prove the conditions leading to that path are impossible and delete surrounding branches, hoist loads out of loops, or reorder stores globally—even retroactively *before* the failing line runs.

## The strict aliasing rule in [basic.lval]

To generate fast code without reloading every register after every pointer write, compilers perform **Type-Based Alias Analysis (TBAA)**. Suppose a function takes `float* f` and `std::uint32_t* u`: if the compiler had to assume writing `*u = 0` could overwrite `*f`, it could never cache `*f` in a floating-point register across stores.

Section `[basic.lval]/11` codifies the **strict aliasing rule**. Attempting to access the stored value of an object through a glvalue whose type is unrelated to the object's dynamic type is undefined behavior unless the glvalue's type matches one of these permitted categories:

| Permitted glvalue type | Example access | Why the standard allows it |
| --- | --- | --- |
| Dynamic type (or cv-qualified) | Reading `T` via `const T&` | Direct access matching live object |
| Signed or unsigned variant | Reading `int` via `unsigned int&` | Standard signedness compatibility |
| Aggregate or union containing permitted type | Reading `struct S { int x; }` | Accessing enclosing layout |
| Base class subobject type | Accessing `Derived` via `Base&` | Object-oriented polymorphism |
| `char`, `unsigned char`, or `std::byte` | Inspecting raw object representation | Byte-level serialization and `memcpy` |

> **Mental model.** Pointers in C++ carry **type provenance**, not merely raw virtual addresses. Saying two pointers hold the same address does not authorize accessing memory through a type unrelated to the live object stored there.

> **Standardese.** Notice the exact wording of `[basic.lval]/11`: byte-wise aliasing is granted exclusively to `char`, `unsigned char`, and `std::byte`—**not** `signed char`, `std::int8_t`, or `std::uint8_t` (when `uint8_t` is not guaranteed to be `unsigned char` on every hypothetical platform, though typically an alias). In generic code, use `std::byte` or `unsigned char` explicitly.

## Why pointer casts and union punning fail in C++

Two classic C idioms break silently in C++:

First, **`reinterpret_cast` pointer punning**:

```cpp
// Broken UB: violates strict aliasing in [basic.lval]/11!
float f = 1.0f;
std::uint32_t bits = *reinterpret_cast<std::uint32_t*>(&f);
```

While `reinterpret_cast` itself converts the pointer value (assuming alignment holds), **dereferencing** that `std::uint32_t*` reads an object whose dynamic type is `float` through an unrelated type `std::uint32_t`. At `-O2`, GCC and Clang routinely cache `f` in a register or eliminate stores because TBAA assumes `uint32_t*` and `float*` never alias.

Second, **union type punning**: in C99/C11, writing to one union member and reading another inspects the object representation cleanly. **Standard C++ forbids this** under `[class.union]`: a union holds at most one active member at any instant, and reading an inactive member is undefined behavior (with one narrow exception for the **common initial sequence** of two standard-layout struct members inside a standard-layout union per `[class.mem.general]`):

```cpp
struct HeaderA { int tag; double payload; };
struct HeaderB { int tag; long extra; };
union Packet {
    HeaderA a;
    HeaderB b;
};

int read_common_tag(const Packet& p) noexcept {
    // Valid even if p.b is active: `tag` is in the common initial sequence.
    return p.a.tag;
}
```

> **Pitfall.** Several compilers tolerate union type punning at runtime as a non-standard C compatibility extension, yet reject inactive-member reads immediately in `constexpr` evaluation and make no cross-translation-unit guarantees. Never rely on union punning for bit conversion.

## Safe bit inspection: bit_cast, memcpy, and byte spans

Modern C++ offers clean, zero-overhead primitives that convey intent to the optimizer without violating `[basic.lval]`.

Since C++20, **`std::bit_cast<To>(from)`** (`<bit>`) is the canonical way to reinterpret bits between identically sized trivially copyable types (`sizeof(To) == sizeof(From)`). Better still, `std::bit_cast` is `constexpr` (provided the representation has no indeterminate bits or pointers in constant evaluation) and compiles down to a single register-to-register move:

```cpp
#include <bit>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

constexpr std::uint32_t float_bits(float f) noexcept {
    return std::bit_cast<std::uint32_t>(f);
}
static_assert(float_bits(1.0f) == 0x3f800000u);

std::uint32_t float_bits_pre20(float f) noexcept {
    std::uint32_t out = 0;
    std::memcpy(&out, &f, sizeof(out)); // Valid in every C++ standard
    return out;
}

std::byte first_byte_of(const double& d) noexcept {
    auto bytes = std::as_bytes(std::span{&d, 1});
    return bytes[0];
}
```

Before C++20, **`std::memcpy`** into an appropriately typed destination object has always been valid and optimizes away completely into the same register move under GCC, Clang, and MSVC. When you merely want to hash, checksum, or serialize raw bytes, `std::as_bytes(std::span{&obj, 1})` hands you a `std::span<const std::byte>` that obeys `[basic.lval]/11` natively.

## Common UB traps beyond aliasing

Strict aliasing is only one member of the UB family that aggressively transforms optimized builds:

- **Signed integer overflow:** Unlike unsigned arithmetic (which wraps modulo 2^N), signed overflow (`INT_MAX + 1`) is UB (`[expr.pre]`). Compilers optimize `x + 1 > x` to unconditional `true` for signed `int`, breaking overflow checks written *after* the addition.
- **Post-dereference null checks:** Writing `int v = *p; if (!p) return;` proves to the optimizer that `p` was non-null at line 1 (otherwise UB already occurred), letting the compiler delete the `if (!p)` guard entirely.
- **Out-of-bounds pointer arithmetic:** Forming a pointer outside `[begin, end]` (even `begin - 1` or `end + 1`, and even without dereferencing!) triggers UB under `[expr.add]`. Only the one-past-the-end pointer `end` may be formed, never dereferenced.

> **Pitfall.** Checking `if (x + delta < x)` on signed integers to detect overflow invites the optimizer to delete the entire check because signed overflow cannot happen in well-defined C++. Always check bounds *before* performing signed arithmetic, or cast to the unsigned counterpart.

## What to remember

- Undefined behavior is an **optimizer assumption**, not a guaranteed crash: once a path invokes UB, surrounding checks and branches can vanish globally.
- Under **`[basic.lval]/11`**, unrelated pointer types cannot alias; only matching types, signed/unsigned pairs, enclosing aggregates/unions, bases, and `char`/`unsigned char`/`std::byte` may view the same object's bytes.
- Replace `*reinterpret_cast<U*>(&t)` and C-style union punning with **`std::bit_cast`** (C++20+), **`std::memcpy`**, or **`std::as_bytes`**.
- Keep `signed char` separate from byte-inspection types (`std::byte` / `unsigned char`) and guard against signed overflow, post-dereference null checks, and out-of-range pointer formation.
