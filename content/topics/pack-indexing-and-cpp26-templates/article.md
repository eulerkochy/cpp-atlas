---
title: "Pack indexing and C++26 template features"
summary: "C++26 lets you subscript a pack, turn a structured binding into a pack, befriend a whole pack, order constraints written as folds, and pass concepts and variable templates as template arguments. Each feature removes a recursive or helper-template workaround."
track: "cpp26"
minutes: 13
standard:
  - "[expr.prim.pack.index]"
  - "[dcl.type.pack.index]"
  - "[temp.variadic]"
  - "[dcl.struct.bind]"
  - "[dcl.pre]"
  - "[class.friend]"
  - "[dcl.type.elab]"
  - "[temp.constr.fold]"
  - "[temp.constr.normal]"
  - "[temp.constr.order]"
  - "[temp.param]"
  - "[temp.arg.template]"
  - "[stmt.expand]"
  - "[diff.cpp23.temp]"
cppreference:
  - title: "Pack indexing"
    path: "language/pack_indexing"
  - title: "Pack"
    path: "language/parameter_pack"
  - title: "Structured binding declaration"
    path: "language/structured_binding"
  - title: "Friend declaration"
    path: "language/friend"
  - title: "Constraints and concepts"
    path: "language/constraints"
  - title: "Fold expressions"
    path: "language/fold"
  - title: "Template parameters and template arguments"
    path: "language/template_parameters"
prerequisites:
  - "variadic-templates-and-fold-expressions"
  - "concepts-and-constraints"
  - "structured-bindings"
  - "access-control-and-friends"
  - "constexpr-in-cpp26"
---

## The one idea

Before C++26, a pack could only be expanded as a whole. Anything else, such as taking its third element, splitting an aggregate into a pack, or befriending every type in a list, needed a recursive helper template or a `std::index_sequence` trick. The C++26 template changes all make the pack itself more useful, so the helper disappears and the intent sits in one line.

> **Mental model.** In C++26 a pack is something you can subscript, create from an object, name in a `friend` declaration, and reason about in a constraint. Each new form is still a pack expansion, so every old rule about packs (same lengths, expansion inside a template) still applies.

This is C++26. The text follows N5050, the final C++26 draft. The contracts topic records the status of the ISO ballot on that draft. The features and their papers:

| Feature | Paper | Feature-test macro | GCC 16.2 | Clang 21 |
|---|---|---|---|---|
| Pack indexing | P2662R3 | `__cpp_pack_indexing` 202311L | yes | yes |
| Structured binding packs | P1061R10 | `__cpp_structured_bindings` 202411L | yes | yes |
| Variadic friends | P2893R3 | `__cpp_variadic_friend` 202403L | yes | yes |
| Ordering of fold constraints | P2963R3 | none | no | yes |
| Concept and variable template template parameters | P2841R7 | `__cpp_template_parameters` 202502L | no | no |
| Expansion statements | P1306R5 | `__cpp_expansion_statements` 202506L | yes | no |

Every feature needs `-std=c++26`, or `-std=c++2c` on older compilers. Nothing here sits behind an extra flag. P2841 cannot be compiled with either compiler, so its examples below are checked only against the draft text.

## Pack indexing

`Ts...[N]` names the type at position `N` of a type pack, and `xs...[N]` names the element at position `N` of a value pack. The index must be a converted constant expression of type `std::size_t`, and its value must be less than the pack's length. A negative literal therefore fails as a narrowing conversion, and an index that is too large is a hard error when the template is instantiated.

```cpp
#include <cstddef>
#include <tuple>
#include <type_traits>

template<class... Ts> using First = Ts...[0];
static_assert(std::is_same_v<First<int, char>, int>);

template<int... N> constexpr int last = N...[sizeof...(N) - 1];
static_assert(last<4, 5, 6> == 6);

// The index may itself come from a pack, so the indexing expands with it.
template<std::size_t... I, class... T>
auto pick(T... xs) { return std::tuple<T...[I]...>(xs...[I]...); }
static_assert(std::is_same_v<decltype(pick<2, 0>(1, 'c', 3.0)),
                             std::tuple<double, int>>);
```

A pack-index-expression is a form of id-expression. After instantiation it is simply the name of the chosen parameter, so `decltype(xs...[0])` gives that parameter's declared type, and `decltype((xs...[0]))` gives an lvalue reference to it, exactly as with an ordinary parameter name.

