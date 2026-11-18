---
title: "Borrowed ranges and dangling"
summary: "An iterator is only valid while the thing it points into is alive. Borrowed ranges are the ranges whose iterators survive the range object, and the ranges library uses that property to turn many dangling iterators into compile errors, but views, pipelines and range-based for loops still leave plenty of ways to dangle."
track: "algorithms-and-ranges"
minutes: 13
standard:
  - "[range.range]"
  - "[range.dangling]"
  - "[range.ref.view]"
  - "[range.owning.view]"
  - "[stmt.ranged]"
  - "[class.temporary]"
cppreference:
  - title: "std::ranges::borrowed_range"
    path: "ranges/borrowed_range"
  - title: "std::ranges::dangling"
    path: "ranges/dangling"
  - title: "std::ranges::borrowed_iterator_t"
    path: "ranges/borrowed_iterator_t"
  - title: "std::ranges::owning_view"
    path: "ranges/owning_view"
  - title: "Range-based for loop"
    path: "language/range-for"
prerequisites:
  - "ranges-and-views"
  - "reference-binding-and-temporaries"
  - "object-lifetime-and-storage"
---

## The one idea

Ask a `std::vector` for an iterator and you get a pointer into storage the vector owns. Destroy the vector and the iterator dangles. Ask a `std::string_view` for an iterator and you get a pointer into storage the view merely refers to. Destroy the view and the iterator is still fine, because the characters were never the view's to free.

A range of the second kind is a **borrowed range**: its iterators' validity is not tied to the lifetime of the range object. The ranges library uses this property to decide what an algorithm may safely return when you pass it a temporary.

> **Mental model.** Before keeping an iterator, ask who owns the elements. If the answer is the range object you are about to destroy, the iterator dies with it. If the answer is someone else, the range was only borrowing them, and the iterator lives as long as that someone else.

## `borrowed_range` and opting in

The concept is short:

```cpp
#include <ranges>
#include <type_traits>

template <class R>
concept my_borrowed_range =
    std::ranges::range<R> &&
    (std::is_lvalue_reference_v<R> ||
     std::ranges::enable_borrowed_range<std::remove_cvref_t<R>>);
```

An lvalue reference is always borrowed, because the caller still owns the object after the call. For anything else, the type must opt in by specializing `enable_borrowed_range`, a variable template that is `false` by default. The specialization is a promise you make, not something the compiler checks.

```cpp
#include <ranges>

struct IntSpan {                 // refers to someone else's ints
  int* b; int* e;
  int* begin() const { return b; }
  int* end() const { return e; }
};

template <>
inline constexpr bool std::ranges::enable_borrowed_range<IntSpan> = true;

static_assert(std::ranges::borrowed_range<IntSpan>);
```

> **Standardese.** [range.range] defines `borrowed_range` and says a type models it only if the validity of iterators obtained from an object of that type is not tied to the lifetime of that object. A false specialization of `enable_borrowed_range` satisfies the concept without modeling it, and the program is then ill-formed, no diagnostic required.

## `ranges::dangling`: compile errors instead of crashes

Every `std::ranges` algorithm that returns an iterator into its range argument uses `std::ranges::borrowed_iterator_t<R>` as the return type. That alias is `iterator_t<R>` when `R` is a borrowed range and `std::ranges::dangling` otherwise. Algorithms returning a subrange use `borrowed_subrange_t<R>` in the same way.

`dangling` is an empty struct that can be constructed from anything and does nothing else. It has no `operator*`, no `operator++` and no comparisons, so the moment you try to use the result, the compiler stops you.

```cpp
#include <algorithm>
#include <vector>

std::vector<int> get() { return {3, 1, 2}; }

void demo() {
  auto it = std::ranges::find(get(), 2);   // it is std::ranges::dangling
  // int x = *it;                          // ill-formed: dangling has no operator*
  auto old = std::find(get().begin(), get().end(), 2);
  // compiles, but compares iterators into two different temporaries: UB
  (void)it; (void)old;
}
```

When you do get `dangling`, the fix is almost never to fight the type. Either give the container a name, so that it is passed as an lvalue and outlives the iterator, or, if you only needed a yes-or-no answer, use an algorithm that returns a value, such as `std::ranges::contains` in C++23 or `std::ranges::any_of`. The same applies to subranges: `std::ranges::equal_range(get(), 2)` returns `dangling` where a named vector would give a `subrange` of matching elements.

The protection is only for iterators. Algorithms that return values are unaffected, so `std::ranges::min(get())` returns `1` by value and is perfectly safe. The algorithm also still runs: `dangling` only tells you the result is unusable, it does not skip the work.

## Which standard ranges are borrowed

The standard specializes `enable_borrowed_range` to `true` for:

- `std::basic_string_view` and `std::span`, which refer to elements owned elsewhere;
- `std::ranges::subrange`, which is just an iterator and a sentinel;
- `std::ranges::ref_view`, which holds a pointer to a range that outlives it;
- `std::ranges::empty_view` and `std::ranges::iota_view`, whose iterators carry everything they need, so an `iota_view` iterator holds the current integer itself.

Several adaptors are borrowed exactly when the view they adapt is, because their iterators are just the underlying iterators with a little extra state: `take_view`, `drop_view`, `drop_while_view`, `common_view`, `reverse_view`, `elements_view`, `owning_view`, and in C++23 `adjacent_view` and `zip_view`. `transform_view` and `filter_view` are never borrowed, because their iterators point back into the view object to reach the function or predicate. Containers such as `std::vector` and `std::string` are not borrowed.

