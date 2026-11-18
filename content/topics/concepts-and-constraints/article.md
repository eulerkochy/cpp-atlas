---
title: "Concepts and constraints"
summary: "A concept is a named compile-time predicate on template arguments, and a constraint is a predicate a template must satisfy before it can be used. The compiler breaks constraints into atomic pieces, and that decomposition, not the meaning of the expressions, decides which overload is more constrained."
track: "templates"
minutes: 13
standard:
  - "[temp.concept]"
  - "[temp.constr.constr]"
  - "[temp.constr.atomic]"
  - "[temp.constr.decl]"
  - "[temp.constr.normal]"
  - "[temp.constr.order]"
  - "[expr.prim.req]"
  - "[dcl.fct]"
  - "[res.on.requirements]"
cppreference:
  - title: "Constraints and concepts"
    path: "language/constraints"
  - title: "Requires expression"
    path: "language/requires"
  - title: "Concepts library"
    path: "concepts"
  - title: "Placeholder type specifiers"
    path: "language/auto"
  - title: "Function template (abbreviated function templates)"
    path: "language/function_template"
prerequisites:
  - "sfinae"
  - "template-argument-deduction"
---

## The one idea

A constraint is a compile-time boolean condition attached to a template. After template arguments are deduced and substituted, the constraint is checked; if it is not satisfied, the template is not a viable candidate. A concept is a named, reusable constraint: `template <class T> concept C = expression;`.

That much is SFINAE with better spelling. The new part is ordering. When two candidates are otherwise equally good, the compiler prefers the one whose constraints *subsume* the other's. To decide subsumption it does not reason about what your expressions mean. It normalizes each constraint into a tree of conjunctions and disjunctions of **atomic constraints**, and compares atoms by identity: the same expression written at the same place in the source.

> **Mental model.** Constraints are checked by evaluation and ordered by structure. Satisfaction asks whether each atom is valid and true for these arguments. Subsumption asks whether one tree of atoms logically implies the other, treating atoms as opaque symbols that are equal only when they come from the same spot in the source.

## Concepts and requires-clauses

A concept definition is a template whose body is a constraint expression. A concept cannot be constrained itself, cannot be explicitly specialized, and cannot refer to itself. Naming one, as in `std::integral<int>`, is a prvalue of type `bool`, so concepts work in `static_assert` and `if constexpr` too.

Constraints attach to a template in four spellings, which can be combined:

```cpp
#include <concepts>

template <std::integral T> void a(T);                 // type-constraint
template <class T> requires std::integral<T> void b(T); // requires-clause
template <class T> void c(T) requires std::integral<T>; // trailing requires-clause
void d(std::integral auto);                             // constrained placeholder
```

A requires-clause has a deliberately narrow grammar: its operands must be primary expressions, such as a concept-id, a literal, a name, or anything in parentheses, joined by `&&` and `||`. That keeps a trailing clause from swallowing what follows it, and it surprises people who write arithmetic.

```cpp
// template <class T> requires sizeof(T) > 4 void f(T);  // error: needs parentheses
template <class T> requires (sizeof(T) > 4) void f(T);    // OK
```

## Requires-expressions: four kinds of requirement

A requires-expression is a `bool` prvalue that is true when every requirement in its body is valid for the given arguments. It can introduce parameters, which are never evaluated and exist only to write expressions with.

```cpp
#include <concepts>
#include <cstddef>
#include <type_traits>

template <class T>
concept Container = requires(T c, const T cc) {
  typename T::value_type;                               // type requirement
  c.clear();                                            // simple requirement
  { cc.size() } noexcept -> std::same_as<std::size_t>;  // compound requirement
  requires std::is_default_constructible_v<T>;          // nested requirement
};
```

A **simple** requirement asserts that an expression is valid. A **type** requirement asserts that a type can be named. A **compound** requirement asserts validity, optionally that the expression is `noexcept`, and optionally a return-type requirement: `-> C<Args...>` means `C<decltype((e)), Args...>` is satisfied. A **nested** requirement is the only one that checks a value: `requires E;` evaluates the constant expression `E`.

> **Pitfall.** A simple requirement checks that an expression compiles, not that it is true. `requires { sizeof(T) > 4; }` is satisfied by `char`, because `sizeof(char) > 4` is a perfectly valid expression whose value is `false`. To test the value, write a nested requirement, `requires { requires sizeof(T) > 4; }`, or just the expression `sizeof(T) > 4` itself.

Compound requirements see the expression's value category through `decltype((e))`. For `struct P { int x; }`, the requirement `{ p.x } -> std::same_as<int>` is not satisfied, because `p.x` is an lvalue and the type checked is `int&`. Use `std::convertible_to<int>` or `std::same_as<int&>` depending on what you mean.

Because a requires-expression is an expression, it can appear directly in a requires-clause, which produces the doubled keyword `requires requires`. The first introduces the clause, the second begins the expression. It is fine for a one-off check; give the condition a name once it appears twice.

```cpp
template <class T>
  requires requires(T a) { a + a; }
T twice(T a) { return a + a; }
```

## Atomic constraints and normalization

Normalization rewrites a constraint into conjunctions and disjunctions of atomic constraints. Only `&&` and `||` at the top level of a constraint expression, possibly inside parentheses, are logical operators here. A concept-id is replaced by its definition, with arguments substituted into it. Every other expression is an atom, and that includes `!C<T>`, `C<T> == true`, and `bool(A<T> && B<T>)`.

