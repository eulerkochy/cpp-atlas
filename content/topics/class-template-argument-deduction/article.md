---
title: "Class template argument deduction"
summary: "Since C++17 you can name a class template without arguments and let the initializer decide them. The compiler turns every constructor and deduction guide into a fictional function template, runs overload resolution against them, and uses the winner's return type; the surprises come from which fictional function wins."
track: "templates"
minutes: 13
standard:
  - "[over.match.class.deduct]"
  - "[temp.deduct.guide]"
  - "[dcl.type.class.deduct]"
  - "[over.match.best]"
  - "[over.match.list]"
  - "[temp.deduct.call]"
  - "[dcl.init.aggr]"
cppreference:
  - title: "Class template argument deduction (CTAD)"
    path: "language/class_template_argument_deduction"
  - title: "Deduction guides for std::vector"
    path: "container/vector/deduction_guides"
  - title: "Deduction guides for std::pair"
    path: "utility/pair/deduction_guides"
  - title: "Aggregate initialization"
    path: "language/aggregate_initialization"
prerequisites:
  - "template-argument-deduction"
  - "initialization-forms"
  - "overload-resolution"
---

## The one idea

When a declaration names a class template without an argument list, as in `std::pair p(1, 2.0);`, the compiler has to invent the arguments. It does so with machinery you already know. Every constructor of the primary template, and every deduction guide, becomes a fictional function template whose return type is the class specialization it would produce. The initializer is treated as the argument list of a call to that overload set. Ordinary template argument deduction and overload resolution pick one candidate, and its return type is the type of the variable.

Only then does real initialization happen, using the real constructors of the deduced type. Deduction chooses a type; it does not choose the constructor that runs.

> **Mental model.** CTAD is overload resolution over a set of imaginary factory functions, one per constructor plus one per guide plus a copy candidate. If you can predict which imaginary factory wins, you can predict the type.

## Implicit guides from constructors

For each constructor of the primary template, [over.match.class.deduct] forms a function template whose template parameters are the class's parameters followed by the constructor's own, whose function parameters are the constructor's, and whose return type is the class specialization. Constructors of partial or explicit specializations are not used. If the class declares no constructors, a hypothetical default constructor is used instead, which is how `template <class T = int> struct X {}; X x;` deduces `X<int>`.

```cpp
template <class T>
struct Pt {
  T x, y;
  Pt(T a, T b) : x(a), y(b) {}   // implicit guide: template <class T> Pt(T, T) -> Pt<T>
};

Pt p(1, 2);         // Pt<int>
auto r = Pt(3, 4);  // functional cast: also Pt<int>
// Pt q(1, 2.0);    // error: T deduced as both int and double
```

Because the implicit guides take parameters by the same types as the constructors, they inherit the constructors' deduction behaviour. One rule is deliberately different: a constructor parameter `T&&` where `T` is a class template parameter is not a forwarding reference during CTAD. With `Holder(T&&)` as the only constructor, `Holder h(i);` for an lvalue `i` deduces `T = int` and then fails to bind `int&&` to `i`. The forwarding-references topic explains the rule this exclusion switches off.

## User-defined deduction guides

When constructors do not carry enough information, you write a guide. It looks like a function declaration with a trailing return type and the class template's name in place of a function name. It must be declared in the same scope as the class template, it has no body, and it can be a template or not.

```cpp
#include <iterator>
#include <string>
#include <vector>

template <class T> struct Bag {
  std::vector<T> items;
  template <class It> Bag(It b, It e) : items(b, e) {}  // T is not deducible from It
};
template <class It>
Bag(It, It) -> Bag<typename std::iterator_traits<It>::value_type>;

template <class T> struct Name { T value; Name(T v) : value(v) {} };
Name(const char*) -> Name<std::string>;  // non-template guide

void demo() {
  int a[] = {1, 2, 3};
  Bag b(a, a + 3);  // Bag<int>
  Name n("Ada");    // Name<std::string>, not Name<const char*>
}
```

The standard library uses exactly this: `std::vector` has an iterator-pair guide, and `std::pair` has `pair(T1, T2) -> pair<T1, T2>`. Its parameters are by value, so arguments decay: `std::pair p{1, "hi"}` is `std::pair<int, const char*>`, not a pair holding an array.

A guide is also the repair for the `Holder(T&&)` problem from the previous section. A guide's template parameters are its own, not the class's, so in `template <class U> Holder(U&&) -> Holder<std::remove_cvref_t<U>>;` the parameter is a genuine forwarding reference, and an lvalue `int` deduces `Holder<int>`. The constructor that then runs must still accept an lvalue, so such classes usually pair the guide with a constructor template.

A guide only names the result. If it names a type whose constructors cannot accept the initializer, deduction succeeds and initialization then fails, with an error that points at a constructor rather than at the guide.

> **Standardese.** [over.match.best] adds CTAD-specific tiebreakers that apply only after conversion sequences and partial ordering fail to separate two candidates: a candidate generated from a user-defined guide beats one generated from a constructor, the copy deduction candidate beats other constructor-generated candidates, and one generated from a non-template constructor beats one from a constructor template.

## The copy deduction candidate: copying beats wrapping

Besides constructors and guides, the set always contains a copy deduction candidate, built from a hypothetical constructor `C(C)`: in effect `template <class T> C(C<T>) -> C<T>`. Given an existing `std::vector<int> other`, both of these are candidates for `std::vector v{other};`:

```text
initializer_list ctor:  vector(initializer_list<T>)  ->  T = vector<int>   (wraps)
copy deduction:         vector(vector<T>)            ->  T = int           (copies)
```

