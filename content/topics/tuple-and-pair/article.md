---
title: "pair, tuple and the tuple protocol"
summary: "A tuple is a struct whose members have numbers instead of names. The interesting parts are how it is built, how tuples of references work as a multiple-assignment device, and how the tuple protocol lets any type take part in structured bindings and in tuple algorithms."
track: "utilities"
minutes: 14
standard:
  - "[pairs]"
  - "[tuple]"
  - "[tuple.cnstr]"
  - "[tuple.assign]"
  - "[tuple.creation]"
  - "[tuple.rel]"
  - "[tuple.apply]"
  - "[tuple.helper]"
  - "[dcl.struct.bind]"
cppreference:
  - title: "std::pair"
    path: "utility/pair"
  - title: "std::tuple"
    path: "utility/tuple"
  - title: "std::tie"
    path: "utility/tuple/tie"
  - title: "std::forward_as_tuple"
    path: "utility/tuple/forward_as_tuple"
  - title: "std::apply"
    path: "utility/apply"
  - title: "std::make_from_tuple"
    path: "utility/make_from_tuple"
  - title: "std::ignore"
    path: "utility/tuple/ignore"
  - title: "tuple-like and pair-like"
    path: "utility/tuple/tuple-like"
prerequisites:
  - "structured-bindings"
  - "forwarding-references-and-perfect-forwarding"
  - "three-way-comparison"
---

## The one idea

`std::pair<A, B>` and `std::tuple<A, B, C...>` are structs with anonymous members. They give you construction, copying, swapping and lexicographic comparison for free, in exchange for losing every name. That trade is good for glue code, such as returning two values or forwarding an argument pack, and bad for anything that lives longer than a statement.

Two ideas make the family more than a convenience. First, a tuple can hold references, which turns it into a bundle of lvalues you can assign through. Second, the *tuple protocol*, a trio of `tuple_size`, `tuple_element` and `get`, is not tied to `std::tuple`, and any type can implement it.

> **Mental model.** A tuple is a struct without member names. A tuple of references is a struct of aliases. The protocol is the interface that lets generic code, and structured bindings, treat any struct that way.

## Construction

Both types have the constructors you expect: default, copy and move, and element-wise. The element-wise constructors are *conditionally explicit*: the constructor is `explicit` only if some element conversion is explicit. This is why initialization from braces works for ordinary types and fails for the explicit ones.

```cpp
#include <tuple>
#include <string>

struct Explicit { explicit Explicit(int) {} };

int main() {
  std::tuple<std::string, int> a = {"x", 1};   // OK: every conversion is implicit
  std::tuple<std::string> b = "x";             // OK: const char* converts implicitly
  std::tuple<Explicit> c{1};                   // OK: direct initialization
  // std::tuple<Explicit> d = {1};             // ill-formed: would use an explicit constructor
  (void)a; (void)b; (void)c;
}
```

Class template argument deduction works too, so `std::tuple t{1, 2.5, 'c'}` deduces `tuple<int, double, char>`. One trap: a single tuple argument is copied rather than nested, so `std::tuple t{some_tuple}` has the type of `some_tuple`.

### Piecewise construction

Sometimes the elements cannot be moved or copied at all, and you need to build each one in place from its own argument list. `pair` has a constructor tagged with `std::piecewise_construct` that takes one tuple of arguments per member. It exists for `emplace` on maps, which must build a `pair<const K, V>` from loose arguments, and it is where `forward_as_tuple` earns its keep.

```cpp
#include <map>
#include <tuple>
#include <utility>

struct Pinned {
  Pinned(int, int) {}
  Pinned(const Pinned&) = delete;
};

int main() {
  std::map<int, Pinned> m;
  // m.emplace(1, 2, 3);   // ill-formed: pair has no three-argument constructor
  m.emplace(std::piecewise_construct,
            std::forward_as_tuple(1),         // key built from (1)
            std::forward_as_tuple(2, 3));     // value built from (2, 3)
}
```

`std::map::try_emplace` covers the common case without the tuples, and is the better tool when it applies.

