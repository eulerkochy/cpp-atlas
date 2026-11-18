---
title: "Customization points and niebloids"
summary: "Generic code needs a way to call \"the right swap\" or \"the right begin\" for a type it has never seen. C++ moved from the ADL two-step to customization point objects and niebloids, function objects that do the lookup for you and cannot be hijacked by it, and settled on hidden friends as the way for types to plug in."
track: "algorithms-and-ranges"
minutes: 13
standard:
  - "[basic.lookup.argdep]"
  - "[customization.point.object]"
  - "[concept.swappable]"
  - "[range.access.begin]"
  - "[algorithms.requirements]"
  - "[hidden.friends]"
  - "[namespace.std]"
cppreference:
  - title: "Customization point object"
    path: "ranges/cpo"
  - title: "std::ranges::swap"
    path: "utility/ranges/swap"
  - title: "std::ranges::begin"
    path: "ranges/begin"
  - title: "Constrained algorithms (algorithm function objects)"
    path: "algorithm/ranges"
  - title: "Argument-dependent lookup"
    path: "language/adl"
  - title: "Extending the namespace std"
    path: "language/extending_std"
prerequisites:
  - "name-lookup-and-adl"
  - "concepts-and-constraints"
  - "template-instantiation-and-specialization"
---

## The one idea

A library function such as `sort` has to swap elements of a type it knows nothing about. The type's author may have written a fast `swap`, or may have written nothing, in which case three moves will do. Somebody has to decide which to call, and the decision must happen where the type's author can influence it without editing the library.

For twenty years the answer was argument-dependent lookup, used through an idiom every caller had to remember. C++20 moved the idiom into the library: `std::ranges::swap`, `std::ranges::begin` and their relatives are **customization point objects**, constant function objects whose call operator performs the right lookup, checks the result, and falls back sensibly. The constrained algorithms in `std::ranges` are function objects for a related reason: an object found by ordinary lookup switches ADL off.

> **Mental model.** A customization point object is the two-step idiom written once, correctly, inside the library. You call it with a qualified name; it does the unqualified, ADL-only call on your behalf.

How ADL decides which namespaces to search is covered in the name-lookup-and-adl topic. Here the question is how libraries use it.

## The ADL two-step and how it fails

The classic idiom brings `std::swap` into scope as a fallback and then makes an unqualified call, so ADL can find a better `swap` in the argument's namespace.

```cpp
#include <cstdio>
#include <utility>

namespace lib {
  struct Widget {
    int id;
    friend void swap(Widget& a, Widget& b) noexcept {
      std::puts("lib swap");
      std::swap(a.id, b.id);
    }
  };
}

template <class T> void good(T& a, T& b) { using std::swap; swap(a, b); }
template <class T> void bad(T& a, T& b) { std::swap(a, b); }

int main() {
  lib::Widget a{1}, b{2};
  good(a, b);  // prints lib swap
  bad(a, b);   // prints nothing: generic std::swap, three moves
}
```

Every part of the idiom can go wrong, and every failure compiles.

- **Qualifying the call.** `std::swap(a, b)` suppresses ADL, so the type's own `swap` is silently skipped. The code is correct but may be slow, or may lose an invariant the custom `swap` preserved.
- **Forgetting the using-declaration.** Without `using std::swap;`, the unqualified call finds nothing for `int` or for types without their own `swap`, and generic code breaks only for some instantiations.
- **No constraints.** Nothing checks that the function ADL found actually swaps, or that a `begin` found the same way returns an iterator.
- **Hijacking.** ADL searches every namespace associated with the argument types, including those of template arguments. An unconstrained function template with the right name in any of those namespaces can be a better match than the one you meant, or make the call ambiguous.

## Customization point objects

A customization point object, as [customization.point.object] describes it, is a constant function object of a literal, semiregular type. Its call operator is constrained, so a failed customization is a substitution failure rather than a hard error. Each one tries a fixed sequence of strategies and takes the first that is valid.

`std::ranges::swap(t, u)`, specified in [concept.swappable], tries:

