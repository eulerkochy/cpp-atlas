---
title: "Ranges and views"
summary: "A range is anything you can call ranges::begin and ranges::end on; a view is a range cheap enough to pass by value and compose lazily. Views compute on demand, may cache, and refer to data they usually do not own, which explains both their power and their sharp edges."
track: "algorithms-and-ranges"
minutes: 14
standard:
  - "[range.range]"
  - "[range.sized]"
  - "[range.view]"
  - "[range.refinements]"
  - "[range.all]"
  - "[range.ref.view]"
  - "[range.owning.view]"
  - "[range.filter.view]"
  - "[range.utility.conv.to]"
  - "[stmt.ranged]"
cppreference:
  - title: "Ranges library"
    path: "ranges"
  - title: "std::ranges::view"
    path: "ranges/view"
  - title: "std::views::all"
    path: "ranges/all_view"
  - title: "std::ranges::owning_view"
    path: "ranges/owning_view"
  - title: "std::ranges::filter_view"
    path: "ranges/filter_view"
  - title: "std::ranges::to"
    path: "ranges/to"
prerequisites:
  - "iterator-categories-and-concepts"
  - "concepts-and-constraints"
  - "algorithms"
---

## The one idea

A **range** is an object you can ask for a beginning and an end. A **view** is a range with one extra promise: moving it, destroying it, and copying it if it is copyable are cheap, independent of how many elements it presents. That promise is what lets views be passed by value, stored inside other views, and stacked into pipelines without anyone worrying about cost.

Most views do not hold elements. They hold a way to reach elements, such as a reference to a container plus a function, and they do their work only when you iterate.

> **Mental model.** A container is a warehouse. A view is a set of directions to the warehouse, with instructions for what to do with each item you find. Directions are cheap to copy, they do nothing until followed, and they lead nowhere once the warehouse is gone.

## The range concept family

`std::ranges::range<R>` requires that `std::ranges::begin` and `std::ranges::end` work on an lvalue of type `R`. The two may return different types: the end is a **sentinel**, which only has to be comparable with the iterator. Semantically, both calls must be amortized constant time, which matters for the caching discussed below.

Refinements add one property each:

| Concept | Adds |
| --- | --- |
| `input_range` through `contiguous_range` | the iterator models the matching iterator concept |
| `sized_range` | `ranges::size(r)` works in amortized constant time |
| `common_range` | iterator and sentinel have the same type |
| `borrowed_range` | iterators stay valid after the range object dies |
| `view` | cheap move and destruction, opted in through `enable_view` |
| `viewable_range` | can be safely converted to a view with `views::all` |
| `constant_range` (C++23) | elements cannot be modified through the iterators |

The associated types follow the iterator ones: `std::ranges::iterator_t<R>`, `sentinel_t<R>`, `range_value_t<R>`, `range_reference_t<R>`, and `range_size_t<R>`.

Not every view is sized or common. `views::iota(0)` has no end value, so its sentinel is a distinct type and it is not common. `views::filter` cannot know how many elements pass without looking, so `ranges::size` on it does not compile.

## What makes a view

The `view` concept is `range<T> && movable<T> && enable_view<T>`. The syntactic part is cheap; the meaning lives in the semantic requirements. A type models `view` only if move construction is constant time, copy construction, when available, is constant time, copy assignment costs no more than destroying and copy-constructing, and destroying N copies or moved-from copies of a view over M elements costs O(N + M).

Opting in is done by deriving from `std::ranges::view_interface<D>`, which also supplies `empty()`, `front()`, `operator[]` and similar helpers, or from `std::ranges::view_base`, or by specializing `enable_view`. The standard specializes it for `std::string_view` and `std::span`. A `std::vector` is a range but not a view, because copying it copies every element.

```cpp
#include <ranges>
#include <span>
#include <string_view>
#include <vector>

static_assert(std::ranges::view<std::string_view>);
static_assert(std::ranges::view<std::span<int>>);
static_assert(!std::ranges::view<std::vector<int>>);   // copying is O(n)
```

The rules were loosened after C++20 shipped, by papers applied as defect reports to C++20 itself. P2325R3 removed the requirement that views be default-constructible. P2415R2 replaced "destruction is constant time" with the O(N + M) rule above, which allows a view to own its elements as long as it cannot be copied. That made `std::ranges::owning_view` possible: a move-only view that holds a container by value.

> **Standardese.** [range.view] states the complexity requirements as semantic constraints. A type can satisfy `view` syntactically and still fail to model it. By [res.on.requirements], a program that relies on a concept being modeled when it is only satisfied is ill-formed, no diagnostic required, so the compiler will not save you.

## `views::all`, `ref_view` and `owning_view`

Every range adaptor starts by turning its input into a view with `views::all`. The rule has three steps:

1. If the argument, decayed, is already a view, copy or move it.
2. Otherwise, if it is an lvalue, wrap it in `std::ranges::ref_view`, which stores a pointer to the range.
3. Otherwise, it is an rvalue container, so move it into an `std::ranges::owning_view`.

