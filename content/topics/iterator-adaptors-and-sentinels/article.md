---
title: "Iterator adaptors and sentinels"
summary: "Iterator adaptors wrap an iterator to change what moving or dereferencing means, and C++20 sentinels let the end of a range be a different type from its iterator. Together they explain reverse_iterator's off-by-one base, counted and common iterators, subrange, and why C++23 had to fix cbegin."
track: "algorithms-and-ranges"
minutes: 13
standard:
  - "[reverse.iterators]"
  - "[move.iterators]"
  - "[insert.iterators]"
  - "[stream.iterators]"
  - "[iterators.counted]"
  - "[iterators.common]"
  - "[unreachable.sentinel]"
  - "[iterator.concept.sentinel]"
  - "[range.subrange]"
  - "[const.iterators]"
  - "[range.access.cbegin]"
cppreference:
  - title: "std::reverse_iterator"
    path: "iterator/reverse_iterator"
  - title: "std::move_iterator"
    path: "iterator/move_iterator"
  - title: "std::counted_iterator"
    path: "iterator/counted_iterator"
  - title: "std::common_iterator"
    path: "iterator/common_iterator"
  - title: "std::unreachable_sentinel_t"
    path: "iterator/unreachable_sentinel_t"
  - title: "std::ranges::subrange"
    path: "ranges/subrange"
  - title: "std::basic_const_iterator"
    path: "iterator/basic_const_iterator"
prerequisites:
  - "iterator-categories-and-concepts"
  - "ranges-and-views"
---

## The one idea

An iterator adaptor holds another iterator and redefines one or two of its operations. `reverse_iterator` swaps increment and decrement. `move_iterator` turns each dereference into an rvalue. An insert iterator turns assignment into a container call. `counted_iterator` carries a countdown. None of them owns data; each is a thin rule layered over the iterator inside it.

C++20 added the other half of the picture: the end of a range no longer has to be an iterator. A **sentinel** is any type that can be compared with the iterator to answer "are we done?". That lets a null-terminated string, an unbounded sequence, or "the next five elements" be expressed without computing an end position up front. The cost is that older code, which expects `first` and `last` of the same type, needs an adaptor to bridge the gap.

> **Mental model.** An iterator says where you are; a sentinel only says whether you have arrived. Adaptors change the meaning of moving and reading, and `common_iterator` exists only to make the two halves the same type again.

What each iterator category promises is the subject of the iterator-categories-and-concepts topic; this one assumes it.

## reverse_iterator and the off-by-one base

A reverse iterator stores an ordinary iterator, `base()`, that points one position *after* the element it denotes. `rbegin()` wraps `end()`, and `rend()` wraps `begin()`. Dereferencing a reverse iterator `r` yields `*std::prev(r.base())`. The offset is what makes `rend()` representable: there is no valid position before `begin()`, but there is a valid `begin()` to stand one past the reversed end.

```text
elements:     [1]  [2]  [3]  [4]  [5]
iterators:   b                         e
reverse r:              *r = 3
r.base():                    -> 4
```

```cpp
#include <algorithm>
#include <cstdio>
#include <iterator>
#include <vector>

int main() {
  std::vector<int> v{1, 2, 3, 4, 5};
  auto r = std::find(v.rbegin(), v.rend(), 3);
  std::printf("%d %d\n", *r, *r.base());  // prints 3 4
  v.erase(std::next(r).base());            // erases the 3, not the 4
}
```

Converting the other way has the same offset. `std::reverse_iterator(it)` denotes the element *before* `it`, so a reverse iterator built from `v.begin() + 2` dereferences to `v[1]`. To erase through a reverse iterator, step it once and take the base, as above, or the code silently removes the neighbour.

The same offset explains why `reverse_iterator` needs a bidirectional iterator and costs a decrement on every dereference. `views::reverse` uses it too, and for a range that is not common it must first walk to the end to find the position to start from, which is why `reverse_view` caches its `begin()`.

## move_iterator and move_sentinel

A `move_iterator` dereferences to an rvalue reference, `std::ranges::iter_move` of the underlying iterator since C++20. Passing a pair of them to a constructor or algorithm that copies turns the copies into moves.

```cpp
#include <iterator>
#include <string>
#include <vector>

void take_all(std::vector<std::string>& src) {
  std::vector<std::string> dst(std::make_move_iterator(src.begin()),
                               std::make_move_iterator(src.end()));
  // src still has its elements, each in a valid but unspecified state
}
```

