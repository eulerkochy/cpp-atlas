---
title: "Strict aliasing and undefined behavior"
summary: "Undefined behavior is a promise you make to the optimizer, not a crash you might get. This page covers the kinds of non-portable behavior, the type-accessibility rule behind strict aliasing, the sanctioned ways to reinterpret bytes, and the pointer rules that compilers quietly rely on."
track: "memory-model"
minutes: 14
standard:
  - "[intro.abstract]"
  - "[defns.undefined]"
  - "[basic.lval]"
  - "[basic.compound]"
  - "[expr.add]"
  - "[class.union]"
  - "[bit.cast]"
  - "[obj.lifetime]"
  - "[basic.indet]"
  - "[expr.const]"
cppreference:
  - title: "Undefined behavior"
    path: "language/ub"
  - title: "reinterpret_cast conversion (type aliasing)"
    path: "language/reinterpret_cast"
  - title: "std::bit_cast"
    path: "numeric/bit_cast"
  - title: "std::start_lifetime_as"
    path: "memory/start_lifetime_as"
  - title: "Union declaration"
    path: "language/union"
  - title: "Pointer arithmetic (additive operators)"
    path: "language/operator_arithmetic"
prerequisites:
  - "object-lifetime-and-storage"
  - "object-layout-and-alignment"
---

## The one idea

C++ is specified against an abstract machine. A conforming implementation only has to reproduce the observable behavior of that machine: volatile accesses, the data written to files, and the order of interactive input and output. Undefined behavior marks the executions for which the standard imposes no requirement at all. The optimizer turns that into an assumption. Because a correct program never executes undefined behavior, the compiler may assume yours does not, and it builds its transformations on that assumption.

> **Mental model.** UB is not "the hardware does something odd". It is a contract clause. You promised the compiler that this situation never arises, and the compiler spent that promise on deleting checks, reordering loads and collapsing loops. When the promise is broken, there is no meaningful program left to reason about.

The standard says this explicitly in [intro.abstract]. If an execution contains an undefined operation, there is no requirement on that execution, not even for the operations that came before it. Optimizations really do move effects across the bad operation.

```cpp
int first(int* p) {
  int v = *p;          // if p were null, this would be UB
  if (!p) return -1;   // so the compiler may assume p != nullptr and delete this check
  return v;
}

bool always(int x) {
  return x + 1 > x;    // signed overflow is UB, so GCC -O2 compiles this to "return true"
}
```

The same comparison on `unsigned` has to handle wraparound and is not folded. Signed overflow is undefined, while unsigned arithmetic is defined to wrap modulo two to the power of the bit width.

## Four kinds of "not portable"

The standard distinguishes several categories, and confusing them leads to wrong conclusions.

| Category | What the standard requires | Example |
|---|---|---|
| Implementation-defined | One documented behavior per implementation | `sizeof(int)`, right-shifting a negative value before C++20 |
| Unspecified | One of a set of allowed behaviors, not documented, may vary | evaluation order of function arguments |
| Undefined | Nothing at all | signed overflow, null dereference, data races |
| Ill-formed, no diagnostic required | The program is invalid, but the compiler need not say so | ODR violations, or `constinit` missing from the initializing declaration |

Unspecified behavior is constrained. In `f(g(), h())`, either `g` or `h` runs first, but they do not interleave and nothing else can happen. C++17 also made several famous expressions well-defined by sequencing them. One example is `i = i++ + 2`, because since C++17 the right operand of an assignment is sequenced before the left.

Reading an uninitialized automatic variable is undefined in C++23, except for the narrow case of `unsigned char` and `std::byte` copies. C++26 changes this. Under P2795 such a read becomes erroneous behavior: the variable holds an implementation-chosen value, the implementation is encouraged to diagnose the read, and the optimizer may no longer treat the read as impossible. The attribute `[[indeterminate]]` restores the old semantics where the cost matters. That change is C++26 only.

## The type-accessibility rule

"Strict aliasing" is the folk name for one paragraph of [basic.lval]. It does not talk about pointers at all. It talks about which glvalue types may access an object's stored value.

> **Standardese.** [basic.lval] says that a program which accesses an object through a glvalue whose type is not similar to one of the following has undefined behavior: the object's dynamic type, the signed or unsigned type corresponding to the dynamic type, or `char`, `unsigned char` or `std::byte`. "Similar" means the types match after cv-qualifiers are stripped at every level.

Three things follow from that list.

First, an `int` may be read as `unsigned int`, and a `const int` as `int`. Nothing else of a different type may read it: not `long`, even when `long` has the same size, not `float`, and not a struct whose first member is an `int`. C++20 removed the old wording about aggregates containing the type.

Second, `signed char` is not on the list. C allows every character type, but C++ allows only `char`, `unsigned char` and `std::byte`.

Third, the exemption is one-way. You may inspect any object through a byte glvalue. You may not treat a byte buffer as if it contained an `int` unless an `int` object actually lives there.

```cpp
#include <cstdint>

std::uint32_t bits_bad(float f) {
  return *reinterpret_cast<std::uint32_t*>(&f);   // UB: a float accessed as uint32_t
}

int store_bad() {
  alignas(int) char buf[sizeof(int)] = {};
  *reinterpret_cast<int*>(buf) = 1;               // UB: no int object lives in buf
  return buf[0];
}
```

The reason for the rule is performance. If a store through an `int*` cannot modify a `float`, the compiler can keep `float` values in registers across that store without reloading them. GCC enables this assumption from `-O2`, and Clang whenever it optimizes. The flag `-fno-strict-aliasing` turns it off for code that cannot be fixed.

