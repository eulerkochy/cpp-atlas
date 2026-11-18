---
title: "Ranges, views, and niebloids"
summary: "How C++20 ranges decouple sentinels from iterators, compose lazy views, prevent dangling iterators with borrowed_range, and suppress ADL with niebloids."
track: "algorithms-and-ranges"
minutes: 11
standard:
  - "[ranges.syn]"
  - "[range.range]"
  - "[range.view]"
  - "[range.dangling]"
  - "[range.adaptor.object]"
cppreference:
  - title: "Ranges library"
    path: "ranges"
  - title: "std::ranges::range"
    path: "ranges/range"
  - title: "std::ranges::view"
    path: "ranges/view"
  - title: "std::ranges::borrowed_range"
    path: "ranges/borrowed_range"
  - title: "std::ranges::dangling"
    path: "ranges/dangling"
  - title: "Customization point object"
    path: "ranges/cpo"
  - title: "std::ranges::to"
    path: "ranges/to"
prerequisites:
  - "name-lookup-and-adl"
  - "sfinae-and-concepts"
---

Classical STL algorithms accept two iterators of the **same type** `(first, last)`. That design leaks implementation details into call sites (`std::sort(v.begin(), v.end())`), forbids passing two mismatched iterator types easily, and forces eager intermediate containers whenever you filter or transform elements step by step.

C++20 Ranges rebuilds algorithms around three ideas: **iterator-sentinel pairs**, **lazy non-owning views**, and **ADL-safe invocation rules** via customization point objects and niebloids.

> **Mental model.** A view does not hold elements or run loops on construction; it stores a small handle to an upstream range plus a rule for advancing an iterator. Computation happens element by element only when you pull from the resulting iterator.

## Ranges, sentinels, and views

Under `[range.range]`, a type `R` satisfies `std::ranges::range` when `std::ranges::begin(r)` yields an `input_or_output_iterator` and `std::ranges::end(r)` yields a `sentinel_for<iterator_t<R>>`. Because the sentinel type `S` need not match the iterator type `I`, loops terminate on abstract conditions—such as reaching `'\0'`, exhausting a finite count (`std::default_sentinel_t`), or never terminating (`std::unreachable_sentinel_t`)—without fabricating dummy end iterators.

A `std::ranges::view` refines `range` by opting into `std::ranges::enable_view<T>` and promising **O(1) move construction, move assignment, and destruction** independent of element count. After defect report P2325R3, `view` no longer requires `default_initializable`—allowing closures with captureless or capturing non-default-constructible lambdas to model `view`.

When you pipe a range into `std::views::all(r)`:

- If `r` is already a `view`, it is forwarded directly.
- If `r` is a non-view lvalue container (`std::vector`), `views::all` wraps it in `std::ranges::ref_view`, a non-owning pointer-like wrapper.
- If `r` is a non-view rvalue (`make_vec()`), `views::all` wraps it in `std::ranges::owning_view`, moving ownership of the temporary container into the pipeline object itself.

```cpp
#include <ranges>
#include <vector>

std::vector<int> make_scores() { return {40, 85, 92, 60}; }

void inspect_const_and_ownership() {
    std::vector<int> scores{40, 85, 92, 60};
    auto high = scores | std::views::filter([](int s) { return s >= 80; });
    static_assert(std::ranges::range<decltype(high)>);
    static_assert(!std::ranges::range<const decltype(high)>); // begin() caches!

    // Non-view rvalue becomes an owning_view inside the pipeline
    auto top = make_scores() | std::views::transform([](int s) { return s + 5; });
    static_assert(std::ranges::view<decltype(top)>);
}
```

> **Pitfall.** `std::ranges::filter_view` and `drop_while_view` must locate the first matching element in amortized O(1) time, so they **cache the result of `begin()`** inside the view object. Because caching mutates internal state, `begin()` is non-`const`—meaning `const filter_view` does not even satisfy `std::ranges::range`. Accept views by forwarding reference `auto&&` or value, not `const auto&`.

## Borrowed ranges and std::ranges::dangling

What happens if an algorithm returns an iterator into a temporary container that dies at the semicolon?

```cpp
#include <algorithm>
#include <concepts>
#include <ranges>
#include <string_view>
#include <vector>

std::vector<int> fetch_ids() { return {1, 2, 3}; }

void dangling_protection() {
    auto it_bad = std::ranges::find(fetch_ids(), 2);
    static_assert(std::same_as<decltype(it_bad), std::ranges::dangling>);
    // *it_bad; // Compile error: std::ranges::dangling cannot be dereferenced

    auto it_ok = std::ranges::find(std::string_view{"lucid"}, 'c');
    static_assert(!std::same_as<decltype(it_ok), std::ranges::dangling>);
}
```

C++20 solves this at compile time with `std::ranges::borrowed_range<R>`. A range is borrowed if it is an lvalue reference (`R&`) or if `std::ranges::enable_borrowed_range<std::remove_cvref_t<R>>` is `true`—indicating its iterators point to external storage whose lifetime is decoupled from the range wrapper itself (`std::string_view`, `std::span`, `std::ranges::subrange`, `views::iota`).

