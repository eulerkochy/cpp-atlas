---
title: "noexcept"
summary: "The noexcept specifier is a promise that a function will not let an exception escape, enforced at run time by std::terminate rather than at compile time. The noexcept operator asks whether an expression could throw, and since C++17 the promise is part of the function type."
track: "errors"
minutes: 12
standard:
  - "[except.spec]"
  - "[expr.unary.noexcept]"
  - "[conv.fctptr]"
  - "[except.terminate]"
  - "[class.dtor]"
  - "[dcl.fct.def.default]"
  - "[res.on.exception.handling]"
cppreference:
  - title: "noexcept specifier"
    path: "language/noexcept_spec"
  - title: "noexcept operator"
    path: "language/noexcept"
  - title: "Dynamic exception specification"
    path: "language/except_spec"
  - title: "std::move_if_noexcept"
    path: "utility/move_if_noexcept"
  - title: "std::terminate"
    path: "error/terminate"
prerequisites:
  - "exceptions-and-stack-unwinding"
  - "copy-and-move"
---

## The one idea

`noexcept` is not a compile-time check. Marking a function `noexcept` does not make the compiler prove that nothing inside it throws. It changes what happens when something does: instead of propagating, the exception reaches the function boundary and `std::terminate` is called.

What makes the promise valuable is that other code can **ask about it at compile time**. The `noexcept` operator turns "can this expression throw?" into a `bool` constant, and the standard library uses that answer to choose faster algorithms, most famously moving rather than copying when a `std::vector` grows.

> **Mental model.** `noexcept` is a contract written in the type system and enforced by termination. Callers read it statically; the runtime enforces it only by ending the program.

## The specifier and the operator

The specifier comes in three spellings. `noexcept` and `noexcept(true)` mean the function has a **non-throwing** exception specification. `noexcept(false)`, or no specifier at all for most functions, means it is **potentially throwing**. The argument must be a contextually converted constant expression of type `bool`, so it may depend on template parameters.

The operator, `noexcept(expr)`, is an unevaluated operand like `sizeof`. It yields `false` if the expression is potentially throwing: if it calls any function, constructor, conversion or destructor that is potentially throwing, or contains a `throw`, a `dynamic_cast` to a reference type that needs a run-time check, or a `typeid` applied to a dereferenced polymorphic glvalue. It yields `true` otherwise. Nothing in the operand runs.

```cpp
int calls = 0;
int count() { return ++calls; }

static_assert(!noexcept(count()));  // count is potentially throwing
static_assert(noexcept(1 + 2));     // no call, cannot throw
static_assert(!noexcept(new int));  // operator new may throw bad_alloc

struct Leaky { ~Leaky() noexcept(false); };
static_assert(!noexcept(Leaky()));  // the temporary's destructor counts
// calls is still 0: the operand was never evaluated
```

The two are combined in the **conditional noexcept** idiom, where the doubled keyword is not a typo. The outer `noexcept` is the specifier, and the inner one is the operator computing its argument.

```cpp
#include <type_traits>
#include <utility>

template <class T>
struct Box {
  T value;
  Box(Box&& other) noexcept(noexcept(T(std::move(other.value))))
      : value(std::move(other.value)) {}

  void swap(Box& o) noexcept(std::is_nothrow_swappable_v<T>) {
    using std::swap;
    swap(value, o.value);
  }
};
```

Traits such as `std::is_nothrow_move_constructible_v` and `std::is_nothrow_invocable_v` are usually clearer than spelling out the expression, and they are implemented with the operator.

## What happens when a noexcept function throws

If an exception tries to leave a function with a non-throwing specification, `std::terminate` is called. The exception is not propagated, and no handler outside the function ever sees it. Handlers inside the function work normally; the boundary only matters for exceptions that would cross it.

> **Standardese.** [except.terminate] makes it implementation-defined whether the stack is unwound, unwound partially, or not unwound at all before `std::terminate` is called in this case. That latitude is what lets compilers omit unwind tables for `noexcept` functions.

The partial case is real. With GCC 16 and Clang 21, the inner frame's locals are destroyed while searching upward, but the `noexcept` frame's own locals are not, because the search stops at its boundary.

```cpp
#include <cstdio>
#include <stdexcept>

struct Note { const char* n; ~Note() { std::fprintf(stderr, "~%s\n", n); } };

void inner() { Note a{"inner"}; throw std::runtime_error("x"); }
void outer() noexcept { Note b{"outer"}; inner(); }

int main() {
  try { outer(); } catch (...) { std::puts("never reached"); }
}
// std::terminate. GCC and Clang print ~inner but not ~outer;
// another implementation could print both or neither.
```

Compilers warn when they can see a `throw` that will always reach a `noexcept` boundary, but the rule is not enforced at compile time, and a call to a potentially-throwing function from a `noexcept` function is always well-formed.

## Implicit noexcept

You get non-throwing specifications without writing them in several places.

- **Destructors.** A destructor declared without a specifier, whether user-written or implicit, has the specification its implicit version would have, which is non-throwing unless some base or member has a potentially-throwing destructor. A deallocation function without a specifier is non-throwing as well.
- **Implicitly declared and defaulted special members.** A default constructor, copy or move constructor, copy or move assignment, or comparison that is implicitly declared or defaulted on its first declaration is non-throwing exactly when every function it would call is non-throwing.
- **Explicitly defaulted with a different specifier.** Since C++20, writing `S(S&&) noexcept(false) = default;` is allowed and the written specification wins. Before C++20, a mismatch on a first declaration made the function deleted.