The source elements are moved from, not removed. An algorithm that reads an element more than once is dangerous here. `std::copy_if` with a predicate that takes `std::string` by value moves the string into the predicate, then copies what is left into the output.

```cpp
#include <algorithm>
#include <iterator>
#include <string>
#include <vector>

void keep_long(std::vector<std::string>& src, std::vector<std::string>& out) {
  std::copy_if(std::make_move_iterator(src.begin()), std::make_move_iterator(src.end()),
               std::back_inserter(out),
               [](std::string s) { return s.size() > 4; });
  // the predicate already moved each string out; out receives moved-from
  // strings, which libstdc++ leaves empty
}
```

The fix is a predicate that takes `const std::string&`, so testing an element reads it without consuming it. The general rule is that a `move_iterator` range is safe to hand only to algorithms that read each element once.

C++20 added `move_sentinel<S>`, which wraps a sentinel so that a `move_iterator<I>` can be compared with it. In C++20 a `move_iterator` modelled only `input_iterator`; C++23 (P2520) lets it model the underlying category, up to random access.

## Insert and stream iterators

Insert iterators adapt a container, not an iterator. Assigning to one calls `push_back`, `push_front` or `insert`; `*it` and `++it` do nothing and return the iterator itself. `std::back_inserter(c)` appends in order. `std::front_inserter(c)` reverses the sequence, since each element goes in front of the last one. `std::inserter(c, pos)` inserts before `pos` and then advances its stored position past the new element, so a run of values lands in order. Since C++20 they have `std::ptrdiff_t` as `difference_type` instead of `void`, which lets them model `std::output_iterator` for the constrained algorithms.

```cpp
#include <algorithm>
#include <deque>
#include <iterator>
#include <list>
#include <vector>

void fill() {
  std::deque<int> d;
  std::ranges::copy(std::vector{1, 2, 3}, std::front_inserter(d));  // d: 3 2 1
  std::list<int> l{10, 20};
  std::ranges::copy(std::vector{1, 2, 3}, std::inserter(l, std::next(l.begin())));
  // l: 10 1 2 3 20
}
```

Stream iterators adapt a stream. `std::istream_iterator<T>` reads with `>>`, and it reads the first value in its constructor, so creating one consumes input even if you never dereference it. A default-constructed one is the end-of-stream iterator, and an iterator becomes equal to it when extraction fails. `std::ostream_iterator<T>(os, delim)` writes each value followed by the delimiter, so the output ends with a trailing delimiter. `istreambuf_iterator` and `ostreambuf_iterator` work on raw characters with no formatting and no skipping of whitespace.

## Sentinels, iterator_t and sentinel_t

`std::sentinel_for<S, I>` requires `S` to be semiregular and comparable with `I` through `==` and `!=`. Thanks to C++20's rewritten comparisons, one `operator==` taking the iterator and the sentinel is enough.

```cpp
#include <iterator>
#include <ranges>

struct NullTerm {
  friend bool operator==(const char* p, NullTerm) { return *p == '\0'; }
};
static_assert(std::sentinel_for<NullTerm, const char*>);

auto n = std::ranges::distance("hello", NullTerm{});  // 5, no strlen up front
```

For a range type `R`, `std::ranges::iterator_t<R>` is the type `ranges::begin` returns for an lvalue `R`, and `std::ranges::sentinel_t<R>` is what `ranges::end` returns. `common_range<R>` means exactly that the two are the same type. Note that `iterator_t<const R>` is a separate question: it is `const_iterator` for a vector, and it does not exist at all for a `filter_view`.

`std::unreachable_sentinel` compares unequal to every iterator. `views::iota(0)` uses it to be infinite, and an algorithm such as `std::ranges::find(it, std::unreachable_sentinel, x)` drops its bounds check when you already know `x` is present. If it is not, the search runs off the end, which is undefined behaviour.

`std::ranges::subrange<I, S>` packages an iterator and a sentinel as a view. It is what `ranges::equal_range` and friends return, it is always a borrowed range, and it supports structured bindings: `auto [first, last] = std::ranges::subrange(v);`. When `I` and `S` cannot compute a distance, a subrange can store a size alongside them so that it remains sized.

## counted_iterator and default_sentinel

`std::counted_iterator<I>` pairs an iterator with a remaining count. Incrementing it decrements the count, and it compares equal to `std::default_sentinel` when the count reaches zero, independently of the underlying sequence. That makes "the next `n` elements" a sized range even for a list or an input stream, and it never steps past the last element it needs.

