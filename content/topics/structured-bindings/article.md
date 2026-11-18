---
title: "Structured bindings"
summary: "A structured binding declaration creates one hidden variable from the initializer and then introduces names that refer into it. The specifiers you write apply to the hidden variable, and the names are aliases, not new variables."
track: "expressions-and-functions"
minutes: 12
standard:
  - "[dcl.struct.bind]"
  - "[dcl.type.decltype]"
  - "[expr.prim.lambda.capture]"
  - "[class.temporary]"
  - "[tuple.helper]"
cppreference:
  - title: "Structured binding declaration"
    path: "language/structured_binding"
  - title: "std::tuple_size"
    path: "utility/tuple_size"
  - title: "std::tuple_element"
    path: "utility/tuple_element"
prerequisites:
  - "type-deduction-auto-decltype"
  - "reference-binding-and-temporaries"
  - "value-categories"
---

## The one idea

`auto [a, b] = expr;` looks like it declares two variables. It declares one. The compiler invents a variable, which the standard calls `e`, initializes it from `expr` exactly as `auto e = expr;` would, and then makes `a` and `b` names for parts of `e`.

Every rule follows from that picture. The `auto`, `const`, `&` or `&&` you write decide the type of `e`, not of `a` and `b`. Copying happens once, when `e` is initialized, or not at all if `e` is a reference. And `a` and `b` are not objects in their own right: they are names that the compiler resolves to subobjects of `e`, or, for tuple-like types, to references initialized from `get`.

```text
auto& [k, v] = entry;

    entry ----------------+
                          |   e is declared as  auto& e = entry;
    e (hidden, auto&) ----+
      .first  <-- k       k and v name members of e,
      .second <-- v       so they name members of entry
```

> **Mental model.** Rewrite `cv auto ref [names...] = expr;` as `cv auto ref e = expr;` and then read each name as "the i-th part of `e`". Any question about copies, constness or lifetime is a question about `e`.

## What the specifiers apply to

Because the declaration of `e` is formed from your specifiers and initializer, the familiar `auto` deduction rules apply to it, and they explain the common forms:

- `auto [a, b] = p;` copies `p` into `e`. Writing to `a` changes the copy.
- `auto& [a, b] = p;` makes `e` an lvalue reference to `p`. Writing to `a` changes `p`. It does not compile if `p` is a prvalue, because a non-const lvalue reference cannot bind to it.
- `const auto& [a, b] = make();` makes `e` a reference to const bound to the temporary; the names are read-only.
- `auto&& [a, b] = expr;` makes `e` a forwarding reference: it binds to anything without copying.

```cpp
#include <utility>

std::pair<int, int> make() { return {1, 2}; }

void demo() {
  std::pair<int, int> p{1, 2};
  auto  [a, b] = p;     a = 10;   // p.first is still 1: e is a copy
  auto& [c, d] = p;     c = 10;   // p.first is now 10: e refers to p
  // auto& [x, y] = make();       // ill-formed: lvalue reference to a prvalue
  const auto& [x, y] = make();    // OK: e binds to the temporary
  (void)b; (void)d; (void)x; (void)y;
}
```

The one exception to "`e` is declared exactly like `auto e = expr`" is a plain array with no reference qualifier: `e` becomes an array of the same type, and its elements are copied from the source elements one by one. Ordinary `auto` would have decayed the array to a pointer.

## Three ways to bind

Which protocol is used depends only on `E`, the type of `e` with references removed, and the checks happen in this order.

**Arrays.** If `E` is an array type, the names refer to its elements, and their number must equal the array bound.

**Tuple-like types.** Otherwise, if `std::tuple_size<E>` is a complete type with a member named `value`, the tuple protocol is used. The number of names must equal `std::tuple_size<E>::value`. For each index `i`, the compiler introduces a hidden variable of type "reference to `std::tuple_element<i, E>::type`", initialized from `e.get<i>()` if `E` has a member function template `get` whose first template parameter is a non-type parameter, and from `get<i>(e)` found by argument-dependent lookup otherwise. The name then refers to the object that reference is bound to. This is how `std::pair`, `std::tuple` and `std::array` decompose.

**Data members.** Otherwise, `E` must be a non-union class whose non-static data members are all direct members of `E` or all members of the same unambiguous base class, with no anonymous unions. The names refer to the members in declaration order, and the number of names must match. Since C++20 the members only need to be accessible at the point of the declaration, so a friend or member function can decompose a class with private data.

```cpp
class Point {
  int x_ = 1, y_ = 2;
  friend int sum(const Point& p) { auto [x, y] = p; return x + y; }  // OK since C++20
};

// auto [x, y] = Point{};   // ill-formed outside the class: x_ and y_ are private
```

> **Pitfall.** Specializing `std::tuple_size` for a type switches it to the tuple protocol even if it is an aggregate whose members would otherwise bind directly. A half-finished specialization, with `tuple_size` but no working `get`, turns a working declaration into a compile error.

## Names, not variables

A structured binding is an alias, and the language treats it differently from a variable in several observable ways.

**`decltype`.** Applied to an unparenthesized binding, `decltype` gives its *referenced type*, not the type of a reference. For arrays that is the element type, for data members it is the member's declared type with `e`'s cv-qualification added, and for the tuple protocol it is `std::tuple_element<i, E>::type`. So `auto& [a, b] = p;` for a `std::pair<int, int>` gives `decltype(a)` equal to `int`, not `int&`. Parenthesize it, as `decltype((a))`, and you get the expression rule: `a` is an lvalue, so `int&`.

