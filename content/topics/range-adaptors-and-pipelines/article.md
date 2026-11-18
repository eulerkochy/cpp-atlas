---
title: "Range adaptors and pipelines"
summary: "A range adaptor turns one view into another lazily, and the pipe operator only rearranges the call. What each adaptor keeps of its input's iterator category, and what it caches, decides where a pipeline compiles, how often your functions run, and when it quietly misbehaves."
track: "algorithms-and-ranges"
minutes: 13
standard:
  - "[range.adaptor.object]"
  - "[range.range]"
  - "[range.filter]"
  - "[range.filter.iterator]"
  - "[range.transform]"
  - "[range.take]"
  - "[range.split]"
  - "[range.lazy.split]"
  - "[range.join]"
  - "[range.zip]"
  - "[range.enumerate]"
  - "[range.chunk]"
  - "[range.slide]"
  - "[range.stride]"
  - "[range.cartesian]"
cppreference:
  - title: "Ranges library (range adaptors)"
    path: "ranges"
  - title: "std::ranges::range_adaptor_closure"
    path: "ranges/range_adaptor_closure"
  - title: "std::ranges::filter_view"
    path: "ranges/filter_view"
  - title: "std::ranges::transform_view"
    path: "ranges/transform_view"
  - title: "std::ranges::take_view"
    path: "ranges/take_view"
  - title: "std::ranges::zip_view"
    path: "ranges/zip_view"
prerequisites:
  - "ranges-and-views"
  - "iterator-categories-and-concepts"
  - "lambdas"
---

## The one idea

A pipeline such as `xs | views::filter(p) | views::transform(f)` does no work when you write it. It builds a nested type, here a `transform_view` of a `filter_view` of a `ref_view` of `xs`, and every element is computed on demand when someone dereferences and increments its iterators. The pipe is only notation. `r | views::filter(p)` means exactly `views::filter(r, p)`.

Two consequences follow from laziness, and most surprises in this area come from one or the other. First, each layer can only offer what its input offers, and often less: an adaptor that cannot jump ahead in constant time turns a random-access range into a bidirectional one. Second, because work happens at iteration time, a function in the pipeline runs whenever an iterator is dereferenced, which may be more than once per element, and a view may remember results from an earlier pass.

> **Mental model.** A pipeline is a recipe, not a container. Each adaptor wraps the iterator of the layer below it, so the category, the cost of dereferencing, and any cached state are those of the wrapped iterators, layer by layer.

What a view is, and how `views::all` chooses between `ref_view` and `owning_view`, is covered in the ranges-and-views topic. This topic is about the adaptors themselves.

## Adaptor objects, closures, and how the pipe composes

Every name in `std::views` is a function object, not a function. [range.adaptor.object] gives them two shapes.

A **range adaptor closure object** takes exactly one range. `views::reverse`, `views::join`, `views::enumerate`, `views::as_const`, `views::as_rvalue` and `views::common` are closures already. For a closure `C`, the expressions `C(r)` and `r | C` are equivalent.

A **range adaptor object** takes a range plus extra arguments, like `views::filter(r, p)` or `views::take(r, 3)`. Calling it with only the extra arguments returns a closure that stores them, so `views::filter(p)` is a closure, and `r | views::filter(p)` calls it with `r` in front.

Two closures can be piped together without a range. `C | D` produces a new closure such that `r | (C | D)` is equivalent to `r | C | D`, which is `D(C(r))`. Because the pipe is left-associative, the order you read is the order data flows.

```cpp
#include <ranges>
#include <vector>
#include <cstdio>
namespace views = std::views;

int main() {
  auto even_squares = views::filter([](int x) { return x % 2 == 0; })
                    | views::transform([](int x) { return x * x; });
  std::vector<int> xs{1, 2, 3, 4};
  for (int x : xs | even_squares) std::printf("%d ", x);  // prints 4 16
}
```

Not everything in `std::views` is pipeable. `views::zip`, `views::cartesian_product` and the C++26 `views::concat` take any number of ranges, so they are customization point objects rather than adaptor objects. `views::zip(ys)` is a perfectly good one-range zip view, which means `xs | views::zip(ys)` tries to pipe `xs` into a view and fails to compile. Write `views::zip(xs, ys)`.