```cpp
#include <iterator>
#include <list>
#include <ranges>
#include <span>
#include <type_traits>
#include <vector>

std::list<int> l{1, 2, 3, 4};
std::vector<int> v{1, 2, 3, 4};
auto a = std::views::counted(l.begin(), 2);
auto b = std::views::counted(v.begin(), 2);
static_assert(std::is_same_v<decltype(a),
    std::ranges::subrange<std::counted_iterator<std::list<int>::iterator>,
                          std::default_sentinel_t>>);
static_assert(std::is_same_v<decltype(b), std::span<int>>);
```

`views::counted` picks the cheapest representation: a `std::span` for contiguous iterators, a plain `subrange(it, it + n)` for other random-access iterators, and a counted iterator with `default_sentinel` otherwise. `views::take` uses the same machinery when its input is not random access. Two counted iterators over the same sequence can be subtracted by comparing their counts, so the distance is O(1) even when the underlying iterator cannot provide it.

> **Pitfall.** `views::counted(it, n)` trusts you. If fewer than `n` elements follow `it`, iterating the view runs past the end of the underlying sequence, and the behaviour is undefined.

## common_iterator and views::common

Code written before C++20, including the iterator-pair constructors of every container, needs `first` and `last` of one type. `std::common_iterator<I, S>` holds either an `I` or an `S` and compares them correctly, and `views::common` uses it to turn any range into a common one. It requires `I` to be copyable, so it cannot help a move-only input iterator.

```cpp
#include <ranges>
#include <vector>

void build() {
  auto r = std::views::iota(0) | std::views::take(5);
  // std::vector<int> a(r.begin(), r.end());  // error: different types
  auto c = r | std::views::common;
  std::vector<int> b(c.begin(), c.end());     // OK
  auto d = std::ranges::to<std::vector>(r);   // C++23: no adaptor needed
  (void)b; (void)d;
}
```

C++23 makes the bridge less necessary: `std::ranges::to` and the containers' `from_range` constructors accept any range directly.

## Const iterators and the C++23 cbegin fix

In C++20, `std::ranges::cbegin(r)` meant `ranges::begin` applied to `r` as const. For a container that gives a const iterator, but a view such as `std::span<int>` has shallow constness: its const `begin()` still returns a mutable iterator. So C++20's `cbegin` on a span let you write through it.

C++23 (P2278) fixed the ranges version. `std::ranges::cbegin` now returns `std::const_iterator<I>`, which is `I` itself if it already yields const references and `std::basic_const_iterator<I>` otherwise. `views::as_const` and the alias `std::ranges::const_iterator_t<R>` came with it. The non-member `std::cbegin` from `<iterator>` was not changed, and still returns a mutable iterator for a span.

```cpp
#include <iterator>
#include <ranges>
#include <span>
#include <type_traits>
#include <vector>

std::vector<int> v{1, 2, 3};
std::span<int> sp(v);
static_assert(std::is_same_v<decltype(*std::ranges::cbegin(sp)), const int&>);  // C++23
static_assert(std::is_same_v<decltype(*std::cbegin(sp)), int&>);  // still mutable
```

> **Standardese.** [range.access.cbegin] in C++23 defines `ranges::cbegin(E)` through `const_iterator<decltype(U)>` built from `ranges::begin` of a possibly const view of `E`, and [const.iterators] specifies `basic_const_iterator` as an adaptor whose reference type is the iterator's const reference type. The guarantee is about the type, so writing through it is ill-formed rather than undefined.

## What to remember

- A reverse iterator's `base()` points one past the element it denotes; erase with `std::next(r).base()`.
- `move_iterator` dereferences to an rvalue, so any algorithm that reads twice sees a moved-from value.
- `front_inserter` reverses order; `inserter` keeps order by advancing its position after each insert.
- `istream_iterator` reads its first value in the constructor; `ostream_iterator` writes a trailing delimiter.
- A sentinel only answers "done?"; `common_range` means `iterator_t` and `sentinel_t` are the same type.
- `unreachable_sentinel` removes bounds checks; if the value is missing, that is undefined behaviour.
- `views::counted` yields a span, a subrange, or a `counted_iterator` with `default_sentinel`, by iterator category.
- `views::common` bridges to pre-C++20 code; in C++23 prefer `ranges::to`.
- C++23 `ranges::cbegin` always yields a const iterator; `std::cbegin` on a span is still mutable.