Each atom is checked by substituting the template arguments. If substitution produces an invalid type or expression, the atom is not satisfied, which is how a disjunction like `std::is_integral_v<T> || (T::value > 0)` works for `int`: the left side is true, so the right side is never substituted. If substitution succeeds, the expression must be a constant expression of type exactly `bool`. No conversion is applied, so `requires (T::value)` with an `int` member is not merely unsatisfied; the program is ill-formed.

> **Standardese.** [temp.constr.atomic] says an atomic constraint whose substitution fails is not satisfied, that a successful substitution must yield a constant expression of type `bool`, and that if the satisfaction result for identical atomic constraints and arguments differs at different points in the program, the program is ill-formed, no diagnostic required. Declaring a function that a requires-expression looks for, after the concept was already checked, falls into that last trap.

## Subsumption and overload ordering

When overload resolution cannot otherwise choose between two function templates with equivalent template parameter lists and parameter types, it prefers the more constrained one. Constraint P subsumes Q if, after normalization, every way of making P true also makes Q true, judged atom by atom. The standard library's concepts are built for this: `std::signed_integral<T>` is defined as `std::integral<T> && std::is_signed_v<T>`, so it subsumes `std::integral<T>`.

```cpp
#include <concepts>
#include <cstdio>

template <std::integral T> void f(T) { std::puts("integral"); }
template <std::signed_integral T> void f(T) { std::puts("signed_integral"); }

void demo() {
  f(1);   // signed_integral: both viable, the second subsumes the first
  f(1u);  // integral: the second is not satisfied
}
```

Identity is the whole game. Two atoms are identical only if they are the same expression *in the source* and their arguments map identically. Writing the same text twice in two different concepts creates two different atoms.

```cpp
#include <type_traits>

template <class T> concept Integral = std::is_integral_v<T>;
template <class T> concept Int32bad = std::is_integral_v<T> && sizeof(T) == 4;
template <class T> concept Int32 = Integral<T> && sizeof(T) == 4;

template <Integral T> int g(T) { return 1; }
template <Int32 T> int g(T) { return 2; }
// With Int32bad in place of Int32, g(0) would be ambiguous: its
// is_integral_v<T> atom is a different atom from Integral's.
```

The same reasoning explains why negation is awkward. `!Integral<T>` is a single opaque atom, not "the negation of `Integral`", so it never takes part in implication with `Integral<T>`. Mutually exclusive overloads written as `requires C<T>` and `requires (!C<T>)` work because only one is ever satisfied, not because either subsumes the other.

## Constrained auto and abbreviated templates

A placeholder can carry a type-constraint, and C++20 lets function parameters use placeholders, which makes the function an abbreviated function template. Each `auto` parameter invents its own template parameter, so `void f(auto a, auto b)` accepts two unrelated types.

```cpp
#include <concepts>

void take(std::convertible_to<long> auto x);  // means: template <class T>
                                              // requires std::convertible_to<T, long>
void use() {
  std::integral auto n = 2;          // deduce int, then check std::integral<int>
  // std::integral auto m = 2.0;     // error: deduced double does not satisfy it
  (void)n;
}
```

The deduced type is always inserted as the *first* argument of the concept, so `std::convertible_to<long> auto` checks `std::convertible_to<T, long>`. The same constrained placeholder works for variables, return types and `decltype(auto)`, where deduction happens first and the constraint is checked on the result.

## Satisfaction is not modelling

The compiler can only check syntax and constant expressions. Most standard concepts also carry semantic requirements: `std::equality_comparable` requires `==` to be an equivalence relation, `std::regular` requires copies to compare equal to the original, and many concepts require their expressions to be equality-preserving. A type *satisfies* a concept when the constraint evaluates to true. It *models* the concept when it also meets the semantic requirements.

> **Standardese.** [res.on.requirements] says that if the validity or meaning of a program depends on whether template arguments model a library concept, and the concept is satisfied but not modelled, the program is ill-formed, no diagnostic required. Passing a type whose `operator==` is not reflexive to `std::ranges::find` compiles and is still wrong.

This is also why concepts are not a substitute for reading a template's requirements: a constraint is the checkable shadow of a contract, not the contract. The SFINAE topic covers the older mechanism that constraints replace, and partial-ordering-of-templates covers how constraints act as the final tiebreaker after ordinary partial ordering.

## What to remember

- A concept is a named constraint; a concept-id is a `bool` prvalue. Concepts cannot be constrained, specialized or recursive.
- A requires-clause takes primary expressions joined by `&&` and `||`; parenthesize anything else.
- Simple, type and compound requirements check validity; only a nested `requires E;` checks a value.
- `{ e } -> C<Args...>` checks `C<decltype((e)), Args...>`, so a member access yields a reference type.
- Normalization splits on top-level `&&` and `||`; everything else, including `!C<T>`, is an opaque atom.
- An atom whose substitution fails is unsatisfied; an atom that is not exactly `bool` makes the program ill-formed.
- Atoms are identical only when they come from the same source expression, so build concepts out of other concepts if you want subsumption.
- Each `auto` parameter is its own template parameter, and a constrained placeholder puts the deduced type first.
- Satisfying a concept is syntax; modelling it adds semantics, and relying on an unmodelled concept is ill-formed, no diagnostic required.