```cpp
#include <string>
#include <type_traits>

struct Plain { std::string s; };
static_assert(std::is_nothrow_move_constructible_v<Plain>);    // string's move is noexcept
static_assert(!std::is_nothrow_copy_constructible_v<Plain>);   // copying may allocate
static_assert(std::is_nothrow_destructible_v<Plain>);

struct Throws { ~Throws() noexcept(false); };
struct Holds { Throws t; };
static_assert(!std::is_nothrow_destructible_v<Holds>);         // inherited from the member
```

> **Pitfall.** A destructor you write yourself is still implicitly `noexcept`. A `throw` in it, even one meant to report a failed flush, calls `std::terminate` unless you write `noexcept(false)`, and even then it terminates if the destructor runs during unwinding.

## Why move constructors should be noexcept

When `std::vector` reallocates, it must relocate existing elements to the new buffer while keeping the strong guarantee for `push_back`: if something throws, the original vector is untouched. Moving elements destroys that option, because a move that throws halfway leaves some elements moved-from in the old buffer. So the library uses `std::move_if_noexcept`, which moves only when the move constructor is non-throwing or the type cannot be copied, and copies otherwise.

```cpp
#include <cstdio>
#include <vector>

struct Slow {
  Slow() = default;
  Slow(const Slow&) { std::puts("copy"); }
  Slow(Slow&&) { std::puts("move"); }           // potentially throwing
};
struct Fast {
  Fast() = default;
  Fast(const Fast&) { std::puts("copy"); }
  Fast(Fast&&) noexcept { std::puts("move"); }
};

int main() {
  std::vector<Slow> a(1); a.reserve(2);         // prints copy
  std::vector<Fast> b(1); b.reserve(2);         // prints move
}
```

A move constructor that cannot actually throw, but is not declared `noexcept`, silently turns every reallocation into a deep copy. A defaulted move constructor gets this right automatically when all members have non-throwing moves; a hand-written one needs the keyword.

## noexcept in the type system

Since C++17, the exception specification is part of the function type: `void() noexcept` and `void()` are distinct types, as are pointers to them. A **function pointer conversion** goes one way only: a pointer to a `noexcept` function converts to a pointer to the potentially-throwing type, never the reverse.

```cpp
void safe() noexcept;
void risky();

void (*p)() = safe;               // OK: drops the promise
// void (*q)() noexcept = risky;  // ill-formed: would invent a promise

struct S { void m() noexcept; };
void (S::*pm)() = &S::m;          // OK: same rule for member pointers

template <bool B> constexpr bool is_nothrow(void (*)() noexcept(B)) { return B; }
static_assert(is_nothrow(safe) && !is_nothrow(risky));  // B is deducible
```

You still cannot overload on the specification: declaring `void f();` and `void f() noexcept;` is an ill-formed redeclaration, not an overload. Every declaration of a function must agree on its specification, apart from the implicit cases above.

Virtual functions follow the same direction. If a virtual function is non-throwing, every overrider must be non-throwing too, since callers through the base have been promised it. An overrider may add `noexcept` to a potentially-throwing base function.

Lambdas take the specifier after the parameter list, and a captureless `noexcept` lambda converts to a `noexcept` function pointer.

## The road from throw() to noexcept

C++98 had **dynamic exception specifications**, `throw(A, B)`, which listed permitted exception types and called `std::unexpected` at run time if another escaped. They cost run-time checks, did not compose with templates, and nobody could write them correctly for generic code. C++11 deprecated them and added `noexcept`. C++17 removed `throw(A, B)` and `std::unexpected`, and kept `throw()` only as a deprecated synonym for `noexcept(true)`. C++20 removed `throw()` as well, although GCC 16 and Clang 21 still accept it in C++20 and C++23 modes as an extension.

The standard library is deliberately sparing with `noexcept`. Functions with preconditions, such as `std::vector::operator[]`, are not specified `noexcept`, so that a checking implementation could report a violation by throwing. Implementations may add `noexcept` to non-virtual library functions, and libstdc++ and libc++ both mark `operator[]` that way, so `noexcept(v[0])` is `true` in practice and not guaranteed by the standard.

### When to write it

The promise is easy to add and hard to take back. Once callers have written `static_assert(noexcept(f()))`, or chosen an algorithm because a trait said "nothrow", removing the keyword is a breaking change, even if the function's behaviour on success is unchanged. That argues for writing `noexcept` deliberately, in a few places where it pays for itself.

- **Move constructors and move assignment** of types that own resources, because containers and algorithms branch on them.
- **`swap`**, because copy-and-swap and many algorithms are only safe when it cannot fail.
- **Destructors and deallocation** are already non-throwing by default; leave them that way.
- **Hash functions and simple accessors** that genuinely cannot fail, where the promise documents a fact rather than a hope.

Everywhere else, the default of potentially throwing is the honest one. A function that allocates, calls user callbacks, or has preconditions that a future version might want to check by throwing should stay without the keyword, following the same reasoning the library applies to itself. In generic code, prefer a conditional specification computed from the operations you call, so that the promise is exactly as strong as your element types allow and no stronger.

## What to remember

- `noexcept` promises, it does not prove; an escaping exception calls `std::terminate`.
- Whether the stack unwinds before that termination is implementation-defined, and may be partial.
- The `noexcept` operator is unevaluated and asks whether an expression is potentially throwing, including temporaries' destructors and `new`.
- `noexcept(noexcept(expr))` is the conditional idiom; prefer `is_nothrow_*` traits when they fit.
- Destructors and implicit or defaulted special members are `noexcept` whenever what they call is.
- Since C++17 `noexcept` is part of the function type; pointers may drop it but not gain it, and overriders of a `noexcept` virtual must keep it.
- Non-`noexcept` move constructors make `std::vector` copy on reallocation.
- Dynamic exception specifications are gone: `throw(T)` in C++17, `throw()` in C++20.
