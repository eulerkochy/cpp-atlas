---
title: "constexpr in C++26"
summary: "C++26 lets constant evaluation cast from void*, use placement new, throw and catch exceptions, bind constexpr structured bindings and construct classes with virtual bases. The rule underneath stays the same, though, because nothing may leak out of the evaluation."
track: "cpp26"
minutes: 13
standard:
  - "[expr.const.core]"
  - "[expr.const.const]"
  - "[expr.const.init]"
  - "[dcl.constexpr]"
  - "[dcl.pre]"
  - "[dcl.struct.bind]"
  - "[meta.const.eval]"
  - "[propagation]"
  - "[std.exceptions]"
  - "[library.c]"
  - "[basic.indet]"
cppreference:
  - title: "Constant expressions"
    path: "language/constant_expression"
  - title: "constexpr specifier"
    path: "language/constexpr"
  - title: "static_assert declaration"
    path: "language/static_assert"
  - title: "Structured binding declaration"
    path: "language/structured_binding"
  - title: "std::is_within_lifetime"
    path: "types/is_within_lifetime"
  - title: "new expression (placement new)"
    path: "language/new"
  - title: "Common mathematical functions"
    path: "numeric/math"
prerequisites:
  - "constant-expressions"
  - "object-lifetime-and-storage"
  - "exceptions-and-stack-unwinding"
  - "structured-bindings"
---

## The one idea

C++26 does not change the model of constant evaluation. It removes special cases from it. The evaluator was always an interpreter that tracks every object's type and lifetime, and it rejects anything it cannot check. Each C++26 addition is an operation the interpreter can now check: a `void*` cast back to the right type, a placement new into storage it created, or an exception that is thrown and caught before the evaluation ends.

The rule underneath is unchanged. Whatever the evaluation creates must be gone, or be safely representable, by the time it finishes. Memory from `new` must be freed, exception objects must be destroyed, and the result may not point at anything the program could not name.

This is C++26. The text here follows N5050, the final C++26 draft sent to the international ballot. That ballot closed in October 2026 and was reported as not approved, with contracts at the centre of the dispute, so check the status before you quote it as published ISO C++. GCC 16 implements most of the language parts with `-std=c++26` and differs from the draft in places noted below. Clang 21 implements fewer of them.

> **Mental model.** Constant evaluation is a sandbox with a strict exit check. C++26 adds toys to the sandbox; it does not relax the exit check.

The pre-C++26 rules, including transient allocation and `consteval`, are covered in the constant-expressions topic.

## Type erasure: void* casts and placement new

Until C++23, a cast from `void*` to an object pointer type disqualified an expression outright. That blocked type-erased code such as `std::any`-like storage and `function_ref`-like callbacks. P2738R1 allows the cast when the `void*` is null or points to an object whose type is *similar* to the target, which means the same type up to cv-qualification. Anything else is still not a constant expression, so a wrong-type cast is diagnosed instead of becoming undefined behaviour.

```cpp
constexpr int roundtrip() {
  int x = 42;
  void* p = &x;
  return *static_cast<int*>(p);      // OK since C++26: p points to an int
}
static_assert(roundtrip() == 42);

constexpr int pun() {
  int x = 42;
  void* p = &x;
  return *static_cast<short*>(p);    // not similar: not a constant expression
}
// static_assert(pun() == 42);        // error
```

Placement new followed naturally, in P2747R2. A non-allocating `new (p) T(args)` is allowed when `p` points to an object that the new `T` can *transparently replace*, roughly an object of the same type, and the storage was created within the same evaluation. In practice, that means storage from `std::allocator<T>::allocate` or a local of the same type. You can no longer construct an `int` inside an `unsigned char` buffer, and you cannot touch globals. `std::construct_at`, available since C++20, already covered most uses, but placement new now works in generic code that spells it directly. Both papers bumped `__cpp_constexpr`, and GCC 16 reports `202406L`.