```cpp
#include <algorithm>
#include <cstdio>
#include <ranges>
#include <string_view>

void demo() {
  auto a = std::ranges::find(std::string_view("hello"), 'l');  // a real iterator
  auto b = std::ranges::find(std::views::iota(0, 10), 4);      // also fine
  std::printf("%c %d\n", *a, *b);                               // prints l 4
}
```

## Temporaries in views and pipelines

Since P2415, applied to C++20 as a defect report, `views::all` moves an rvalue container into an `owning_view`. A pipeline that starts from a temporary container therefore owns it and cannot dangle.

```cpp
#include <ranges>
#include <vector>

std::vector<int> get();

void demo() {
  auto ok = get() | std::views::filter([](int x) { return x > 1; });
  // ok owns the vector; safe to iterate later
}
```

Owning is not the same as borrowing, though. The view owns the elements, so iterators into it die when the view does; `owning_view` of a vector is not a borrowed range.

The protection disappears when the temporary is hidden behind a reference. If a function returns a reference to a member of a temporary, the pipeline sees an lvalue, wraps it in `ref_view`, and the object behind it is destroyed at the end of the full-expression. The same happens with `std::string_view` built from a temporary `std::string`: `string_view` is borrowed, but only from the string, which is already gone. Clang 21 warns about that one with `-Wdangling-gsl`; neither GCC 16 nor Clang warns about the `take` line.

```cpp
#include <ranges>
#include <string>
#include <string_view>
#include <vector>

struct Holder {
  std::vector<int> v;
  const std::vector<int>& items() const { return v; }
};
Holder make();

void demo() {
  auto bad = make().items() | std::views::take(2);  // ref_view to a dead member
  std::string_view sv = std::string("temporary");   // dangles immediately
  (void)bad; (void)sv;
}
```

## Range-based for and the C++23 lifetime fix

A range-based `for` binds its initializer to `auto&& __range`. Reference binding extends the lifetime of a temporary that is bound directly, so `for (int x : get())` is fine. Before C++23, any other temporary in the initializer was destroyed at the end of that full-expression, before the loop body ran.

```cpp
#include <vector>

struct Holder {
  std::vector<int> v{1, 2, 3};
  const std::vector<int>& items() const { return v; }
};
Holder make() { return {}; }

void demo() {
  for (int x : make().items()) (void)x;
  // C++20: UB, the Holder is destroyed before the first iteration
  // C++23: OK, the Holder lives until the loop ends (P2718)
}
```

The trap is easy to fall into with ordinary-looking accessors. `for (auto& e : load().value())` on a function returning `std::optional<std::vector<T>>`, `for (char c : make_person().name())` with a getter returning `const std::string&`, and `for (auto& kv : config()["section"])` on a temporary map all bind `__range` to something inside a temporary that dies before the first iteration.

C++23 adopted P2718, which extends the lifetime of every temporary created in the for-range-initializer to the end of the loop. GCC 16 and Clang 21 both implement it in `-std=c++23` mode and print the destructor after the loop body; in `-std=c++20` mode they destroy the `Holder` first. The fix applies only to range-based `for`. Writing `auto& r = make().items();` on its own line still dangles in every version.

> **Pitfall.** P2718 is not applied retroactively. Code that relies on it is correct only when compiled as C++23 or later, and the failure in older modes is silent undefined behavior that often appears to work.

## Returning views from functions

A view that refers to a local is a view of a dead object once the function returns. Compilers do not warn about it, because the view type holds a pointer, not a reference.

```cpp
#include <ranges>
#include <vector>

auto evens_bad() {
  std::vector<int> v{1, 2, 3, 4};
  return v | std::views::filter([](int x) { return x % 2 == 0; });  // ref_view: dangles
}

auto evens_ok() {
  std::vector<int> v{1, 2, 3, 4};
  return std::move(v) | std::views::filter([](int x) { return x % 2 == 0; });  // owning_view
}
```

The same reasoning applies to everything a view stores. A lambda passed to `filter` or `transform` is stored by value in the view, but if the lambda captures locals by reference, those references dangle when the function returns. Capture by value instead.

A function that returns a view of its parameter is fine when the parameter is an lvalue reference to the caller's object, and the caller then owns the lifetime question. Taking `const std::vector<int>&` is dangerous because it also binds to temporaries. A forwarding reference passed through `std::views::all(std::forward<R>(r))` handles both cases: lvalues become `ref_view`, rvalues become `owning_view`.

When a function exists to expose part of an object that outlives the call, a return type of `std::span` or `std::string_view` makes the borrowing visible in the signature, so every reader knows to ask who owns the elements. A return type of `auto` hides whether the result owns its data, refers to it, or holds references inside stored lambdas, so it deserves a comment saying which.

## What to remember

- A borrowed range is one whose iterators do not depend on the range object staying alive.
- Lvalue references are always borrowed; other types opt in with `enable_borrowed_range`, unchecked.
- `ranges::` algorithms return `ranges::dangling` for non-borrowed rvalues, which fails at the first use; legacy `std::` algorithms give no such protection.
- `string_view`, `span`, `subrange`, `ref_view`, `empty_view` and `iota_view` are borrowed; `transform_view`, `filter_view` and containers are not.
- A pipeline starting from a temporary container owns it through `owning_view`; a reference to a member of a temporary does not.
- Before C++23, temporaries in a range-for initializer other than the outermost die before the loop; C++23 P2718 keeps them alive.
- Never return a view of a local; move the container in, and capture by value in lambdas stored in views.