## The adaptors worth knowing

The C++20 core covers selection and reshaping. `filter` keeps elements satisfying a predicate. `transform` applies a function at dereference time. `take` and `drop` keep or skip a count, and `take_while` and `drop_while` do the same by predicate. `join` flattens a range of ranges. `split` breaks a range into subranges at a delimiter. `reverse`, `keys`, `values` and `elements` round out the set.

C++23 added the adaptors people used to borrow from range-v3. `zip` walks several ranges in lockstep and yields tuples of references, stopping at the shortest. `enumerate` pairs each element with its index. `chunk(n)` cuts a range into non-overlapping pieces of `n`, the last possibly shorter, and `slide(n)` yields every overlapping window of `n`. `stride(n)` keeps every `n`th element. `cartesian_product` yields every combination of elements from several ranges. `as_rvalue` makes elements rvalues so a consumer can move from them, and `as_const` makes them const.

`split` and `lazy_split` deserve a note. They swapped names by a defect report against C++20 (P2210). `split` now needs a forward range, and each piece it yields is a `subrange` of the underlying iterators, so splitting a `string_view` gives pieces you can convert to `string_view`. `lazy_split` also works on input ranges, such as a stream, but each piece is a lazily searched range that is never even bidirectional.

```cpp
#include <ranges>
#include <string_view>
using namespace std::literals;

void pieces() {
  for (auto w : "a,b,,c"sv | std::views::split(','))
    std::string_view s(w);                     // OK: w is a contiguous subrange
  // for (auto w : "a b"sv | std::views::lazy_split(' '))
  //   std::string_view s(w);                  // error: no such conversion
}
```

## What each adaptor keeps and loses

An adaptor's iterator can only be as strong as the operations it can implement in constant time. Expect these from the common adaptors:

| Adaptor | Best category | Sized | Notes |
| --- | --- | --- | --- |
| `filter` | bidirectional | never | common if the input is common |
| `transform` | random access | if input is | never contiguous |
| `take` | input's category | if input is | common only if input is sized and random access |
| `drop` | input's category | if input is | caches `begin()` unless random access and sized |
| `join` | bidirectional | never | needs inner ranges bidirectional and common |
| `zip` | weakest of inputs | if all are | size is the minimum |
| `split` | forward | never | pieces keep the input's category |
| `chunk`, `stride` | input's category | if input is | `chunk` on an input range is input only |
| `slide` | input's category | if input is | needs a forward range |

`filter` cannot know how far apart two matching elements are, so it can never be random access or sized, and `ranges::size` does not compile on it. `transform` loses contiguity because the elements it yields are computed, not stored. `take` is the subtle one: on a `std::list`, it knows its size but cannot compute its end iterator in constant time, so it pairs a `counted_iterator` with `default_sentinel` and stops being a common range.

```cpp
#include <list>
#include <ranges>
#include <vector>

std::list<int> l{1, 2, 3};
std::vector<int> v{1, 2, 3};
static_assert(std::ranges::sized_range<decltype(l | std::views::take(2))>);
static_assert(!std::ranges::common_range<decltype(l | std::views::take(2))>);
static_assert(std::ranges::common_range<decltype(v | std::views::take(2))>);
```

Some adaptors do not wrap at all when they can return a cheaper type. `take` and `drop` applied to a `std::span`, a `std::basic_string_view`, a sized `iota_view` or a suitable `subrange` return that same kind of type, so `span | views::take(2)` is a `std::span`. `views::reverse` applied to a `reverse_view` unwraps it instead of stacking another layer.

## Functions run on every dereference

`transform` calls its function inside `operator*`. It does not store the result. `filter` must dereference elements to test them. Put `transform` before `filter`, and each element that passes is computed once to be tested and again when the loop reads it.

```cpp
#include <ranges>
#include <vector>
#include <cstdio>

int main() {
  int calls = 0;
  std::vector<int> xs{1, 2, 3, 4};
  auto r = xs | std::views::transform([&](int x) { ++calls; return x * x; })
              | std::views::filter([](int x) { return x % 2 == 0; });
  for (int x : r) (void)x;
  std::printf("%d\n", calls);  // prints 6: four tests plus two reads
}
```

