---
title: "Casts and cv-qualifiers"
summary: "What const and volatile actually guarantee, why multi-level pointer conversions restrict const, and how to pick the narrowest C++ cast without breaking strict aliasing."
track: "types-and-initialization"
minutes: 9
standard:
  - "[dcl.type.cv]"
  - "[conv.qual]"
  - "[expr.static.cast]"
  - "[expr.const.cast]"
  - "[expr.reinterpret.cast]"
  - "[expr.dynamic.cast]"
  - "[expr.cast]"
  - "[bit.cast]"
  - "[basic.lval]"
cppreference:
  - title: "cv type qualifiers"
    path: "language/cv"
  - title: "static_cast conversion"
    path: "language/static_cast"
  - title: "const_cast conversion"
    path: "language/const_cast"
  - title: "reinterpret_cast conversion"
    path: "language/reinterpret_cast"
  - title: "dynamic_cast conversion"
    path: "language/dynamic_cast"
  - title: "Explicit type conversion"
    path: "language/explicit_cast"
  - title: "std::bit_cast"
    path: "numeric/bit_cast"
  - title: "std::as_const"
    path: "utility/as_const"
prerequisites:
  - "initialization-forms"
  - "type-deduction-auto-decltype"
---

C++ developers often treat `const` as a statement about hardware immutability and reach for casts whenever the compiler complains about types. Both habits invert how the language actually works. Qualifiers describe permissions along a specific access path or object definition, and every named cast is a contract specifying exactly which type-system boundary you are crossing—and what invariants you promise not to violate.

## What const and volatile actually promise

A cv-qualifier (`const`, `volatile`, or both) attaches to a type, not merely a variable name. When you declare an object `const int limit = 64;`, the object itself is a **const object** (`[dcl.type.cv]`). Attempting to modify `limit` by any means—even after casting away `const`—is undefined behavior, and the compiler is free to fold `limit` into immediate instructions or place it in read-only memory.

By contrast, when you take `const int& view = counter;` on a non-const `int counter = 0;`, `const` restricts only that **access path**. Other aliases (`counter` or `int*`) may still mutate the object, so the compiler cannot assume a `const T&` parameter never changes across function calls unless it proves no mutable alias exists.

> **Mental model.** A pointer-to-const or reference-to-const is a read-only window onto an object, not a promise that the underlying object itself is immutable.

Two keywords frequently misunderstood alongside `const` serve narrow, distinct roles:

- **`mutable`**: Applies to non-static, non-reference, non-const class data members. It permits modifying logical state—such as a memoized cache or an internal `std::mutex`—inside a `const`-qualified member function, even when the enclosing object is genuinely `const`.
- **`volatile`**: Instructs the compiler that reads and writes through this glvalue are observable side effects that must not be cached in registers, reordered across other volatile accesses, or optimized away. It exists for memory-mapped hardware registers, `std::sig_atomic_t` signal handlers, and `setjmp`/`longjmp` locals. It provides **no atomicity**, **no memory fences**, and **no thread-safety guarantees**.

## Qualification conversions and the const T** trap

Adding `const` at the top level of a pointer (`int*` to `const int*`) is always safe because it only removes write permission through the new pointer. Multi-level pointers obey a stricter rule under `[conv.qual]`: an implicit conversion from `int**` to `const int**` is **ill-formed**, whereas `int**` to `const int* const*` succeeds.

The reason is memory safety without casts. Suppose `int**` could convert implicitly to `const int**`:

```cpp
void sneaky(const int** pp, const int* target) {
    *pp = target; // Stores pointer-to-const into caller's int*!
}

void demo() {
    const int immutable = 42;
    int* p = nullptr;
    // sneaky(&p, &immutable); // Rejected by [conv.qual]: int** -> const int**
    const int* const* safe_view = &p; // Allowed: outer pointer is also const
    (void)safe_view;
}
```

If `sneaky(&p, &immutable)` compiled, `p` (whose type is `int*`) would end up pointing at `immutable`, letting `*p = 99;` silently overwrite a `const int` object without a single cast. Under `[conv.qual]`, whenever `const` or `volatile` is added at indirection depth `k > 0`, every outer indirection level from `1` up to `k - 1` must also be `const`-qualified.

When you want to add `const` to an lvalue expression explicitly—for instance, to force a `const` overload or prevent a range-for loop from detaching a copy-on-write container—prefer `std::as_const(obj)` from `<utility>` over `const_cast`. `std::as_const` returns `const T&` and explicitly deletes its rvalue overload (`const T&& = delete`) so you never bind a temporary accidentally.

## Named C++ casts: choosing the narrowest tool

C++ splits explicit conversions into four specialized operators plus `std::bit_cast` so readers and compilers can verify intent at the call site.