## Tuples of references

`std::tie(a, b)` returns a `tuple<A&, B&>`. Assigning a tuple or pair to it assigns each referenced variable, which is the closest C++ gets to multiple assignment. It is also the idiom for unpacking when you do not want new variables.

```cpp
#include <tuple>
#include <utility>
#include <cstdio>

int main() {
  int a = 1, b = 2;
  std::tie(a, b) = std::make_pair(b, a);   // a == 2, b == 1: the pair holds copies
  std::printf("%d %d\n", a, b);

  double d;
  std::tie(std::ignore, d) = std::make_pair(1, 2.5);  // ignore swallows the first value
  std::printf("%g\n", d);
}
```

`std::ignore` is an object whose assignment operator accepts anything and does nothing. Do not write `std::tie(a, b) = std::tie(b, a)` as a swap: both sides alias the same variables, and the second element reads an already overwritten value.

Three factories produce tuples of different shapes, and the differences matter.

| Call | Result for `int x; make(x, 1)` | Why |
| --- | --- | --- |
| `make_tuple(x, 1)` | `tuple<int, int>` | decays and copies every argument |
| `tie(x)` | `tuple<int&>` | references to lvalues only |
| `forward_as_tuple(x, 1)` | `tuple<int&, int&&>` | forwarding references, nothing is copied |

`make_tuple` also unwraps `std::reference_wrapper`, so `make_tuple(std::ref(a), std::cref(b))` is a `tuple<int&, const int&>`, and it decays arrays and functions, so `make_tuple("hi")` is a `tuple<const char*>`.

> **Pitfall.** `forward_as_tuple` is made for passing arguments straight on, within one full expression. Storing its result is dangerous: `auto t = std::forward_as_tuple(std::string("x"));` holds an `std::string&&` to a temporary that dies at the semicolon, and reading it afterwards is undefined behavior.

### Assignment goes through the references

References cannot be rebound, so assigning a `pair<int&, int>` to another assigns the *referred-to* object. The same holds for `tuple`.

```cpp
#include <utility>
#include <cstdio>

int main() {
  int a = 1, b = 2;
  std::pair<int&, int> p{a, 0}, q{b, 0};
  p = q;                          // a = b; p still refers to a
  std::printf("%d %d\n", a, b);   // 2 2
}
```

C++23 adds assignment operators that are `const`-qualified, for tuples and pairs whose elements are assignable through a const reference. A `const tuple<int&>` can therefore be assigned to. The reason is range proxies: `views::zip` yields prvalue tuples of references, and and the `indirectly_writable` concept requires that a const-qualified proxy returned by dereferencing an iterator can be assigned to. That is the reason for the change, and it is where you meet it in practice. Zipping itself belongs to the ranges topics.

## Comparison

Pairs and tuples compare lexicographically: the first position that differs decides, and equal prefixes defer to the rest. Tuples of different sizes cannot be compared. Since C++20, `<=>` is provided, and its category is the weakest category among the elements, so `tuple<int, double>` gives `std::partial_ordering` because `double` can be unordered, while `tuple<int, int>` gives `std::strong_ordering`. The relational operators `<`, `>`, `<=` and `>=` are rewritten in terms of it, and the separate per-operator overloads of earlier standards were removed.

The elements may differ in type as long as each pair of corresponding elements is comparable, so `tuple<int, std::string>` and `tuple<long, std::string>` compare.

This is why `std::tie(a.x, a.y) < std::tie(b.x, b.y)` is the classic way to write a multi-key `operator<` before C++20. With C++20, a defaulted `operator<=>` on a named struct does it better. See the three-way comparison topic.

## apply, make_from_tuple and tuple_cat

`std::apply(f, t)` calls `f` with the elements of `t` as arguments, and works for any tuple-like type. `std::make_from_tuple<T>(t)` constructs a `T` the same way. `std::tuple_cat` concatenates tuples, pairs and arrays into one tuple; the result type holds the elements in order.