```cpp
#include <ranges>
#include <string_view>
#include <type_traits>
#include <vector>

std::vector<int> v{1, 2, 3};
using A = decltype(std::views::all(v));
using B = decltype(std::views::all(std::vector<int>{}));
using C = decltype(std::views::all(std::string_view{}));

static_assert(std::is_same_v<A, std::ranges::ref_view<std::vector<int>>>);
static_assert(std::is_same_v<B, std::ranges::owning_view<std::vector<int>>>);
static_assert(std::is_same_v<C, std::string_view>);
```

This is the meaning of `viewable_range`: a range that `views::all` accepts. Before P2415, step three did not exist, and piping a temporary vector into an adaptor was ill-formed. The lifetime consequences of all three cases belong to the topic on borrowed ranges and dangling.

## Lazy evaluation

Building a pipeline evaluates nothing. Each dereference of a `views::transform` iterator calls the function again, and a `views::filter` iterator evaluates its predicate as it advances. Iterating the same view twice repeats the work.

The combination of the two is a classic surprise. With `transform` before `filter`, the filter's predicate dereferences the underlying transform iterator, and then your loop dereferences it again, so every element that passes is transformed twice.

```cpp
#include <cstdio>
#include <ranges>
#include <vector>

int calls = 0;

void demo() {
  std::vector<int> v{1, 2, 3, 4};
  auto r = v | std::views::transform([](int x) { ++calls; return x; })
             | std::views::filter([](int x) { return x % 2 == 0; });
  for (int x : r) (void)x;
  std::printf("%d\n", calls);   // 6: four predicate checks, two loop derefs
}
```

If the transformation is expensive, put the filter first, or materialize the transformed values once.

## Const iteration and caching

The `range` concept requires `begin()` to be amortized constant time. `filter_view` cannot find its first matching element in constant time, so it finds it once, caches the iterator inside the view, and returns the cached value from then on. `drop_while_view` does the same, and so does `drop_view` over a range that is not random-access and sized.

Caching mutates the view, so these views provide only a non-`const` `begin()`. A `const filter_view` is not a range at all.

```cpp
#include <ranges>
#include <vector>

void show(const auto& r) {
  for (int x : r) (void)x;
}

void demo(std::vector<int>& v) {
  auto evens = v | std::views::filter([](int x) { return x % 2 == 0; });
  // show(evens);   // ill-formed: filter_view has no const begin()
  for (int x : evens) (void)x;   // fine on a non-const view
}
```

Generic functions that accept views should therefore take them by value or by forwarding reference, not by `const&`. Two consequences of the cache are easy to miss. First, iterating a filtered view a second time skips the search for the first element, so a predicate with side effects runs fewer times on the second pass. Second, the cache is a stored iterator into the underlying range. If you insert into the vector after the first iteration, reallocation invalidates the cached iterator, and iterating the view again is undefined behavior.

> **Pitfall.** A view never sees operations on the range it refers to. Any container operation that invalidates iterators also invalidates the iterators inside a view of that container, including cached ones, so rebuild the view after modifying the container.

`filter_view` adds one more rule: you may modify elements through its iterators, but if an element no longer satisfies the predicate, the behaviour is undefined, because the view's invariant is broken.

## `ranges::to` and range-based `for`

Views produce elements but do not store them. C++23 adds `std::ranges::to` to materialize any range into a container. Given a class template, it deduces the element type; given a complete type, it converts each element.

```cpp
#include <list>
#include <ranges>
#include <vector>

void demo() {
  auto v = std::views::iota(1, 4) | std::ranges::to<std::vector>();  // std::vector<int>
  auto l = v | std::views::filter([](int x) { return x > 1; })
             | std::ranges::to<std::list<long>>();                   // 2, 3 as long
}
```

`ranges::to` tries, in order, direct construction from the range, a constructor taking the `std::from_range` tag, a constructor taking an iterator pair, and finally default construction followed by appending each element.

Range-based `for` predates ranges and does not use `std::ranges::begin`. It binds the range to `auto&& __range`, and calls member `begin()` and `end()` if the class has both, or otherwise unqualified `begin` and `end` found by argument-dependent lookup. Since C++17 the two results may have different types, which is what lets a non-common view be used in a loop. Because `__range` is a non-`const` reference to the view, a filtered view works in a loop even though it is not const-iterable.

## What to remember

- A range needs `ranges::begin` and `ranges::end`; the end can be a sentinel of a different type.
- A view is a range with constant-time move and destruction proportional to its elements, opted in through `enable_view`.
- `std::vector` is not a view; `std::string_view`, `std::span` and adaptor results are.
- C++20 defect reports dropped default construction (P2325) and allowed move-only owning views (P2415).
- `views::all` passes views through, wraps lvalues in `ref_view`, and moves rvalues into `owning_view`.
- Views are lazy and recompute on every pass; `transform` before `filter` calls the function twice per kept element.
- `filter_view` and other caching views are not const-iterable; take views by value or `auto&&`.
- Modifying the underlying container can invalidate a view's cached iterators.
- C++23 `ranges::to` turns a range into a container.