| Cast operator | Checks or work performed | Touches cv? | Adjusts base/derived offset? | Primary failure mode |
| --- | --- | --- | --- | --- |
| `static_cast` | Compile-time inverse of implicit conversions and explicit constructors | No | Yes | Unchecked downcast to wrong dynamic type causes UB |
| `const_cast` | Adds or strips `const` and `volatile` on pointers or references | Yes | No | Writing to an object originally defined as `const` causes UB |
| `dynamic_cast` | Runtime RTTI check across polymorphic class hierarchies | No | Yes | Returns `nullptr` for pointers or throws `std::bad_cast` for references |
| `reinterpret_cast` | Bit-pattern or unrelated pointer/integer type reinterpretation | No | No | Strict-aliasing UB on dereference if dynamic type mismatches |
| `std::bit_cast` | Value-preserving copy of object representation bytes (`sizeof` equal) | N/A | N/A | Requires trivially copyable source and destination types |
| C-style `(T)x` | Tries `const`, `static`, `static+const`, `reinterpret`, `reinterpret+const` | Yes | Only if `static_cast` matches | Silently falls back to `reinterpret_cast` or private-base cast |

Use **`static_cast`** for well-defined conversions: numeric narrowing (`static_cast<int>(ratio)`), recovering a typed pointer from `void*`, invoking an `explicit` constructor, or casting a base pointer to a known derived type when you already proved the dynamic type by external invariants. Note that for scoped enumerations (`enum class`), `std::to_underlying(e)` from `<utility>` (C++23) cleanly replaces `static_cast<std::underlying_type_t<E>>(e)`.

Use **`const_cast`** solely to interface with legacy non-const-correct APIs when you know the target object is genuinely mutable, or inside non-const overloads forwarding to a `const` helper (paired with `std::as_const`).

> **Pitfall.** Using `const_cast` to strip `const` and write to an object that was defined `const` (such as `const int x = 1;`) is immediate undefined behavior under `[dcl.type.cv]`, even if the write executes on mutable stack memory.

Use **`dynamic_cast`** when traversing a polymorphic hierarchy (a class with at least one virtual function) and the dynamic type is unknown until runtime—including **cross-casts** between sibling bases in multiple inheritance. Downcasting a pointer yields `nullptr` on mismatch; downcasting a reference throws `std::bad_cast`.

## Why C-style casts and reinterpret_cast hide bugs

The C-style cast `(Target)expr` and function-style cast `Target(expr)` are dangerous because `[expr.cast]` defines them as an ordered fallback chain: `const_cast`, then `static_cast`, then `static_cast` followed by `const_cast`, then `reinterpret_cast`, and finally `reinterpret_cast` followed by `const_cast`. Worse still, `(Target)expr` is explicitly permitted to bypass access control and cast between a derived class and an **inaccessible private or protected base class**, adjusting the pointer offset cleanly where `static_cast` would refuse to compile.

If an include disappears and `Derived` becomes an incomplete forward-declared type, `static_cast<Base*>(d)` fails to compile immediately, whereas `(Base*)d` silently switches from a `static_cast` (which adjusts multiple-inheritance `this` offsets) to a raw `reinterpret_cast` (which leaves the numerical address untouched and corrupts memory).

`reinterpret_cast` itself grants narrow guarantees. Converting `T*` to `U*` and back to `T*` preserves the original pointer value provided `U`'s alignment requirement is no stricter than `T`'s. Actually **dereferencing** that `U*`, however, collides with strict aliasing.

> **Standardese.** Under `[basic.lval]`, reading or writing an object through a glvalue whose type is unrelated to the object's dynamic type—outside cv/signed variations, base subobjects, or `char` / `unsigned char` / `std::byte`—is undefined behavior.

## Safe bit-punning and modern helpers

Inspecting the raw bytes or IEEE-754 representation of a `float` via `*reinterpret_cast<std::uint32_t*>(&f)` violates `[basic.lval]` because no `uint32_t` object exists at `&f`. In C++20 and later, `<bit>` provides `std::bit_cast<To>(from)`, which copies the source object representation into a brand-new `To` object, works in `constexpr` contexts, and requires zero intermediate pointers.

```cpp
#include <bit>
#include <cstdint>
#include <utility>

enum class Mode : std::uint8_t { Fast = 1, Safe = 2 };

constexpr std::uint32_t ieee_bits = std::bit_cast<std::uint32_t>(1.0f);
static_assert(ieee_bits == 0x3f800000u);

struct Base { virtual ~Base() = default; };
struct Derived : Base { int tag = 7; };

void inspect(Base* b, int& mutable_val, Mode m) {
    if (auto* d = dynamic_cast<Derived*>(b)) {
        d->tag = 9;
    }
    const int& ro = std::as_const(mutable_val);
    const_cast<int&>(ro) = 12; // Well-defined: mutable_val is non-const

    auto raw_mode = std::to_underlying(m); // std::uint8_t{1}
    (void)raw_mode;
}
```

When targeting pre-C++20 codebases, `std::memcpy` into a stack-allocated destination object provides the same aliasing-safe semantics as `std::bit_cast`, and modern optimizing compilers fold it into a single register move.

## What to remember

- `const` on an object makes mutation undefined behavior; `const` on a reference or pointer only restricts that access path.
- `volatile` inhibits compiler access elision and reordering for hardware or signal I/O, not data races between threads.
- `[conv.qual]` rejects `T**` to `const T**` to stop non-const pointers from silently aliasing `const` objects; `const T* const*` is the safe conversion.
- Prefer `static_cast`, `const_cast`, `dynamic_cast`, `std::as_const`, `std::to_underlying`, and `std::bit_cast` over C-style casts and `reinterpret_cast` type punning.
