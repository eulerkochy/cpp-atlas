---
title: "Variadic templates and fold expressions"
summary: "A parameter pack stands for zero or more template or function arguments, and the only thing you can do with one is expand it, repeating a pattern once per element. C++17 fold expressions reduce a pack with an operator, replacing most of the recursion that C++11 variadic code needed."
track: "templates"
minutes: 12
standard:
  - "[temp.variadic]"
  - "[expr.prim.fold]"
  - "[expr.sizeof]"
  - "[temp.param]"
  - "[dcl.fct]"
  - "[temp.deduct.call]"
  - "[expr.comma]"
cppreference:
  - title: "Parameter pack"
    path: "language/parameter_pack"
  - title: "Fold expressions"
    path: "language/fold"
  - title: "sizeof... operator"
    path: "language/sizeof..."
  - title: "std::forward"
    path: "utility/forward"
prerequisites:
  - "template-argument-deduction"
  - "forwarding-references-and-perfect-forwarding"
---

## The one idea

A **parameter pack** is a name that stands for a list of zero or more things: types, values, templates, or function parameters. You cannot index it, loop over it, or pass it around as a unit in C++23. The one operation is **pack expansion**: you write a pattern that mentions the pack, follow it with `...`, and the compiler stamps out one copy of the pattern per element, separated by commas. A **fold expression** is a second, C++17 form of expansion that joins the copies with a binary operator instead of commas.

Every rule in this topic is a refinement of that. The pattern decides what gets repeated, the context decides where repetition is allowed, and deduction decides how long the pack is.

> **Mental model.** `pattern...` is a compile-time copy-and-paste. `f(g(xs)...)` becomes `f(g(x1), g(x2), g(x3))`; the `...` applies to the whole pattern to its left, not just to the pack name.

## Four kinds of pack

A template parameter pack is declared with `...` before the name. It can be a type pack (`class... Ts`), a non-type pack (`int... Ns`, or `auto... Vs` since C++17), or a template template pack (`template<class> class... Ts`). A **function parameter pack** is a function parameter whose type contains a template parameter pack, as in `Ts... xs`; its type is itself a pack expansion. C++20 added init-capture packs in lambdas, `[...ys = xs]`.

`sizeof...(pack)` gives the number of elements as a constant expression of type `std::size_t`. It counts elements; it has nothing to do with `sizeof`.

```cpp
#include <tuple>

template<class... Ts> constexpr auto count = sizeof...(Ts);
static_assert(count<int, void, char[3]> == 3);  // void is fine: no object is formed
static_assert(count<> == 0);

template<int... Ns> constexpr int isum = (Ns + ... + 0);
static_assert(isum<1, 2, 3> == 6);

template<template<class> class... Ts> struct Apply {
  using type = std::tuple<Ts<int>...>;  // one specialization per template
};

template<class... Ts> auto capture(Ts... xs) {
  return [...ys = xs] { return (ys + ...); };  // C++20 init-capture pack
}
```

A primary class, variable or alias template may have at most one template parameter pack, and it must come last. Function templates are more relaxed: a pack may be followed by template parameters that can be deduced from the function parameters or that have defaults.

## Patterns and where they can expand

The pattern is everything that belongs to the `...`. It may be as simple as the pack name or an arbitrarily complex expression or type. Moving the `...` changes the meaning completely.

```cpp
int g(int x) { return x * 10; }
template<class... Ts> int f(Ts... xs) { return (0 + ... + xs); }

template<class... Ts> int per_element(Ts... xs) { return f(g(xs)...); }  // f(g(x1), g(x2))
template<class... Ts> int all_at_once(Ts... xs) { return g(f(xs...)); }  // g(f(x1, x2))
```

A pattern may name several packs. They are expanded in lockstep, so they must all have the same length, and the program is ill-formed if they do not.

```cpp
#include <utility>

template<class... Ts> struct List {};
template<class... Ts> struct Zip {
  template<class... Us> using with = List<std::pair<Ts, Us>...>;
};
// Zip<int, char>::with<long, bool> is List<pair<int, long>, pair<char, bool>>
// Zip<int, char>::with<long> is ill-formed: lengths 2 and 1
```

Expansion is allowed only in contexts that are themselves comma-separated lists: function call arguments, template argument lists, braced initializer lists, base class lists, member initializer lists, lambda capture lists, `using` declarations (since C++17), `alignas` and attribute lists, and fold expressions. A bare `xs...;` as a statement is not one of them, and neither is `std::printf("%d", xs);` without any `...`, which is rejected as an unexpanded pack.

```cpp
template<class... Fs> struct overloaded : Fs... {  // pack expansion in the base list
  using Fs::operator()...;                         // C++17 pack expansion in using
};
```

> **Pitfall.** `xs + 1...` does not compile. The preprocessor reads `1...` as a single preprocessing number, which is not a valid token. Write `(xs + 1)...` or put a space before the dots.

## Recursion, then folds

Before C++17, the standard way to process a pack was recursion: peel off the first element, handle it, and recurse on the rest, with a non-variadic overload as the base case. It works, but it instantiates one function per element and spreads the logic over several declarations. The other C++11 idiom was expansion into an array initializer, abusing the comma operator to run an expression per element in a guaranteed order.

