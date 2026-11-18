---
title: "SFINAE and Concepts"
summary: "Trace how substitution failures prune candidates silently during C++17 template deduction, and how C++20 concepts replace enable_if with named atomic constraints and subsumption."
track: templates
minutes: 10
standard:
  - "[temp.deduct]"
  - "[temp.constr.decl]"
  - "[temp.constr.atomic]"
  - "[temp.constr.order]"
  - "[expr.prim.req]"
  - "[over.match.viable]"
  - "[meta.trans.other]"
cppreference:
  - title: "SFINAE"
    path: "language/sfinae"
  - title: "Constraints and concepts"
    path: "language/constraints"
  - title: "requires expression"
    path: "language/requires"
  - title: "std::enable_if"
    path: "types/enable_if"
  - title: "std::void_t"
    path: "types/void_t"
  - title: "Concepts library"
    path: "concepts"
  - title: "Overload resolution"
    path: "language/overload_resolution"
prerequisites:
  - overload-resolution
  - type-deduction-auto-decltype
---

Overload resolution across function templates requires a way to tell the compiler which type combinations a template actually supports. Before C++20, authors relied on **SFINAE** ("Substitution Failure Is Not An Error") to sabotage template signatures intentionally when types did not fit; C++20 replaced those tricks with **concepts**, turning constraints into first-class compile-time predicates with formal partial ordering.

## SFINAE and the immediate context boundary

When overload resolution tests a function template candidate, it substitutes deduced or explicit template arguments into the template's **immediate context**—its template parameter list, function parameter types, return type, `explicit(expr)`, and `noexcept(expr)` (`[temp.deduct]`). If substituting `T = int` makes the signature invalid (such as forming `int::iterator` or dividing by zero in a constant expression inside the signature), the compiler does **not** emit a compile error. Instead, it drops that candidate silently from the viable overload set.

Crucially, SFINAE stops at the immediate context boundary. Any error triggered while instantiating a helper **class template body** or the function's own body is a **hard error**, even if that instantiation began during signature substitution. For example, checking `typename Wrapper<T>::type` only invokes SFINAE if `Wrapper<T>` fails directly on `::type` lookup; if instantiating `Wrapper<T>` itself fails inside its member declarations, compilation aborts immediately.

## Pre-C++20 idioms: enable_if, void_t, and expression SFINAE

Three pre-C++20 idioms operationalized SFINAE across libraries:

- **`std::enable_if_t<Cond, T>`:** Defined only when `Cond` is `true` (`[meta.trans.other]`). When `Cond` is `false`, referencing `enable_if<false>::type` fails substitution cleanly.
- **`std::void_t<Args...>`:** Maps any pack of valid types to `void`, powering trait detection via partial class template specialization.
- **Expression SFINAE and `if constexpr`:** Placing `decltype(expr, void())` in a trailing return type tests valid expressions without calling them, while C++17 `if constexpr` discards untaken branches inside a single function body.

```cpp
#include <type_traits>
#include <utility>
#include <vector>

template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
int classify(T) { return 1; }

template <class T, std::enable_if_t<!std::is_integral_v<T>, int> = 0>
int classify(T) { return 2; }

template <class, class = void>
struct has_size : std::false_type {};

template <class T>
struct has_size<T, std::void_t<decltype(std::declval<const T&>().size())>>
    : std::true_type {};

static_assert(has_size<std::vector<int>>::value);
static_assert(!has_size<int>::value);
```

> **Pitfall.** Never write `template <class T, class = std::enable_if_t<Cond>> void f(T);` to distinguish two overloads. Default template arguments are **not** part of a function template's signature, so two overloads differing only in their default `enable_if_t` type redeclare the exact same function template and fail to compile. Use a non-type template parameter (`std::enable_if_t<Cond, int> = 0`) or constrain the return type instead.

## C++20 constraints, concepts, and requires-expressions

C++20 concepts move constraining predicates into explicit boolean compile-time clauses checked **before** overload conversion ranking (`[over.match.viable]`), producing readable diagnostics and eliminating manual mutual-exclusion flags (`!CondA && CondB`).

A template accepts constraints in four equivalent syntactic positions: constrained template-head parameters (`template <std::integral T>`), a `requires`-clause after the template parameter list, a trailing `requires`-clause after the function declarator (essential for constraining non-template member functions of class templates without turning them into templates), or abbreviated function templates (`void f(std::integral auto x)`).

