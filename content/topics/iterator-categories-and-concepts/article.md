---
title: "Iterator categories and concepts"
summary: "C++ has two iterator taxonomies, the legacy named requirements from C++98 and the C++20 iterator concepts, and an iterator can sit at different levels in each. Knowing which one an algorithm consults explains why proxy iterators are random-access in one world and input-only in the other."
track: "algorithms-and-ranges"
minutes: 14
standard:
  - "[iterator.requirements]"
  - "[iterator.concepts]"
  - "[iterator.cpp17]"
  - "[iterator.traits]"
  - "[iterator.assoc.types]"
  - "[iterator.operations]"
cppreference:
  - title: "Iterator library"
    path: "iterator"
  - title: "std::iterator_traits"
    path: "iterator/iterator_traits"
  - title: "std::forward_iterator"
    path: "iterator/forward_iterator"
  - title: "LegacyForwardIterator"
    path: "named_req/ForwardIterator"
  - title: "std::iter_value_t and related aliases"
    path: "iterator/iter_t"
  - title: "std::distance"
    path: "iterator/distance"
prerequisites:
  - "pointers-arrays-and-pointer-arithmetic"
  - "concepts-and-constraints"
---

## The one idea

An iterator category is a promise about which operations an iterator supports and what they cost. C++ has made that promise twice. The legacy **named requirements**, spelled *Cpp17InputIterator* through *Cpp17RandomAccessIterator* in the standard, date from C++98 and are checked by nobody: an iterator announces its level through a nested `iterator_category` tag, and algorithms trust the tag. The C++20 **iterator concepts**, `std::input_iterator` through `std::contiguous_iterator`, are real language concepts that the compiler checks, announced through a nested `iterator_concept` tag.

The two ladders look the same, but the rungs are defined differently. The single biggest difference is that the legacy forward iterator must return a real reference from `operator*`, and the C++20 one need not.

> **Mental model.** Every iterator has two report cards. `iterator_category` is graded under the C++98 rules, `iterator_concept` under the C++20 rules, and `std::` algorithms that predate ranges usually read the first while `std::ranges::` algorithms read the second.

## The legacy ladder

Each level adds operations and guarantees to the one below it.

```text
input        *it (read), ++it, it == j          single pass
  forward    + default-constructible, multi-pass, *it is T& or const T&
    bidirectional  + --it
      random access  + it + n, it - j, it[n], <  (all O(1))
        contiguous   + elements adjacent in memory (C++17 requirement, C++20 tag)
output       *it = v, ++it                      single pass, write only
```

The **multi-pass guarantee** is what separates input from forward. For forward iterators, `a == b` implies `++a == ++b`, and incrementing a copy does not change what the original refers to. An `std::istream_iterator` breaks this: copying it does not copy the stream, so once any copy advances, the characters it consumed are gone for everyone. That is why an algorithm like `std::search` that must revisit elements requires forward iterators, while `std::find` accepts input iterators.

The forward requirements also demand that `reference` be `T&` or `const T&`, where `T` is the value type. That clause, written for C++98, is the one proxy iterators cannot meet. Output iterators sit off to the side: they promise only that `*it = value` followed by `++it` works, and their `value_type` is usually `void`.

## The C++20 concepts

C++20 rebuilt the hierarchy on top of smaller concepts: `std::indirectly_readable`, `std::weakly_incrementable`, `std::incrementable`, and `std::sentinel_for`. The result differs from the legacy rules in ways that are deliberate.

- `std::input_iterator` does not require `==` between iterators, because the end of an input range is usually a sentinel of a different type. It does not require copyability, and postfix `++` may return `void`. A move-only generator iterator is a valid C++20 input iterator.
- `std::forward_iterator` adds `std::incrementable`, which brings in `std::regular` (copyable, default-initializable, equality comparable) and the multi-pass guarantee. It says nothing about `reference` being a language reference.
- `std::contiguous_iterator` does require `iter_reference_t<I>` to be an lvalue reference, and `std::to_address` to work, since contiguity is about real memory.

```cpp
#include <cstddef>
#include <iterator>

struct Gen {                       // move-only, no operator==
  using difference_type = std::ptrdiff_t;
  using value_type = int;
  int n = 0;
  Gen() = default;
  Gen(Gen&&) = default;
  Gen& operator=(Gen&&) = default;
  int operator*() const { return n; }
  Gen& operator++() { ++n; return *this; }
  void operator++(int) { ++n; }
};

static_assert(std::input_iterator<Gen>);     // OK in C++20
static_assert(!std::forward_iterator<Gen>);  // not copyable, so not multi-pass
```

Which tag does a concept consult? The standard defines an exposition-only alias, `ITER_CONCEPT(I)`. It uses `iterator_concept` if present, falls back to `iterator_category`, and, if `iterator_traits<I>` is the unspecialized primary template and neither member exists, assumes `random_access_iterator_tag` and lets the syntactic checks decide. Pointers are handled by the specialization `iterator_traits<T*>`, which reports `random_access_iterator_tag` as the category and `contiguous_iterator_tag` as the concept.

> **Standardese.** [iterator.concept.forward] lists the multi-pass guarantee as a semantic requirement of `std::forward_iterator`, and its only requirement on dereference is the `indirectly_readable` one inherited from input. The `T&` rule lives solely in [forward.iterators], the Cpp17ForwardIterator requirements.

## Why proxy iterators are two categories at once

`std::vector<bool>::iterator` dereferences to a proxy object, not a `bool&`. Under the C++98 rules it therefore fails the forward requirements and is, strictly, only an input iterator. Implementations nevertheless tag it `random_access_iterator_tag`, a long-standing white lie that legacy algorithms happen to tolerate. Under C++20 rules there is no lie: the iterator genuinely models `std::random_access_iterator`.