Only type packs and value packs can be indexed. The operand must name a pack, so `T...[0]` with a non-pack `T` is ill-formed, and there is no syntax for indexing a pack of template template parameters.

> **Pitfall.** A pack-index-specifier is a non-deduced context. `template<class... T> void first(T...[0] x);` cannot deduce `T` from `first(1)`, because `T` is deduced as an empty pack and indexing an empty pack fails. You must write `first<int>(1)`.

Annex C records one breaking change. In C++23, `void f(T... [1]);` declared an unnamed pack of array parameters. In C++26 the same tokens are a pack index. Giving the parameter a name, as in `T... p[1]`, keeps the old meaning.

## Structured binding packs

P1061 lets one identifier in a structured binding carry an ellipsis. That identifier becomes a **structured binding pack**, holding however many elements are left after the named ones. It may appear first, last or in the middle. The pack may be empty, but the named bindings must not outnumber the elements.

```cpp
#include <cstdio>
#include <tuple>

struct C { int x, y, z; };

template<class T> void show(const T& t) {
  auto& [first, ...rest] = t;
  std::printf("%d %zu\n", first, sizeof...(rest));
}

auto product = [](auto t) { auto [...xs] = t; return (xs * ... * 1); };

int main() {
  show(C{7, 8, 9});                               // prints "7 2"
  show(std::tuple{1});                            // prints "1 0"
  std::printf("%d\n", product(std::tuple{2, 3, 4}));  // prints "24"
}
```

Two restrictions bite. A declaration may contain at most one pack. A declaration with a pack must also declare a templated entity, which means it has to sit inside a template or a generic lambda. Revision 9 allowed packs anywhere by inventing an implicit template region, but that was judged too hard to implement, and R10 removed it.

```cpp
struct C { int x, y, z; };
// int f() { auto [a, ...rest] = C{1, 2, 3}; return a; }
// error: structured binding pack outside of a template
```

> **Standardese.** [dcl.pre] says that a structured binding declaration with an sb-identifier preceded by an ellipsis "shall declare a templated entity". [dcl.struct.bind] then defines the pack's length as the structured binding size of the initializer minus the number of non-pack names.

C++26 also allows `constexpr` on a structured binding declaration (P2686R5). GCC 16 accepts `constexpr auto [a, b, c] = C{1, 2, 3};` in a function, but Clang 21 does not. GCC 16 still rejects the tuple-like case at block scope, because it would need a constexpr reference to an automatic variable, which is the part of P2686 that GCC has not yet implemented. The constexpr-in-cpp26 topic covers this in depth.

## Variadic friends

A `friend` declaration that names a type now takes a comma-separated list, and each element may be a pack expansion. That makes the passkey idiom generic.

```cpp
template<class... Ts> class Locked {
  int v = 42;
  friend Ts...;          // every type in Ts is a friend
};

struct K { template<class L> static int peek(L& l) { return l.v; } };
struct A; struct B;
class Two { friend A, B; };   // a plain list is new in C++26 as well

int demo() { Locked<K, int> l; return K::peek(l); }  // "friend int" is ignored
```

As before, a friend-type-specifier that does not designate a class type is ignored, so `Locked<K, int>` is fine. The form must be `friend Ts...;`. Writing `friend class Ts...;` is ill-formed, because [dcl.type.elab] forbids an elaborated-type-specifier whose identifier resolves to a template parameter, and that was already true of `friend class T;`.

## Ordering constraints written as folds

In C++20 and C++23, a fold expression in a constraint was a single atomic constraint. Two overloads constrained by `(std::integral<T> && ...)` and `(Num<T> && ...)` were ambiguous even when one concept clearly refined the other, because atomic constraints only subsume each other when they are the same expression.

P2963 changes normalization. A fold over `&&` or `||` whose pattern contains a pack becomes a **fold expanded constraint**. Its pattern is normalized like any other constraint, so the concepts inside it take part in subsumption.

