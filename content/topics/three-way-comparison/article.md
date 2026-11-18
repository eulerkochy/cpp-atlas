---
title: "Three-way comparison"
summary: "C++20 lets one operator<=> answer less, equal or greater, and lets the compiler rewrite the other relational operators in terms of it. Equality stays separate, and the rewriting rules for == changed the meaning of some existing code."
track: "expressions-and-functions"
minutes: 13
standard:
  - "[expr.spaceship]"
  - "[cmp.categories]"
  - "[class.compare.default]"
  - "[class.eq]"
  - "[class.spaceship]"
  - "[over.match.oper]"
  - "[over.match.best]"
  - "[comparisons.three.way]"
cppreference:
  - title: "Default comparisons"
    path: "language/default_comparisons"
  - title: "Comparison operators"
    path: "language/operator_comparison"
  - title: "std::strong_ordering"
    path: "utility/compare/strong_ordering"
  - title: "std::partial_ordering"
    path: "utility/compare/partial_ordering"
  - title: "std::compare_three_way"
    path: "utility/compare/compare_three_way"
prerequisites:
  - "operator-overloading"
  - "overload-resolution"
---

## The one idea

Before C++20, a fully comparable type needed six operators, and they could disagree with each other. C++20 splits the job in two. **Ordering** is answered by one function, `operator<=>`, which returns a value saying less, equivalent, greater, or, for some types, unordered. **Equality** is answered by `operator==`. The compiler then rewrites `<`, `<=`, `>` and `>=` in terms of `<=>`, and `!=` in terms of `==`, and it is also allowed to swap the operands.

The two halves are deliberately independent. Writing `<=>` by hand does not give you `==`, because equality can often be answered far more cheaply than ordering: two strings of different lengths are unequal without looking at a single character.

> **Mental model.** You write at most two functions, `==` and `<=>`. The compiler derives the other four operators, and it tries each comparison with the operands in both orders.

## Comparison categories

The result of `<=>` is one of three class types from `<compare>`, and the type itself documents what kind of order you have.

| Category | Values | Meaning of "equivalent" |
|---|---|---|
| `std::strong_ordering` | `less`, `equal`, `greater` | interchangeable values |
| `std::weak_ordering` | `less`, `equivalent`, `greater` | same rank, possibly distinguishable |
| `std::partial_ordering` | `less`, `equivalent`, `greater`, `unordered` | some pairs cannot be compared |

A case-insensitive string comparison is a weak ordering: `"Abc"` and `"abc"` are equivalent but not identical. Floating-point numbers are partially ordered, because a NaN is neither less than, equal to, nor greater than anything, including itself.

Conversions only go towards weaker guarantees. A `strong_ordering` converts implicitly to `weak_ordering` and to `partial_ordering`, and a `weak_ordering` converts to `partial_ordering`. Nothing converts the other way, because that would invent a guarantee.

You use a result by comparing it with the literal `0`: `r < 0` means less, `r == 0` means equal or equivalent. The standard says comparing a category value with anything other than a literal zero is undefined behaviour; library implementations make the parameter a type that only a literal `0` converts to, so `r == 1` is rejected in practice. The named functions `std::is_lt`, `std::is_eq` and friends say the same thing in words.

```cpp
#include <compare>
#include <cmath>

void demo() {
  double nan = std::nan("");
  auto r = nan <=> 1.0;            // std::partial_ordering::unordered
  bool all_false = !(r < 0) && !(r == 0) && !(r > 0);   // true
  (void)all_false;
}
```

## The built-in `<=>`

For integers, enumerations and pointers, the built-in `<=>` yields `std::strong_ordering`. For floating-point operands it yields `std::partial_ordering`. Arithmetic operands go through the usual arithmetic conversions first, but with a twist that makes `<=>` stricter than `<`: if the conversion would be narrowing, other than integer to floating point, the program is ill-formed.

```cpp
#include <compare>

bool old_way = -1 < 1u;              // compiles: -1 becomes a huge unsigned, so false
// auto new_way = -1 <=> 1u;         // ill-formed: int to unsigned is narrowing
```

When the narrowing operand is a variable rather than a constant, Clang rejects it but GCC only warns by default and needs `-pedantic-errors` to reject it, so do not use GCC's acceptance as evidence. For pointers, the built-in comparison has an unspecified result for pointers into unrelated objects, just as `<` does.

## Defaulted `<=>` and `==`

`= default` asks the compiler to compare memberwise. A defaulted `operator==` compares base subobjects in declaration order, then non-static data members in declaration order, and stops at the first inequality. A defaulted `operator<=>` does the same with `<=>`, returning the first result that is not equal.

If you declare `auto operator<=>(const T&) const = default;` and do not declare any `operator==`, the compiler also declares a defaulted `operator==` for you. That is the only way `==` comes from `<=>`, and it is still memberwise `==`, not a call to `<=>`.

```cpp
#include <compare>

struct Version {
  int major, minor, patch;
  auto operator<=>(const Version&) const = default;   // also declares == = default
};

static_assert(Version{1, 2, 3} < Version{1, 3, 0});
static_assert(Version{1, 2, 3} == Version{1, 2, 3});
```

With an `auto` return type, the result is the common comparison category of all the member comparisons: one `double` member makes the whole thing `std::partial_ordering`. If some member has no usable `<=>`, the defaulted `operator<=>` with `auto` is defined as deleted.