1. An unqualified `swap(t, u)` when either argument has class or enumeration type, with overload resolution performed in a context that also sees a deleted `template<class T> void swap(T&, T&)`. That deleted candidate makes the unconstrained `std::swap` lose to an ambiguity, so only a genuine customization is chosen. If the function found does not exchange the values, the program is ill-formed, no diagnostic required.
2. Otherwise, for two lvalue arrays of equal extent, `ranges::swap_ranges`.
3. Otherwise, for two lvalues of the same move-constructible and move-assignable type, an exchange through moves, with a `noexcept` computed from the type.

`std::ranges::begin(t)` checks an array first, then a member `t.begin()`, then an ADL-only `begin(t)`, and in each case requires the result to model `input_or_output_iterator`. It also refuses an rvalue argument unless the type is a borrowed range, which the borrowed-ranges-and-dangling topic explains. `ranges::size` goes array extent, member `size()`, ADL `size()`, and finally `end - begin` for sized sentinels.

```cpp
#include <ranges>

namespace lib {
  struct Bag { int data[3]{1, 2, 3}; };
  int* begin(Bag& b) { return b.data; }   // found by ADL
  int* end(Bag& b) { return b.data + 3; }

  struct Both {
    int d[2]{};
    int* begin() { return d; }            // member wins
    int* end() { return d + 2; }
  };
  int* begin(Both&) = delete;             // never considered
}

static_assert(std::ranges::range<lib::Bag>);
static_assert(std::ranges::range<lib::Both>);
static_assert(!std::ranges::range<const lib::Bag>);  // no const overloads
```

C++20 originally specified deleted "poison pill" overloads for `begin`, `end`, `size` and their relatives as well. The defect report P2602 replaced those with a plain requirement that the lookup be argument-dependent only, which is how the C++23 wording reads.

> **Standardese.** [customization.point.object] says all instances of a customization point object's type are equal, and the effect of calling one does not depend on whether the object expression is an lvalue or an rvalue, const or not. That is what makes it safe to copy a CPO into an algorithm, or to call it through a reference.

## Why objects, and what niebloids are

Being an object matters for two reasons. The first is that an object can be passed around: `std::ranges::transform(vs, out, std::ranges::size)` works, while taking the address of most standard functions is unspecified since C++20. The second is about lookup. [basic.lookup.argdep] says that if ordinary unqualified lookup finds something that is not a function or function template, such as a variable, ADL is not performed at all. A CPO in scope therefore cannot be supplemented or hijacked by ADL, so `using std::ranges::swap; swap(a, b);` simply calls the object, which then does its own careful lookup internally.

The constrained algorithms, `std::ranges::sort`, `std::ranges::find` and the rest, rely on the same property. Eric Niebler's range-v3 library implemented them as function objects so they behave like this, and they acquired his name: **niebloids**. [algorithms.requirements] in C++20 and C++23 states the effect without demanding an implementation technique: these entities are not found by ADL, and when found by unqualified lookup they inhibit ADL. C++26, through P3136, specifies them directly as algorithm function objects.

```cpp
#include <algorithm>
#include <cstdio>
#include <vector>

namespace lib {
  struct Rec { int v; bool operator==(const Rec&) const = default; };
  template <class It, class T> It find(It, It last, const T&) { return last; }
}

void f(std::vector<lib::Rec>& v) {
  using std::ranges::find;
  auto it = find(v.begin(), v.end(), lib::Rec{1});  // std::ranges::find, ADL off
  (void)it;
  // With 'using std::find;' instead, ADL adds lib::find (lib is associated
  // through vector<lib::Rec>), and the call is ambiguous.
}
```

> **Pitfall.** A niebloid's constraints are stricter than the old algorithm's. `std::ranges::find` requires the element and the value to be comparable with `==` in the sense of `indirect_binary_predicate`, so code that compiled with `std::find` can fail with the `ranges` version until the types are fixed.

## tag_invoke, and why it was left behind

CPOs solved calling, but defining a new CPO meant reserving a new global name for ADL to search, such as `swap`, `begin`, `iter_move`. The tag_invoke proposal, P1895, generalized this: every customization goes through one ADL name, `tag_invoke`, and the CPO object itself is passed as the first argument to say which operation is meant.