A `requires`-expression (`[expr.prim.req]`) lets a concept or `requires`-clause test compile-time syntax directly using four kinds of requirements:

| Requirement kind | Syntax example | What it verifies |
| --- | --- | --- |
| Simple requirement | `a + b;` | Expression is well-formed (unevaluated) |
| Type requirement | `typename T::value_type;` | Nested type or specialization exists |
| Compound requirement | `{ c.size() } noexcept -> std::convertible_to<std::size_t>;` | Expression compiles, optional `noexcept`, return satisfies concept |
| Nested requirement | `requires !std::is_pointer_v<T>;` | Constant boolean expression evaluates to `true` |

```cpp
#include <concepts>
#include <cstddef>
#include <type_traits>

template <class C>
concept SizedContainer = requires(const C& c) {
    typename C::value_type;
    c.begin();
    { c.size() } noexcept -> std::convertible_to<std::size_t>;
    requires !std::is_pointer_v<C>;
};
```

Writing `requires requires(T x) { ... }` directly on a function combines two separate grammar tokens: the first `requires` starts a `requires`-clause (expecting a boolean constant expression), while the second starts a `requires`-expression that evaluates to `bool`. Factor reusable predicates into named `concept` declarations instead of scattering anonymous `requires requires` clauses across signatures.

> **Pitfall.** Inside a `requires`-expression, omitting the nested `requires` keyword turns a boolean trait check into a simple requirement! Writing `std::same_as<T, int>;` without a leading `requires` only tests whether the expression `std::same_as<T, int>` compiles—and since it validly produces a `bool` (even `false`), the requirement passes for `double` too.

## Constraint normalization and subsumption

SFINAE cannot rank overlapping conditions—if two overloads both accept `int`, overload resolution fails with ambiguity unless you explicitly negate one condition inside the other. Concepts solve that via **subsumption** (`[temp.constr.order]`): if two constrained candidates match equally well on parameter conversions, the **more constrained** candidate wins automatically.

> **Mental model.** Subsumption does not inspect runtime semantics or algebra; it treats named concepts as reusable building blocks. Candidate `P` subsumes candidate `Q` only when every atomic constraint in `Q` appears inside `P` from the exact same named concept declaration.

During comparison, the compiler normalizes each candidate's constraint expression into conjunctions (`&&`) and disjunctions (`||`) of **atomic constraints** (`[temp.constr.atomic]`). An atomic constraint is identified by both its source-code expression location and its template parameter mapping—meaning two inline `sizeof(T) >= 4` expressions in separate `requires` clauses create two distinct atomic constraints that **never** subsume one another!

```cpp
#include <concepts>
#include <type_traits>

template <class T>
concept Integral = std::integral<T>;

template <class T>
concept SignedIntegral = Integral<T> && std::is_signed_v<T>;

constexpr int pick(Integral auto) { return 1; }
constexpr int pick(SignedIntegral auto) { return 2; } // subsumes Integral!

static_assert(pick(42u) == 1);
static_assert(pick(42) == 2);
```

> **Standardese.** Under `[temp.constr.atomic]`, only concept-ids expand recursively during constraint normalization; constant expressions involving type traits like `std::is_signed_v<T> && std::is_integral_v<T>` are opaque single atoms unless composed from named `concept` declarations.

Because `SignedIntegral<T>` expands directly to the shared named concept `Integral<T>` conjoined with `std::is_signed_v<T>`, `pick(SignedIntegral auto)` strictly subsumes `pick(Integral auto)` and resolves `pick(42)` without ambiguity. Note also that since C++23 (`P2593R1`), `static_assert(false)` inside an uninstantiated `if constexpr` branch or template body is valid until instantiated, complementing concepts for clean compile-time error messages.

## What to remember

- SFINAE applies only within the immediate context of template substitution; errors inside instantiated class or function bodies remain hard errors.
- Avoid `class = std::enable_if_t<...>` as a default template argument for overloading—it creates duplicate signatures; use non-type template parameters or constraints instead.
- Inside a `requires`-expression, expressions are unevaluated; always prefix boolean predicate assertions with nested `requires` so you check truth value, not mere syntactic validity.
- Factor shared predicates into named `concept` definitions—subsumption matches normalized atomic constraints by declaration identity, not boolean equivalence.
- Constraint satisfaction filters candidates before conversion ranking, and a more constrained candidate beats a less constrained one cleanly without ambiguity.