```cpp
#include <memory>
#include <new>

struct S { int v; constexpr S(int x) : v(x) {} };

constexpr int build() {
  std::allocator<S> a;
  S* p = a.allocate(1);
  ::new (p) S(7);          // OK since C++26
  int r = p->v;
  p->~S();
  a.deallocate(p, 1);      // still mandatory: no leaks out of the evaluation
  return r;
}
static_assert(build() == 7);
```

> **Pitfall.** GCC 16 accepts some `void*` casts that the draft rejects. One example is casting a `void*` that points to a `Derived` back to `Base*`, and another is casting a pointer to an array's first element to a pointer to the array. Clang 21 rejects both. Write the cast back to the exact type that was erased.

## Exceptions during constant evaluation

P3068R6 removes the blanket ban on `throw`. An exception may now be thrown, unwound and caught inside a constant evaluation, provided the exception object and every copy made by `std::rethrow_exception` are destroyed before the evaluation ends. If the exception escapes, the expression is not constant, so an uncaught throw is still a compile-time error. The difference is that you can now handle it.

```cpp
#include <optional>
#include <stdexcept>

constexpr int digit(char c) {
  if (c < '0' || c > '9') throw std::invalid_argument("not a digit");
  return c - '0';
}

constexpr std::optional<int> try_digit(char c) {
  try { return digit(c); }
  catch (const std::invalid_argument&) { return std::nullopt; }
}

static_assert(try_digit('7') == 7);
static_assert(!try_digit('x'));            // caught during constant evaluation
// constexpr int bad = digit('x');         // error: exception escapes
```

The library followed. `std::exception` and its `what()`, `bad_alloc`, `bad_cast` and the other language-support exceptions became constexpr in P3068. P3378R2 did the same for the `<stdexcept>` classes and for `bad_optional_access`, `bad_variant_access` and `bad_expected_access`. So `vector::at` out of range now throws a catchable `out_of_range` at compile time. `make_exception_ptr` and `rethrow_exception` are constexpr as well, but an `exception_ptr` cannot be stored in a `constexpr` variable, because the exception object would outlive the evaluation.

Two functions were taken back. P3068 had made `std::current_exception` and `std::uncaught_exceptions` constexpr. Both depend on the program's global exception state, which a constant evaluation could observe in surprising places. P3842R2 removed `constexpr` from both before C++26 shipped, and N5050 reflects that. The rethrowing form `throw;` still works when the handled exception was created inside the evaluation.

> **Standardese.** [expr.const.core] now disqualifies "a construction of an exception object, unless the exception object and all of its implicit copies created by invocations of `std::current_exception` or `std::rethrow_exception` are destroyed within the evaluation". It also disqualifies a `dynamic_cast`, `typeid` or new-expression that would throw where no definition of the exception type is reachable.

GCC 16 implements all of this. It defines `__cpp_constexpr_exceptions` as `202411L` and `__cpp_lib_constexpr_exceptions` as `202502L`, and it already rejects `current_exception` in a constant expression. Clang 21 does not support constexpr exceptions.

## constexpr structured bindings and references to locals

P2686R5 makes two related changes. First, a structured binding declaration may be `constexpr` or `constinit`, and the specifier goes to the hidden variable `e` that holds the initializer. Second, a `constexpr` reference or pointer may refer to an automatic variable, as long as it is used inside the same function invocation. The draft calls such an object *constexpr-referenceable*. A reference that could escape, such as a `static constexpr` one or a use inside a nested lambda, is still rejected.

```cpp
#include <utility>

struct P { int x, y; };
constexpr auto [a, b] = P{1, 2};          // OK since C++26
static_assert(a + b == 3);
constexpr auto [c, d] = std::pair{3, 4};  // tuple-like, namespace scope
static_assert(c * d == 12);

void f() {
  constexpr auto [u, v] = P{5, 6};        // OK: block scope, aggregate
  static_assert(u < v);
  int x = 0;
  (void)x;
  // constexpr int& rx = x;               // OK in C++26: same function
  // static constexpr int& sx = x;        // error: could escape the invocation
}
```