Range adaptors face the same issue honestly. A `views::transform` whose function returns by value produces elements as prvalues. Its iterator sets `iterator_concept` from the underlying range, so it can be random-access, but it sets `iterator_category` to `input_iterator_tag`, because claiming forward under C++98 rules would be false.

```cpp
#include <iterator>
#include <ranges>
#include <type_traits>
#include <vector>

std::vector<int> v{1, 2, 3};
auto t = v | std::views::transform([](int x) { return x * 2; });
using TI = std::ranges::iterator_t<decltype(t)>;

static_assert(std::random_access_iterator<TI>);    // C++20 report card
static_assert(std::is_same_v<std::iterator_traits<TI>::iterator_category,
                             std::input_iterator_tag>);  // C++98 report card
```

If the function returns a reference instead, the category is copied from the underlying iterator, except that contiguous is downgraded to random access. The same logic explains why `std::ranges::iota_view` iterators report an input category: `*it` returns an integer by value.

> **Pitfall.** Pass a transform iterator to a pre-ranges algorithm and the algorithm may treat it as single-pass. In C++20 it does not even meet the forward requirements that `std::max_element` or `std::search` state. C++23 adopted P2408, which lets algorithms that do not write through an iterator accept one that models the C++20 concept, but an implementation that dispatches on `iterator_category` may still choose the slow, step-by-step path.

## Associated types and `iterator_traits`

`std::iterator_traits<I>` exposes five legacy members: `difference_type`, `value_type`, `reference`, `pointer`, and `iterator_category`. Since C++20, if the iterator does not define them all, the primary template tries to compute them from the iterator's operations, and leaves the traits empty if it cannot recognise even an output iterator.

C++20 also added standalone aliases that are what generic code should use now:

| Alias | Meaning |
| --- | --- |
| `std::iter_value_t<I>` | the value type, with cv-qualifiers removed |
| `std::iter_reference_t<I>` | `decltype(*it)` |
| `std::iter_difference_t<I>` | the signed distance type |
| `std::iter_rvalue_reference_t<I>` | the type of `std::ranges::iter_move(it)` |
| `std::iter_common_reference_t<I>` | common reference of reference and `value_type&` |

The value type of `const int*` is `int`, not `const int`, while its reference type is `const int&`. For `std::vector<bool>::iterator`, the value type is `bool` and the reference type is the proxy class, which is exactly the split that the common reference machinery exists to bridge.

```cpp
#include <iterator>
#include <type_traits>

static_assert(std::is_same_v<std::iter_value_t<const int*>, int>);
static_assert(std::is_same_v<std::iter_reference_t<const int*>, const int&>);
static_assert(std::is_same_v<std::iter_rvalue_reference_t<int*>, int&&>);
```

These aliases read `std::indirectly_readable_traits` and `std::incrementable_traits` unless you have specialized `iterator_traits`, in which case your specialization wins.

## `advance`, `distance`, `next` and their costs

The generic iterator operations hide the category but not its cost. [iterator.operations] specifies `std::advance(it, n)` and `std::distance(first, last)` as constant time for random-access iterators and linear otherwise. `std::next` and `std::prev` are built on `advance`. Several preconditions are easy to forget:

- `std::advance` with a negative `n` requires a bidirectional iterator; for anything weaker it is undefined behavior.
- `std::distance(first, last)` requires `last` to be reachable from `first`, or, for random-access iterators, `first` reachable from `last`.
- `std::list::size()` is constant time, but `std::distance` over a list still walks every node, because a list iterator is bidirectional.

The `std::ranges` versions are concept-driven and know about sentinels. `std::ranges::distance(it, s)` is constant time whenever `s` models `std::sized_sentinel_for` its iterator, and `std::ranges::advance(it, n, bound)` stops at a bound instead of running off the end.

The legacy versions are where the two taxonomies collide in practice. With a C++20 iterator that reports a random-access concept but an input category, libc++ 21's `std::distance` increments one step at a time, while libstdc++ in GCC 16 recognises the concept and subtracts. Both are conforming. Calling `std::ranges::distance` makes the constant-time result portable.

## Output iterators

An output iterator is the write-only twin of an input iterator. `std::back_insert_iterator`, `std::ostream_iterator`, and `std::insert_iterator` are typical: `*it` returns the iterator itself, assignment through it calls `push_back` or writes to a stream, and `++it` does nothing. Their `value_type` and `reference` are `void`, so `std::iter_value_t` is not usable on them, though since C++20 `difference_type` is `std::ptrdiff_t`, so they satisfy `std::weakly_incrementable`.

The C++20 concept is `std::output_iterator<I, T>`. It takes the written type as a second parameter, because an iterator may accept some types and not others. Every mutable forward iterator is also an output iterator for its value type, but output iterators themselves guarantee only a single pass.

## What to remember

- Two taxonomies: legacy named requirements graded by `iterator_category`, and C++20 concepts graded by `iterator_concept` through `ITER_CONCEPT`.
- Multi-pass, the guarantee that copies advance independently, is what forward adds to input.
- Legacy forward requires `*it` to yield `T&` or `const T&`; `std::forward_iterator` does not, so proxy iterators can model C++20 random access.
- `views::transform` returning by value reports an input category but a random-access concept; `vector<bool>` iterators are tagged random access by convention.
- C++20 input iterators may be move-only and need not support `==`.
- `int*` reports `contiguous_iterator_tag` through `iterator_concept`, not `iterator_category`.
- Prefer `std::iter_value_t` and friends to `iterator_traits`; the value type has cv-qualifiers removed.
- `std::distance` is linear below random access, even for `std::list`; `std::ranges::distance` uses sized sentinels.