**References inside the element type.** For `std::tie(x, y)`, the element types are `int&`, so the bindings refer to `x` and `y` themselves, even with plain `auto`. The object that `auto` creates is a tuple of references, not a copy of the referenced ints.

```cpp
#include <tuple>

void demo() {
  int x = 1, y = 2;
  auto [a, b] = std::tie(x, y);   // e is a std::tuple<int&, int&>
  a = 10;                          // x is now 10
  (void)b;
}
```

**Bit-fields.** A binding can name a bit-field, which no reference can, because the binding is not a reference. `auto& [flags] = s;` followed by `flags = 2;` writes the bit-field `s.flags`.

**Lambda capture.** In C++17 a structured binding could not be captured by a lambda at all, because it is not a variable. C++20 allows capturing bindings both by copy and by reference, although a binding that names a bit-field still cannot be captured by reference. GCC already accepted such captures in C++17 mode as an extension, while older Clang releases rejected them in every mode.

```cpp
#include <utility>

int demo() {
  auto [a, b] = std::pair{1, 2};
  return [a, &b] { return a + b; }();   // OK since C++20
}
```

C++20 also allowed the `static` and `thread_local` specifiers on a structured binding declaration. `constexpr`, `inline` and `extern` were still not permitted in C++23.

## Lifetime through bindings

Lifetime extension works through `e`. When `e` is a reference bound directly to a temporary, as in `const auto& [a, b] = make();` or `auto&& [a, b] = make();`, the temporary lives as long as `e`, which is the end of the enclosing scope. The names never dangle in that case.

```cpp
#include <cstdio>
#include <utility>

struct Noisy { ~Noisy() { std::puts("~Noisy"); } };
std::pair<Noisy, int> make() { return {}; }

void demo() {
  {
    const auto& [n, i] = make();
    std::puts("body");        // prints before ~Noisy: the pair is still alive
    (void)n; (void)i;
  }                           // ~Noisy here, when e goes out of scope
}
```

The usual limits of lifetime extension still apply. If the initializer is a function call that returns a reference into a temporary, such as a member function that returns `*this` by reference called on a prvalue, then `e` binds to the returned reference, no temporary is bound directly, and the bindings dangle at the end of the full-expression. The rules are the subject of reference-binding-and-temporaries.

## Writing a tuple-like type

To opt a type into the tuple protocol, specialize `std::tuple_size` and `std::tuple_element`, and provide `get<I>` either as a member function template or as a free function template that argument-dependent lookup can find. Free `get` must be in the type's own namespace; a `get` declared elsewhere and visible only through ordinary lookup is not considered.

```cpp
#include <cstddef>
#include <utility>

namespace geo {
struct Pt { int x, y; };
template <std::size_t I> int get(const Pt& p) { return I == 0 ? p.x : p.y; }
}

template <> struct std::tuple_size<geo::Pt> : std::integral_constant<std::size_t, 2> {};
template <std::size_t I> struct std::tuple_element<I, geo::Pt> { using type = int; };

int demo() { auto [a, b] = geo::Pt{3, 4}; return a * b; }   // 12, via geo::get
```

The hidden variable is passed to `get` as an lvalue when `e` is an lvalue reference and as an xvalue otherwise, so a `get` overload set that distinguishes `&` and `&&` can move elements out of a by-value `e`. `std::tuple_element` should be specialized for the unqualified type; the standard library provides the partial specializations for `const E` that make `const auto [a, b]` work.

> **Standardese.** [dcl.struct.bind] says the member `get` is used when class member access lookup for `get` in `E` finds at least one function template whose first template parameter is a non-type parameter. Otherwise `get<i>(e)` is used with `get` looked up by argument-dependent lookup only.

## C++26 additions

C++26 extends the syntax in four ways. GCC 16 implements all of them in `-std=c++26` mode.

- **Attributes on individual bindings** (P0609): `auto [a, b [[maybe_unused]]] = f();`.
- **Structured binding as a condition** (P0963): `if (auto [ok, value] = parse(s))`. The condition is `e` contextually converted to `bool`, and that test is performed before the bindings are initialized, so a tuple-like type's `get` is not called before the check.
- **Binding packs** (P1061): one name may be preceded by `...` to introduce a pack, as in `auto [head, ...tail] = t;`. A pack may only be introduced inside a template, and it can be empty.
- **`constexpr` and `constinit`** (P2686) are now allowed on the declaration, subject to the usual constant-initialization rules.

```cpp
#include <tuple>

template <class T>
int sum_all(const T& t) {
  auto [...xs] = t;          // C++26: xs is a pack of all the elements
  return (0 + ... + xs);
}

int demo() { return sum_all(std::tuple{1, 2, 3}); }   // 6
```

The placeholder name `_`, which can be repeated in one declaration since C++26, also works in structured bindings and is described with the other C++26 language changes.

## What to remember

- A structured binding declaration declares one hidden variable `e`; the names refer into it.
- `auto`, `const`, `&` and `&&` apply to `e`. `auto` copies, `auto&` aliases an lvalue, `const auto&` and `auto&&` bind anything.
- The protocol is chosen in order: array, then tuple-like if `std::tuple_size<E>` is complete, then public or accessible data members.
- The tuple protocol prefers a member `get` template and otherwise uses ADL-only `get<i>(e)`.
- `decltype(name)` gives the referenced type, such as `int` for a `std::pair<int, int>` binding even with `auto&`.
- `auto [a, b] = std::tie(x, y);` still aliases `x` and `y`.
- Bindings can name bit-fields and, since C++20, can be captured by lambdas.
- A reference `e` bound directly to a temporary extends its lifetime; a reference returned from a function does not.
- C++26 adds per-binding attributes, bindings as conditions, packs inside templates, and `constexpr`.