## Why punning through a union fails in C++

In C, writing one union member and reading another reinterprets the bytes. C99 and C11 say so in a footnote. In C++, a union has at most one active member, and reading any other member reads an object outside its lifetime. That is undefined, and constant evaluation rejects it.

```cpp
#include <cstdint>
union U { float f; std::uint32_t u; };

constexpr std::uint32_t pun(float v) {
  U x;
  x.f = v;        // f becomes the active member
  return x.u;     // UB: u is not within its lifetime; a constant expression rejects this
}
```

GCC documents union punning as supported at run time, and Clang behaves the same way. That is a promise from the vendor, not from the language, and it does not hold inside `constexpr` code. One narrow exception is in the standard. If the union holds standard-layout structs that share a common initial sequence of members, you may read those shared members through the inactive alternative. This is the "tagged header" pattern.

## The sanctioned tools

There are three portable ways to get a value of type `To` from the bytes of something else.

`std::memcpy` copies the object representation into a real object of the destination type. Compilers recognize small fixed-size copies and emit a single register move, so this costs nothing at `-O2`.

`std::bit_cast<To>(from)` was added in C++20. It requires both types to be trivially copyable and of the same size, and it is `constexpr` when neither type contains a union, pointer, pointer to member, volatile or reference member. Unlike the `memcpy` idiom, it does not need `To` to be default-constructible.

`std::start_lifetime_as<T>(p)` was added in C++23. It is for the case where the bytes already sit in suitable storage, such as a network buffer or a mapped file. It creates a `T` there whose value is formed from those bytes and returns a pointer to it, without copying anything and without running a constructor. `T` must be an implicit-lifetime type.

```cpp
#include <bit>
#include <cstdint>
#include <cstring>

constexpr std::uint32_t bits(float f) { return std::bit_cast<std::uint32_t>(f); }
static_assert(bits(1.0f) == 0x3f800000);            // IEEE-754 binary32 assumed

std::uint32_t bits_memcpy(float f) {
  std::uint32_t u;
  std::memcpy(&u, &f, sizeof u);                    // well-defined; compiles to one move
  return u;
}
```

> **Pitfall.** `std::launder` is not a punning tool. It only finds an object that already exists at an address, with the type you ask for. Using it to read a `float` as an `int` is exactly as undefined as the `reinterpret_cast` it wraps.

## Provenance and pointer arithmetic

A pointer value in C++ is more than an address. It points to a particular object, or past the end of one, and the operations you may perform depend on that object. Pointer arithmetic is defined only within an array, treating a non-array object as an array of one element. You may form the pointer one past the last element and compare it, but not dereference it. Forming any pointer further out, including one before the first element, is undefined even if you never dereference it.

```cpp
int a[4]{};
int* end = a + 4;    // OK: one past the end
bool b = end != a;   // OK
int* q = a - 1;      // UB at the moment it is computed, even though it is never used
```

Comparing pointers into unrelated objects with `<` gives an unspecified result. `std::less` is guaranteed to provide a strict total order, so use it for pointer keys.

`reinterpret_cast` changes the pointed-to object only between pointer-interconvertible objects. Those are an object and itself, a union and each of its members, and a standard-layout class object and its first non-static data member, or a base class subobject when the class has no data members. For any other pair, the cast changes the pointer's type but it still points to the original object. That is why a pointer to an array's first element, cast to the type of an object living inside the array, needs `std::launder`. Two objects that happen to share an address are not thereby interchangeable.

## Constant evaluation diagnoses UB

The standard says that an expression which would perform an operation with undefined behavior, as specified in the core language clauses, is not a core constant expression. A `constexpr` variable, a `static_assert` or a template argument that needs such an expression is ill-formed, and the compiler must diagnose it. That turns the compiler into a UB checker for any code you can run at compile time.

```cpp
#include <climits>
constexpr int inc(int i) { return i + 1; }

constexpr int a = inc(INT_MAX);   // ill-formed: overflow is diagnosed
int b = inc(INT_MAX);             // compiles; dynamic initialization, UB at run time
```

There are two limits. Undefined behavior that the library specifies, such as violating a precondition of a standard function, need not be diagnosed. Compilers also have gaps. In testing for this page, Clang 21 rejected forming `a - 1` inside a constant expression, while GCC 16 accepted it without a diagnostic. Treat constant evaluation as a strong test, not a proof.

## What to remember

- UB is an assumption the optimizer may use, and it can affect code that runs before the bad operation.
- Keep implementation-defined (documented), unspecified (one of several outcomes), undefined (no requirement) and ill-formed NDR (invalid but silent) apart.
- An object may only be accessed through its own type, its signed or unsigned counterpart, or `char`, `unsigned char` and `std::byte`. `signed char` is not exempt, and the exemption does not work in reverse.
- Union punning is UB in C++, but defined in C. GCC and Clang allow it at run time as an extension, never in constant evaluation.
- Reinterpret bytes with `memcpy`, `std::bit_cast` (C++20) or `std::start_lifetime_as` (C++23).
- Pointer arithmetic stays within an array plus one past the end. Merely forming any other pointer is UB.
- `reinterpret_cast` only retargets between pointer-interconvertible objects. Otherwise use `std::launder` or the pointer that creation returned.
- Core-language UB in a constant expression is a compile error, which makes `constexpr` tests a cheap UB detector.
- C++26 turns uninitialized reads into erroneous behavior, with `[[indeterminate]]` as the opt-out.