For a cheap function this does not matter. For an expensive or side-effecting one, filter first when you can, or materialize the transformed values with `std::ranges::to`. A function in a view should be regular in the sense of the `regular_invocable` concept: same input, same output, no observable side effects. A counter, as above, is fine for measuring and wrong for logic.

> **Pitfall.** Writing through a `filter_view` is allowed, but if the new value no longer satisfies the predicate, the behaviour is undefined. A loop like `for (int& x : v | views::filter(is_even)) ++x;` breaks the view's invariant for every element it touches.

> **Standardese.** [range.filter.iterator] says that modifying the element a `filter_view` iterator denotes is permitted, but results in undefined behavior if the resulting value does not satisfy the filter predicate. The view never re-tests a position it has already accepted, so nothing diagnoses the violation.

## Caching, and why some views cannot be const

The `range` concept requires `ranges::begin` and `ranges::end` to run in amortized constant time ([range.range]). `filter_view` has to search for its first matching element, which is linear. To meet the requirement it searches once and caches the iterator inside the view. `drop_view` caches unless its input is random access and sized, `reverse_view` caches when its input is not a common range, and `split_view` and `chunk_by_view` always cache.

Caching mutates the view, so those `begin()` members are not `const`. A `const filter_view` is not a range at all, and a function template that takes its argument as `const auto&` cannot iterate it.

```cpp
#include <ranges>
#include <vector>
#include <cstdio>

void print(const auto& r) { for (int x : r) std::printf("%d ", x); }

void demo(std::vector<int>& xs) {
  print(xs | std::views::transform([](int x) { return x + 1; }));  // OK
  // print(xs | std::views::filter([](int x) { return x > 1; }));
  // error: filter_view::begin() is not const
}
```

Take views by forwarding reference, `auto&&`, or by value, since views are cheap to copy or move. The cache also outlives changes to the underlying data. If you iterate a filter view, then change the first elements of the vector so that an earlier element would now match, the next iteration still starts from the cached position. Treat a cached view as single-use when its underlying data changes; recreate it rather than reuse it.

## Writing your own adaptor

C++23 added `std::ranges::range_adaptor_closure<D>`. Derive from it using the curiously recurring pattern, give your type a call operator that takes a range, and your object gains the pipe: `r | yours` calls it, and `yours | other` composes with any standard closure. The type must have exactly one such base and must not itself be a range.

```cpp
#include <ranges>
#include <vector>
#include <cstdio>

struct evens_fn : std::ranges::range_adaptor_closure<evens_fn> {
  template <std::ranges::viewable_range R>
  constexpr auto operator()(R&& r) const {
    return std::forward<R>(r) | std::views::filter([](int x) { return x % 2 == 0; });
  }
};
inline constexpr evens_fn evens;

int main() {
  std::vector<int> xs{1, 2, 3, 4, 5, 6};
  auto pipeline = evens | std::views::transform([](int x) { return x * 10; })
                | std::views::take(2);
  for (int x : xs | pipeline) std::printf("%d ", x);  // prints 20 40
}
```

For an adaptor that takes arguments, store them as members of the closure, as `evens_fn` could store a divisor, or produce the closure with `std::bind_back` over an adaptor object. In C++20 there was no portable way to do this; libraries relied on each implementation's internal base class.

## What to remember

- `r | A(args)` is `A(r, args)`, and `r | (C | D)` is `D(C(r))`; the pipe adds nothing but syntax.
- `zip`, `cartesian_product` and C++26 `concat` are not adaptor objects; call them with all their ranges.
- `filter` is at most bidirectional and never sized; `transform` is never contiguous; `take` on a non-random-access range is not common.
- `take` and `drop` return a `span`, `string_view` or `iota_view` when given one, instead of wrapping it.
- `split` needs a forward range and yields subranges; `lazy_split` accepts input ranges but its pieces are weak.
- `transform` before `filter` calls the function twice for every element that passes.
- Writing a value through a `filter_view` that fails the predicate is undefined behaviour.
- Views that cache `begin()`, such as `filter`, `split`, and `drop` over a non-random-access input, cannot be iterated as const; pass views by `auto&&` or by value.
- C++23 `range_adaptor_closure` lets your own function objects join a pipeline.