If you name the return type instead, the compiler is allowed to fall back on `==` and `<` for members that lack `<=>`. [class.spaceship] calls this the synthesized three-way comparison: it uses `<=>` when available and otherwise builds the requested category from `a == b` and `a < b`. That is how a C++20 type can wrap a pre-C++20 type that only has `<` and `==`.

```cpp
#include <compare>

struct Legacy {
  int v;
  bool operator<(const Legacy& o) const { return v < o.v; }
  bool operator==(const Legacy& o) const { return v == o.v; }
};

struct Bad  { Legacy l; auto operator<=>(const Bad&) const = default; };   // deleted
struct Good { Legacy l; std::weak_ordering operator<=>(const Good&) const = default; };
```

A defaulted comparison is also deleted when the class has a reference member or is a union-like class, since there is no obvious meaning to compare.

> **Pitfall.** A hand-written `operator<=>` gives you `<`, `<=`, `>` and `>=` but not `==` or `!=`. Add `bool operator==(const T&) const = default;` or write `==` yourself.

## Rewritten and reversed candidates

For a relational expression `a < b`, overload resolution considers, in addition to every `operator<`, the rewritten candidates `(a <=> b) < 0` and, reversed, `0 < (b <=> a)`. For `a != b` it considers `!(a == b)` and `!(b == a)`. For `a == b` it adds the reversed `b == a`. This is why one member `operator==(int) const` makes both `s == 42` and `42 == s` work.

```cpp
#include <compare>

struct Id {
  int v;
  constexpr bool operator==(int x) const { return v == x; }
  constexpr std::strong_ordering operator<=>(int x) const { return v <=> x; }
};

static_assert(42 == Id{42});    // reversed: Id{42} == 42
static_assert(42 >  Id{7});     // rewritten: 0 > (Id{7} <=> 42)
static_assert(Id{1} != 2);      // rewritten: !(Id{1} == 2)
```

When a rewritten or reversed candidate ties with an ordinary one on conversions, [over.match.best] prefers the ordinary candidate, and prefers a non-reversed rewrite over a reversed one. A rewritten `!=` or reversed `==` must return `bool`; if the selected `operator==` returns something else, the program is ill-formed.

> **Standardese.** [over.match.oper] defines the rewritten candidates. For `x < y` and the other relational operators they are the `operator<=>` functions, tried as `x <=> y` and reversed as `y <=> x`. For `x != y` they are the `operator==` functions, tried both ways round. For `x == y` they are the reversed `y == x`, and for `x <=> y` the reversed `y <=> x`, used as `0 <=> (y <=> x)`.

## What C++20 broke

Reversed candidates are added silently to code written before C++20, and some of that code changed meaning. The classic case is a member `operator==` that forgot `const`:

```cpp
struct S {
  int v;
  bool operator==(const S& o) { return v == o.v; }   // not const
};

bool same(S a, S b) { return a == b; }
```

For `a == b`, the ordinary candidate binds `a` to the non-const object parameter exactly and `b` to `const S&`. The reversed candidate does the opposite. Each is better for one argument, so by the C++20 rules the call is ambiguous. GCC and Clang accept it with a warning and pick the ordinary candidate; the fix is to make the operator `const`.

P2468, adopted for C++23 and applied by compilers as a defect report against C++20, added an escape hatch for code like this: if a matching `operator!=` is declared in the same scope as an `operator==`, that `operator==` is not used for reversed or rewritten candidates. A pre-C++20 class that defines both operators keeps its old behaviour.

## Library support

`std::compare_three_way` is a function object whose call operator computes `a <=> b`, constrained on the `std::three_way_comparable_with` concept. For pointers it gives an implementation-defined strict total order even where the built-in `<=>` is unspecified, which is what you want as a container key.

The library also has an exposition-only helper, *synth-three-way*, used to define `<=>` for `std::pair`, `std::tuple`, `std::array` and the other containers. It calls `<=>` when the element type has one and otherwise falls back to `<`, producing `std::weak_ordering`. So a `std::pair<Legacy, int>` supports `<=>` even though `Legacy` does not. This is related to, but not the same as, the core language's synthesized three-way comparison, which only applies when a defaulted `<=>` names its return type.

For floating point, `std::strong_order` provides the IEEE total order in which every NaN has a place, and `std::weak_order` and `std::partial_order` give the corresponding weaker orders. What a comparator must satisfy to be used by sorting algorithms is the subject of strict-weak-ordering-and-comparators.

## What to remember

- `<=>` answers ordering, `==` answers equality; the compiler rewrites `<`, `<=`, `>`, `>=` from the first and `!=` from the second.
- `strong_ordering` converts to `weak_ordering` converts to `partial_ordering`, never backwards.
- Compare a category value only with literal `0`, or use `std::is_lt` and friends.
- Built-in `<=>` on floating point is `partial_ordering`; NaN gives `unordered`, and every relational test is false.
- `-1 <=> 1u` is ill-formed because the conversion narrows, even though `-1 < 1u` compiles.
- A hand-written `<=>` does not provide `==`; only a defaulted `<=>` implicitly declares a defaulted `==`.
- Defaulted `<=>` with `auto` is deleted if a member lacks `<=>`; naming the return type lets it fall back on `==` and `<`.
- Reversed candidates make `42 == s` work, and can make non-const member `operator==` ambiguous.
- A matching `operator!=` suppresses rewriting for that `operator==` (P2468).