Algorithms returning iterators into an input range return `std::ranges::borrowed_iterator_t<R>`, which evaluates to `std::ranges::dangling` whenever `R` fails `borrowed_range`. Notice the subtle interaction with `owning_view`: `make_vec() | views::transform(...)` is valid because `owning_view` owns the vector for the lifetime of the view, yet that pipeline is **not** a `borrowed_range`, so calling `std::ranges::find` on the pipeline temporary still safely yields `std::ranges::dangling`.

> **Standardese.** Under `[range.dangling]`, `std::ranges::dangling` is an empty class type constructible from any arguments. Algorithms returning `borrowed_iterator_t<R>` still run and return `dangling` when `R` is a non-borrowed rvalue, allowing callers to ignore the result safely while blocking accidental dereferencing.

## CPOs, niebloids, and pipeable adaptors

Two distinct mechanisms power `std::ranges` syntax, and standardese keeps them sharply separated:

```text
Customization Point Object (std::ranges::begin / swap)
  └─ inline constexpr function object -> dispatches to member / ADL / fallback

Niebloid (std::ranges::sort / find)
  └─ function-like entity inhibiting ADL -> supports projections, blocks rogue ADL overloads
```

A **Customization Point Object (CPO)** such as `std::ranges::begin`, `std::ranges::size`, or `std::ranges::swap` is a `semiregular` `inline constexpr` function object whose `operator()` performs standardized dispatch (for example, checking a member function first, then ADL in a constrained context, then a default implementation). Because it is an object rather than a function template, calling `std::ranges::swap(a, b)` requires no `using std::swap;` boilerplate.

A **niebloid**—the community name for `std::ranges` algorithm entities such as `std::ranges::sort` and `std::ranges::find`—serves the opposite goal: **preventing ADL**. When a caller writes `using std::ranges::find; find(my_vec, 42);`, ordinary unqualified lookup finds a non-function entity (implemented as an `inline constexpr` function object in standard libraries), which inhibits Argument-Dependent Lookup into user namespaces. Unlike classic `std::sort`, niebloids also accept **projections** (`std::ranges::sort(users, {}, &User::id)`) because they are not restricted by function-template overload resolution quirks.

Pipeability (`r | adaptor`) comes from **Range Adaptor Closure Objects**. Calling `std::views::filter(pred)` returns a closure object implementing `operator|`. Since C++23, user types can inherit from `std::ranges::range_adaptor_closure<Derived>` to participate identically in `|` pipelines and compose with standard views (`views::filter(p) | my_closure()`).

## Materializing pipelines with std::ranges::to

Lazy views do not allocate, which leaves one frequent task at the end of a pipeline: materializing results back into an owning container. C++23 adds `std::ranges::to<Container>()`, supporting both direct construction and pipe syntax without manually converting sentinel-bounded views to common ranges first.

```cpp
#include <algorithm>
#include <ranges>
#include <vector>

struct Task { int priority; };

struct take_two_fn : std::ranges::range_adaptor_closure<take_two_fn> {
    template <std::ranges::viewable_range R>
    constexpr auto operator()(R&& r) const {
        return std::views::take(std::forward<R>(r), 2);
    }
};
inline constexpr take_two_fn take_two{};

std::vector<int> top_priorities(std::vector<Task>& tasks) {
    std::ranges::sort(tasks, std::ranges::greater{}, &Task::priority);
    return tasks
        | std::views::transform(&Task::priority)
        | std::views::filter([](int p) { return p > 0; })
        | take_two
        | std::ranges::to<std::vector>();
}
```

| Concept or entity | Core constraint or rule | Owns elements | Safe for rvalue iterators | Typical example |
| --- | --- | --- | --- | --- |
| `std::ranges::range` | `begin(r)` iterator + `end(r)` sentinel | Usually | Only if borrowed | `std::vector<int>` |
| `std::ranges::view` | `range` + `movable` + `enable_view` (`O(1)` move/destroy) | No (except `owning_view`) | No (unless borrowed) | `views::filter`, `views::transform` |
| `borrowed_range` | Lvalue range or `enable_borrowed_range == true` | No | Yes (`borrowed_iterator_t` is real) | `std::string_view`, `std::span`, `subrange` |
| CPO | `inline constexpr` object dispatching member/ADL | N/A | N/A | `std::ranges::begin`, `std::ranges::swap` |
| Niebloid | ADL-inhibiting algorithm entity with projections | N/A | Returns `dangling` if unborrowed | `std::ranges::sort`, `std::ranges::find` |

> **Mental model.** Keep pipelines lazy while filtering, slicing, and projecting; materialize with `std::ranges::to` only at the ownership boundary where results must outlive their source or populate a container.

## What to remember

- Ranges separate iterator and sentinel types, eliminating mismatched-iterator errors and dummy end sentinels.
- Views cache state lazily (`filter_view` caches `begin()`), so `const` views may fail `std::ranges::range`; pass views by value or `auto&&`.
- Non-`borrowed_range` rvalues cause iterator-returning `std::ranges` algorithms to yield `std::ranges::dangling` rather than dangling pointers.
- `views::all` wraps lvalue containers in `ref_view` and non-view rvalues in `owning_view`, letting temporary containers power `|` pipelines safely.
- CPOs enable constrained customization, while niebloids inhibit ADL and support projections; C++23 `range_adaptor_closure` and `ranges::to` complete user pipelines.