List-initialization normally tries initializer-list constructors first, which would make `v` a `std::vector<std::vector<int>>` of one element. C++17, through P0702, added a rule to stop that: when the braced list consists of a single element whose type is a specialization of the class template, or a class derived from one, the initializer-list phase is skipped. The copy deduction candidate then wins, and `v` is a copy.

```cpp
#include <type_traits>
#include <vector>

void demo() {
  std::vector<int> other{1, 2, 3};
  std::vector v{other};         // std::vector<int>: a copy of other
  std::vector w{other, other};  // std::vector<std::vector<int>>: two elements
  static_assert(std::is_same_v<decltype(v), std::vector<int>>);
  static_assert(std::is_same_v<decltype(w), std::vector<std::vector<int>>>);
}
```

The same rule applies to `std::optional o{opt};` and `std::tuple t{tup};`, which copy rather than nest. Generic code that wraps whatever it is given, such as `std::vector v{x};` for an arbitrary `x`, changes meaning when `x` happens to be a vector. Spell the type out in generic code.

> **Pitfall.** Adding one element to a braced list flips the result from "copy" to "container of containers". Code that builds `std::vector{a}` and `std::vector{a, b}` from the same kind of value gets two unrelated element types.

## Braces, parentheses and initializer lists

Apart from the single-element rule, CTAD follows normal initialization: with braces, initializer-list constructors get first claim. That turns an innocent iterator pair into a vector of iterators.

```cpp
#include <string>
#include <type_traits>
#include <vector>

void demo() {
  std::string s = "hello";
  std::vector a(s.begin(), s.end());  // std::vector<char>, five elements
  std::vector b{s.begin(), s.end()};  // std::vector<std::string::iterator>, two elements
  std::vector c(3, 1);                // std::vector<int>{1, 1, 1}
  std::vector d{3, 1};                // std::vector<int>{3, 1}
  static_assert(std::is_same_v<decltype(b), std::vector<std::string::iterator>>);
}
```

`explicit` matters too. Guides generated from `explicit` constructors are explicit, a user-defined guide can be declared `explicit`. In copy-initialization without braces, explicit candidates are not considered at all; in copy-list-initialization they are considered, and choosing one makes the program ill-formed. With `explicit Box(const char*) -> Box<std::string>;`, the direct-initialization `Box a("hi");` gives `Box<std::string>`, but `Box b = "hi";` ignores the guide and deduces `Box<const char*>` from the constructor.

## Aggregates, aliases and inherited constructors

C++20 extended CTAD in two directions, and C++23 in a third.

**Aggregates (C++20).** An aggregate class template has no constructors to generate guides from. For an aggregate, the compiler now forms an aggregate deduction candidate whose parameters are the element types matched to the initializer's elements. It works for braced initialization and for C++20 parenthesized aggregate initialization.

```cpp
template <class T> struct Agg { T a; T b; };

Agg x{1, 2};      // Agg<int> in C++20; ill-formed in C++17 without a guide
Agg y(1, 2);      // also Agg<int>, via parenthesized aggregate initialization
// Agg z{1, 2.0}; // error: T deduced as both int and double
```

`std::array` predates this and keeps its own guide, which requires all elements to have the same type.

**Alias templates (C++20).** Naming an alias template without arguments now deduces too. The compiler takes the guides of the aliased class template, deduces the alias's parameters from each guide's return type, and keeps the guides for which that works. Given `template <class T> using Vec = std::vector<T>;`, the declaration `Vec v{1, 2, 3};` deduces `std::vector<int>`. GCC and Clang both implement this.

**Inherited constructors (C++23).** P2582 makes constructors inherited with a using-declaration contribute guides to the derived class template. Given `template <class T> struct Derived : Base<T> { using Base<T>::Base; };`, the declaration `Derived d(42);` deduces `Derived<int>` from `Base(T)`. GCC implements this from version 14; Clang 21 does not yet, so portable code still needs explicit guides.

## What CTAD will not do

CTAD is all or nothing. `std::pair<int> p{1, 2.0};` is not "deduce the second argument": once an argument list is present, no deduction happens, and a `pair` with one argument is simply wrong. `Foo<> f;` is also not CTAD; it explicitly asks for all defaults. If you want to fix some arguments and deduce others, write a factory function or an alias template that fixes them.

CTAD is also limited to certain declarations. [dcl.type.class.deduct] allows a deduced class type in a variable declaration with an initializer, a functional cast, a `new` expression, and, since C++20, the type of a non-type template parameter. It is not allowed for non-static data members, even with a default member initializer, nor for function parameters or return types.

```cpp
#include <vector>

struct S {
  // std::vector v{1, 2};   // error: no CTAD for non-static data members
  std::vector<int> v{1, 2};
};
```

## What to remember

- CTAD is overload resolution over fictional functions: one per constructor of the primary template, one per guide, plus the copy deduction candidate.
- The winner only chooses the type; the real constructors of that type then perform initialization.
- A class template's `T&&` constructor parameter is not a forwarding reference during CTAD.
- Guides have no body, live in the class template's scope, may be non-templates, and may be `explicit`; `T x = init;` ignores explicit guides, and `T x = {init};` is ill-formed if one wins.
- A braced list with one element of the same template's type copies; `std::vector v{other}` is a copy, `std::vector v{other, other}` nests.
- With braces, initializer-list constructors win, so `std::vector{s.begin(), s.end()}` holds two iterators.
- C++20 added aggregate CTAD and alias template CTAD; C++23 added inherited constructors, which Clang 21 does not implement.
- No partial deduction, and no CTAD for data members or function parameters.