The structured-binding name is treated as the member or element access on `e` that it stands for. A binding to a `mutable` member therefore cannot be read in a constant expression, even though the declaration itself is fine.

> **Pitfall.** GCC 16 implements only half of P2686. It accepts `constexpr` structured bindings for arrays and aggregates, but it still rejects `constexpr` references and pointers to automatic variables, including `constexpr const int& r = k;` where `k` is itself `constexpr`. As a result, it also rejects a block-scope `constexpr auto [p, q] = std::pair{...}`, because tuple-like bindings are references. Clang 21 implements neither part.

## Virtual bases, static_assert messages and is_within_lifetime

P3533R2 removes the rule that a class with a virtual base cannot have a constexpr constructor or destructor. In N5050, the only remaining condition for a function to be *constexpr-suitable* is that it is not a coroutine. The interpreter already knows the dynamic type of every object it creates, so a virtual base costs it nothing.

```cpp
struct Base { int v; constexpr Base(int x) : v(x) {} };
struct L : virtual Base { constexpr L() : Base(1) {} };
struct R : virtual Base { constexpr R() : Base(2) {} };
struct Diamond : L, R { constexpr Diamond() : Base(3) {} };

constexpr int share() {
  Diamond d;
  L& l = d;
  R& r = d;
  return l.v * 10 + r.v;   // one shared Base, built by Diamond
}
static_assert(share() == 33);  // C++26; GCC 16 accepts, Clang 21 rejects
```

P2741R3 lets the second argument of `static_assert` be any constant expression with `size()` and `data()` members, such as a `std::string` built at compile time, instead of only a string literal. The message is used only when the assertion fails. In that case `size()` must be a converted constant expression of type `std::size_t`, every character must be a constant, and the text is that many code units of the ordinary literal encoding. When the condition is true, the message is an unevaluated operand.

```cpp
#include <cstddef>

struct Msg {
  constexpr std::size_t size() const { return 5; }
  constexpr const char* data() const { return "hello world"; }
};
static_assert(sizeof(char) == 1, Msg{});      // passes; message unused
// static_assert(sizeof(char) == 2, Msg{});   // error: static assertion failed: hello
```

P2641R4 adds `std::is_within_lifetime(p)` to `<type_traits>`. It is `consteval`, and it returns whether `p` points to an object within its lifetime. The motivating use is asking which union member is active without reading it. An `optional<bool>`-like type can store a sentinel in a `char` member and still answer `has_value()` during constant evaluation, where reading the inactive member would be disqualified.

```cpp
#include <type_traits>

struct OptBool {
  union { bool b; char c; };
  constexpr OptBool() : c(2) {}
  constexpr OptBool(bool x) : b(x) {}
  constexpr bool has_value() const {
    if consteval { return std::is_within_lifetime(&b); }
    else { return c != 2; }   // at run time, bytes are all we have
  }
};
```

GCC 16 implements virtual bases and string-like messages, but libstdc++ 16 has no `std::is_within_lifetime`, so the last example does not compile there. Clang 21 has only the `__builtin_is_within_lifetime` builtin, which libc++ 21 does not yet wrap.

## The library catches up

N5050 marks far more of the library constexpr than C++23 did:

- **Containers and adaptors** (P3372R3): `deque`, `list`, `forward_list`, `map`, `set`, the unordered containers and their multi variants, plus `queue`, `stack` and `priority_queue`. `inplace_vector` is constexpr by design.
- **Algorithms**: `stable_sort`, `stable_partition` and `inplace_merge` (P2562R1).
- **`<cmath>`** (P1383R2): nearly everything, including `sin`, `exp`, `pow` and `sqrt`. `rint`, `nearbyint` and the rounding-mode-dependent conversions are excluded, as are `nan` and the special functions.
- **Atomics** (P3309R3): `std::atomic` and `std::atomic_ref`, which behave as ordinary objects during constant evaluation.
- **Formatting** (P3391R2): `std::format`, `format_to` and the integral `to_string` overloads, but not floating-point or pointer formatting.