```cpp
#include <type_traits>
#include <utility>

namespace my {
  struct tag_invoke_fn {
    template <class Tag, class... Args>
    constexpr auto operator()(Tag t, Args&&... args) const
        -> decltype(tag_invoke(t, std::forward<Args>(args)...)) {
      return tag_invoke(t, std::forward<Args>(args)...);
    }
  };
  inline constexpr tag_invoke_fn tag_invoke_cpo{};

  inline constexpr struct get_name_fn {
    template <class T>
    constexpr auto operator()(const T& t) const -> decltype(tag_invoke_cpo(*this, t)) {
      return tag_invoke_cpo(*this, t);
    }
  } get_name{};
}

struct Dog {
  friend const char* tag_invoke(decltype(my::get_name), const Dog&) { return "dog"; }
};

inline const char* dog_name() { return my::get_name(Dog{}); }  // "dog"
```

It works, and libraries such as libunifex and early drafts of `std::execution` used it widely. It was not adopted into the standard. Every customization of every operation joins one overload set named `tag_invoke`, which hurts compile times and produces error messages that list every candidate in sight. The definitions are hard to read and to search for. When `std::execution` was finalized for C++26 (P2300, revised by P2855), its customizations moved to member functions and environment queries instead. A language feature for customizable functions has been proposed and has not been adopted.

## How to customize today

For your own types, provide the operation as a **hidden friend**: a friend function defined inside the class. It lives in the enclosing namespace but is invisible to ordinary lookup, so only ADL with an argument of your type can find it. [hidden.friends] specifies that the friend functions the standard library itself declares inside its classes are hidden friends in exactly this sense.

```cpp
#include <cstdio>

namespace geo {
  struct Meters {
    double v;
    Meters(double d) : v(d) {}
    friend void print(Meters m) { std::printf("%g m\n", m.v); }
  };
}

int main() {
  geo::Meters m{2.0};
  print(m);         // OK: found by ADL
  // print(3.0);    // error: no argument of type Meters, so no ADL into geo
  // geo::print(m); // error: qualified lookup cannot see a hidden friend
}
```

Hidden friends keep overload sets small, avoid accidental conversions from unrelated types, and make compile errors shorter. Customization point objects find them, which is all most types need: a hidden `swap`, `begin` and `end`, `iter_move` and `iter_swap` for iterators.

Some customization still happens by specializing templates in `std`, and [namespace.std] limits it tightly.

- A **class template** may be specialized if the specialization depends on a program-defined type and meets the original's requirements: `std::hash`, `std::formatter`, `std::tuple_size`, `std::common_type`, `std::basic_common_reference`.
- The type traits in `<type_traits>` may not be specialized, apart from `common_type` and `basic_common_reference`. Specializing `std::is_integral` for your type is undefined behavior.
- A **variable template** may be specialized only where the standard says so, as for `std::ranges::enable_borrowed_range`, `enable_view`, `disable_sized_range` and `std::disable_sized_sentinel_for`.
- **Function templates** may no longer be specialized since C++20 (P0551). `template<> void std::swap(Widget&, Widget&)` was allowed before and is undefined behavior now. Adding overloads to `std` was never allowed.

## What to remember

- The two-step `using std::swap; swap(a, b);` works, but qualifying the call or forgetting the using-declaration silently does the wrong thing.
- Customization point objects perform the two-step for you, constrain the result, and fall back in a fixed order.
- `ranges::begin` tries array, member, then ADL; `ranges::swap` tries ADL `swap`, then arrays, then moves.
- Ordinary lookup finding an object disables ADL, so CPOs and niebloids cannot be hijacked.
- The `std::ranges` algorithms are niebloids: never found by ADL, and they inhibit it when found by unqualified lookup.
- `tag_invoke` funnelled all customization through one name and was dropped; C++26 `std::execution` uses members and queries.
- Customize with hidden friends; only ADL can find them.
- Specialize `std` class templates only for your own types, never type traits, and never function templates since C++20.