```cpp
#include <tuple>
#include <utility>
#include <string>
#include <cstdio>

struct User {
  User(int id, std::string name) : id(id), name(std::move(name)) {}
  int id; std::string name;
};

int main() {
  auto sum = std::apply([](int a, int b) { return a + b; }, std::make_pair(3, 4));
  auto u = std::make_from_tuple<User>(std::tuple<int, const char*>{1, "ann"});
  auto all = std::tuple_cat(std::tuple<int>{1}, std::pair<int, int>{2, 3});
  static_assert(std::tuple_size_v<decltype(all)> == 3);
  std::printf("%d %s\n", sum, u.name.c_str());   // 7 ann
}
```

Together with a pack expansion, `apply` is how a stored argument pack is called later, which is the technique behind deferred-call machinery.

## The tuple protocol

Three things make a type tuple-like to the library and to structured bindings: a specialization of `std::tuple_size<T>`, a specialization of `std::tuple_element<I, T>`, and a `get<I>` found either as a member or by argument-dependent lookup. A structured binding uses the protocol whenever `tuple_size<E>` is a complete type, ahead of its rule for plain structs.

```cpp
#include <tuple>
#include <string>
#include <cstdio>

struct Employee {
  std::string name;
  int id;
  template <std::size_t I> auto& get() & {
    if constexpr (I == 0) return name; else return id;
  }
};

template <> struct std::tuple_size<Employee> : std::integral_constant<std::size_t, 2> {};
template <std::size_t I> struct std::tuple_element<I, Employee> {
  using type = std::remove_reference_t<decltype(std::declval<Employee&>().get<I>())>;
};

int main() {
  Employee e{"ann", 7};
  auto& [n, i] = e;
  std::printf("%s %d\n", n.c_str(), i);   // ann 7
}
```

You write this only when a plain struct's own members are not what you want to expose. For a simple aggregate, structured bindings already work without any of it.

### tuple-like in C++23

C++23 formalized the idea with an exposition-only concept, *tuple-like*. The standard types that satisfy it are `array`, `pair`, `tuple` and `ranges::subrange`, with `std::complex` added in C++26. Several operations then accept any of them: `tuple` and `pair` can be constructed and assigned from other tuple-likes, so a `tuple<int, int>` can be built from an `array<int, 2>` or a `pair<int, int>`, and `apply`, `tuple_cat` and `make_from_tuple` work on all of them. Library support arrived unevenly; libstdc++ in GCC 16 accepts these, but verify against your own standard library before relying on interconversion between `tuple` and `array`.

## Layout, and when to use a struct

The standard gives no layout guarantees for `tuple`. Members need not appear in order in memory, and implementations are free to use empty-base tricks to squeeze out empty members. Do not reinterpret a tuple as an array or as a struct.

The practical rule for choosing between a tuple and a struct is lifetime and meaning. Use a tuple or pair for a local, short-lived grouping such as a function returning two values, a key for a sorted container, or a stored argument pack. As soon as the fields cross an interface, give them names. `result.first` and `result.second` say nothing, an `std::pair<int, int>` for a point and one for an interval are interchangeable by accident, and adding a third field to a struct does not break every `get<1>` in your codebase. A named aggregate with `= default` comparison costs nothing at run time and decomposes with structured bindings anyway.

## What to remember

- Pair and tuple are structs with numbered members; their element-wise constructors are `explicit` only if some element conversion is.
- `piecewise_construct` plus `forward_as_tuple` builds each element in place, which is what `map::emplace` needs for non-movable mapped types.
- `make_tuple` copies and decays, `tie` makes lvalue references, `forward_as_tuple` makes forwarding references that dangle if you store them.
- Assigning tuples of references assigns the referents; C++23 adds `const` assignment so proxy tuples work.
- Comparison is lexicographic and `<=>` yields the weakest category of the elements, so a `double` element gives `partial_ordering`.
- `apply`, `make_from_tuple` and `tuple_cat` operate on any tuple-like type.
- The protocol is `tuple_size`, `tuple_element` and `get`; structured bindings use it before the struct rule.
- There is no layout guarantee. Name your fields once the data leaves the statement it was created in.