For `<cmath>`, [library.c] sets the boundary. A call is a non-constant library call if it raises a floating-point exception other than `FE_INEXACT`. Rounding is fine, so `std::sqrt(2.0)` is a constant. `std::sqrt(-1.0)` raises `FE_INVALID` and `std::log(0.0)` raises `FE_DIVBYZERO`, so neither is a constant, even though both return a value at run time.

Implementations lag here. GCC 16 provides constexpr `stable_sort` and `inplace_vector`, and it has folded `<cmath>` calls as a GCC extension for years, but it defines no `__cpp_lib_constexpr_cmath`. It rejects constexpr `map`, `set`, `list`, `deque`, `unordered_map`, `priority_queue`, `atomic`, `format` and `to_string`. libc++ 21 offers constexpr `list` and `priority_queue` but not the others.

## What is still impossible

- **Escaping allocations.** `constexpr std::vector<int> v{1, 2, 3};` is still ill-formed, because the heap storage would outlive the evaluation. A `constexpr std::string` holding a short literal compiles on both libstdc++ and libc++, but only because of the small-string optimisation, which the standard does not promise.
- **Escaping exceptions**, and any `exception_ptr` that would outlive the evaluation.
- **`reinterpret_cast`**, wrong-type `void*` casts, reading an inactive union member, and `std::bit_cast` involving pointers.
- **`goto`**, `asm`, `va_arg`, `co_await` and `co_yield`, and a call to a non-constexpr function, all of which are disqualified when evaluated.
- **Undefined and erroneous behaviour.** In C++26, an uninitialized automatic variable holds an *erroneous value*, and reading it at run time is erroneous behaviour rather than undefined behaviour. In constant evaluation, erroneous behaviour disqualifies the expression just as undefined behaviour does, and the result of a constant expression may not contain an erroneous value. A variable marked `[[indeterminate]]` has an indeterminate value instead, and reading it is also rejected. The erroneous-behaviour-and-cpp26-language-changes topic covers the run-time side.

```cpp
constexpr int fine() { int x; x = 3; return x; }  // OK: written before read
static_assert(fine() == 3);
// constexpr int bad() { int x; return x; }       // erroneous read: not constant
```

> **Pitfall.** "It compiled as constexpr on my compiler" proves less than it seems. GCC folds `<cmath>` in any mode, and SSO lets short `constexpr` strings through. For portable code, check the `__cpp_lib_constexpr_*` macros, not one compiler's behaviour.

## What to remember

- The sandbox rule is unchanged. Allocations, exception objects and pointers to locals must not escape a constant evaluation.
- A `void*` may be cast back only to a type similar to the object it points to (P2738R1). Placement new is allowed into storage created by the same evaluation (P2747R2).
- `throw`, `try` and `catch` work at compile time (P3068R6), and the `<stdexcept>` types are constexpr (P3378R2). An escaping exception is still an error. `current_exception` and `uncaught_exceptions` are not constexpr (P3842R2).
- Structured bindings may be `constexpr`, and `constexpr` references may refer to locals of the same function invocation (P2686R5). GCC 16 implements only the first part.
- Constexpr constructors now work with virtual bases (P3533R2). `static_assert` accepts computed messages (P2741R3), and those messages are unevaluated when the assertion passes.
- `std::is_within_lifetime` is `consteval` and detects the active union member (P2641R4). Neither GCC 16 nor libc++ 21 ships it.
- Most of `<cmath>` is constexpr, unless the call raises a floating-point exception other than `FE_INEXACT`. Node-based containers, atomics and `format` are constexpr in the draft, but GCC 16 does not implement them yet.
- Erroneous behaviour, like undefined behaviour, disqualifies a constant expression.