```cpp
#include <concepts>

template<class T> concept Num = std::integral<T> || std::floating_point<T>;

template<class... T> requires (std::integral<T> && ...) int h(T...) { return 1; }
template<class... T> requires (Num<T> && ...)           int h(T...) { return 2; }

int a = h(1, 2);  // C++26 draft: 1, the integral fold subsumes the Num fold
int b = h(1.0);   // 2: only the second overload is viable
// GCC 16 does not implement P2963 and reports h(1, 2) as ambiguous.
```

One fold expanded constraint subsumes another only if both use the same fold operator, their patterns contain an equivalent unexpanded pack, and the first pattern subsumes the second. The operator rule exists because of empty packs. `(C<T> && ...)` holds for an empty pack and `(C<T> || ...)` does not, so neither may subsume the other. A pair of overloads constrained by `(std::integral<T> && ...)` and `(std::integral<T> || ...)` is still ambiguous for `k(1, 2)`.

Satisfaction short-circuits element by element, so no substitution happens after the first failing element of an `&&` fold.

> **Pitfall.** Because each element is now checked as its own atomic constraint, each must have type `bool`. In the Annex C example, `requires (T::compare(U{}) && ...)` with `compare` returning `int` was valid C++23, because the whole fold had type `bool`. It is ill-formed in C++26.

## Concepts and variable templates as template arguments

A template template parameter used to accept only class templates and alias templates. P2841 adds two new kinds. A **concept template parameter** is written `template<class> concept C`, and its argument must name a concept. A **variable template template parameter** is written `template<class> auto V`, and its argument must name a variable template. The draft now calls non-type template parameters **constant template parameters**. That renaming was done editorially alongside P2841.

```cpp
// C++26 draft only: neither GCC 16 nor Clang 21 accepts this syntax yet.
template<class T> concept Small = sizeof(T) <= 4;
template<class T> constexpr int zero = 0;

template<class T, template<class> concept Pred>
constexpr bool check = Pred<T>;

template<template<class> auto V>
constexpr int at_int = V<int>;

static_assert(check<char, Small>);
static_assert(at_int<zero> == 0);

template<typename T, template<typename> concept... CTs>
concept all_of = (CTs<T> && ...);
```

Inside the template, a concept template parameter's name is a concept-name, so it can be used in a type-constraint such as `Pred auto x`. A concept template parameter may not have associated constraints of its own. In a fold over a pack of concepts, the fold may not also expand a pack of another kind.

Subsumption has a limit here. A constraint that uses a concept template parameter whose argument is still unknown is a **concept-dependent constraint**, and a declaration whose associated constraints contain one is not eligible for subsumption. Once the concept argument is known, as in `all_of<T, A, C>`, normalization substitutes it and expands the fold into a plain conjunction, so ordering works again.

## Expansion statements

P1306 adds `template for`, which repeats its body once for each element at compile time. It accepts a brace list of expressions, a constant-size range, or anything that structured bindings can destructure. It is the natural partner to structured binding packs, and reflection relies on it heavily.

```cpp
#include <cstdio>

struct S { int i; double d; };

int main() {
  S s{1, 2.5};
  template for (auto m : s)                 // one instantiation per member
    std::printf("%zu ", sizeof(m));         // prints the size of each member
}
```

The destructuring form is defined in terms of a structured binding declaration with a pack-like list of bindings, and the enumerating form expands a brace list such as `{xs...}`. GCC 16 supports `template for` in `-std=c++26` without any extra flag. Clang 21 does not.

## What to remember

- `Ts...[N]` and `xs...[N]` index a pack. The index is a constant `std::size_t` below the pack's length, and an index pack can drive an expansion, as in `T...[I]...`.
- A pack index is a non-deduced context, and `decltype(xs...[0])` gives the parameter's declared type.
- `auto [a, ...rest] = e;` introduces a structured binding pack. Only one is allowed per declaration, and it must sit inside a template or a generic lambda.
- `friend Ts...;` and `friend A, B;` are valid in C++26. Non-class types are ignored, and `friend class Ts...;` is ill-formed.
- Folds over `&&` and `||` in constraints are fold expanded constraints. They subsume each other only with the same operator and the same pack, and each element must be a `bool` atomic constraint.
- `template<class> concept C` and `template<class> auto V` are new template template parameter kinds, and a constraint that depends on an unknown concept argument is not eligible for subsumption.
- GCC 16 lacks P2963 and P2841 and implements P2686 only in part. Clang 21 lacks P2841, P1306 and constexpr structured bindings.