```cpp
#include <cstdio>

void print_rec() { std::puts(""); }                        // base case
template<class T, class... Rest> void print_rec(T t, Rest... rest) {
  std::printf("%d", t);
  print_rec(rest...);                                      // one instantiation per length
}

template<class... Ts> void print_array(Ts... xs) {
  int dummy[] = {0, (std::printf("%d", xs), 0)...};        // C++11 trick
  (void)dummy;
}

template<class... Ts> void print_fold(Ts... xs) {
  (std::printf("%d", xs), ...);                            // C++17
}
```

C++17 also allows the recursion to live in one function: `if constexpr (sizeof...(rest) > 0)` guards the recursive call, so no separate base-case overload is needed, but there is still one instantiation per length. A fold does the same work in a single instantiation and a single expression, and it is the default choice whenever the per-element work fits in an expression.

## The four fold forms

A fold expression is always parenthesized and uses one of 32 binary operators. With a pack `E` holding `E1, E2, E3` and an initial value `I`:

| Form | Spelling | Expands to |
| --- | --- | --- |
| Unary right fold | `(E op ...)` | `E1 op (E2 op E3)` |
| Unary left fold | `(... op E)` | `(E1 op E2) op E3` |
| Binary right fold | `(E op ... op I)` | `E1 op (E2 op (E3 op I))` |
| Binary left fold | `(I op ... op E)` | `((I op E1) op E2) op E3` |

The side the dots are on is the side the parentheses pile up on. For associative operators it does not matter; for subtraction or division it decides the answer.

```cpp
template<class... Ts> int rsub(Ts... xs) { return (xs - ...); }  // 10 - (4 - 3) == 9
template<class... Ts> int lsub(Ts... xs) { return (... - xs); }  // (10 - 4) - 3 == 3
```

The operand of a fold must be a cast-expression, so `(xs * 2 + ...)` is ill-formed; write `((xs * 2) + ...)`. The binary forms exist mainly for an initial value and for streams, as in `(std::cout << ... << xs)`.

An empty pack is where the forms differ. A binary fold of an empty pack is just `I`. A unary fold of an empty pack is allowed for exactly three operators: `&&` gives `true`, `||` gives `false`, and the comma operator gives `void()`. Every other operator, including `+` and `*`, makes the instantiation ill-formed, because the identity values in the original proposal were removed before C++17 shipped.

```cpp
template<class... Ts> constexpr bool all(Ts... xs) { return (... && xs); }
template<class... Ts> constexpr auto sum(Ts... xs) { return (xs + ... + 0); }
static_assert(all() && sum() == 0);
// (xs + ...) with an empty pack: error, no fallback value for +
```

> **Standardese.** [temp.variadic] says that when a unary fold is instantiated with an empty pack, `&&` yields `true`, `||` yields `false`, the comma operator yields `void()`, and for any other operator the instantiation is ill-formed.

## Folding over the comma, and evaluation order

`(f(xs), ...)` is the idiomatic "do this for every element". The comma operator sequences its left operand before its right, and that holds however the expression is grouped, so both the right fold and the left fold call `f` on the elements from first to last. That is a guarantee.

Expanding into function arguments gives no such guarantee. In `sink(f(xs)...)`, the arguments are indeterminately sequenced, and implementations do differ in practice. Expansion into a braced initializer list, as in the array trick, is evaluated left to right.

```cpp
#include <cstdio>

template<class... Ts> void sink(Ts...) {}

template<class... Ts> void show(Ts... xs) {
  (std::printf("%d", xs), ...);            // guaranteed 123 for show(1, 2, 3)
  sink((std::printf("%d", xs), 0)...);     // order unspecified
}
```

If the pattern's type might overload the comma operator, cast to `void`: `(void(f(xs)), ...)`. Overloaded commas are rare, but generic code that calls user functions is exactly where they show up.

## Packs and deduction

A function parameter pack at the end of the parameter list deduces one element per remaining argument, and its length is whatever is left. A function parameter pack anywhere else is a non-deduced context: it is never deduced from the call. Its elements must be given explicitly, and if it is the last template parameter and nothing is given, it is empty.

```cpp
template<class... Ts, class U> int last(Ts..., U u) { return u; }

int ok = last<int, int>(1, 2, 3);  // Ts = {int, int} explicitly, U = int deduced
// int no = last(1, 2, 3);         // error: Ts cannot be deduced from the call
```

Explicit arguments for a pack can also be extended by deduction: `f<int>(1, 2.0)` with `template<class... Ts> void f(Ts...)` gives `Ts = {int, double}`. Class template partial specializations use packs in the arguments, as in `template<class T, class... Rest> struct Count<T, Rest...>`, matching any non-empty list.

The most common pack in real code is a pack of forwarding references, `Args&&... args`, expanded as `std::forward<Args>(args)...`. Each element deduces independently, so one call can mix lvalues and rvalues, and the pattern `std::forward<Args>(args)` expands both packs in lockstep. Why that preserves value categories is the subject of the topic on forwarding references and perfect forwarding. C++26 pack indexing, `Ts...[0]`, has its own topic too.

## What to remember

- A pack can only be expanded; `pattern...` repeats the whole pattern once per element.
- Packs come as type, non-type, template template and function parameter packs, plus C++20 init-capture packs; `sizeof...` counts elements.
- Packs in one pattern expand in lockstep and must have equal lengths.
- Expansion is allowed only in list contexts and folds; `xs + 1...` fails to lex, so parenthesize.
- Unary folds group toward the dots; binary folds add an initial value used for empty packs.
- An empty unary fold is valid only for `&&` (true), `||` (false) and comma (`void()`).
- A comma fold evaluates left to right; expansion into function arguments does not guarantee order.
- Only a trailing function parameter pack is deduced from a call.
