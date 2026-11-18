---
title: "The algorithm library"
summary: "Standard algorithms work on iterator ranges, not containers, and every requirement they state about iterators, callables and sortedness is a precondition you must meet. The ranges versions add projections, sentinels and richer return types, but keep the same contracts."
track: "algorithms-and-ranges"
minutes: 15
standard:
  - "[algorithms.requirements]"
  - "[algorithms.results]"
  - "[alg.copy]"
  - "[alg.remove]"
  - "[alg.unique]"
  - "[alg.sorting]"
  - "[alg.binary.search]"
  - "[alg.partitions]"
  - "[alg.heap.operations]"
cppreference:
  - title: "Algorithms library"
    path: "algorithm"
  - title: "Constrained algorithms"
    path: "algorithm/ranges"
  - title: "std::remove, std::remove_if"
    path: "algorithm/remove"
  - title: "std::copy, std::copy_if"
    path: "algorithm/copy"
  - title: "std::lower_bound"
    path: "algorithm/lower_bound"
  - title: "std::make_heap"
    path: "algorithm/make_heap"
prerequisites:
  - "iterator-categories-and-concepts"
  - "lambdas"
---

## The one idea

An algorithm sees two iterators and, sometimes, a function object. It never sees the container. That single fact explains most surprises: `std::remove` cannot shrink a vector, `std::sort` cannot work on a `std::list`, and nothing stops you from handing an algorithm a range it was never meant to accept.

Everything the algorithm needs from you is a precondition. The iterator category, the sortedness of the input, the purity of a predicate, the non-overlap of source and destination: break any of them and the standard owes you nothing, usually undefined behavior. In return, the standard gives exact complexity bounds, often as a count of comparisons or assignments rather than a big-O estimate.

> **Mental model.** An algorithm is a loop with a contract. It moves and compares elements inside the range you name, it returns an iterator to tell you where the interesting part ends, and it trusts every precondition without checking it.

## Ranges, iterators and callables

A range is half-open, `[first, last)`: `first` is included and `last` is not, so an empty range is `first == last` and the number of elements is `last - first`. Algorithms return iterators in the same convention, which is why "not found" is reported by returning `last`.

The names of template parameters carry requirements. A parameter called `InputIterator` must meet the input-iterator requirements, `ForwardIterator` must be multi-pass, and so on. `std::sort` asks for `RandomAccessIterator`, which a `std::list` iterator is not, so `std::sort(l.begin(), l.end())` violates the requirement; in practice it fails to compile deep inside the implementation, where it tries to subtract two list iterators. That is why `std::list` has its own `sort` member.

Function objects come with two rules from [algorithms.requirements] that matter in practice:

- A predicate must not modify elements through the iterator it is given, and calling it on a `const` view of the same element must give the same answer.
- Unless an algorithm says otherwise, it may copy function objects freely. A predicate that keeps state in itself may see that state split across copies.

```cpp
#include <vector>
#include <algorithm>

void demo() {
  std::vector<int> v{1, 2, 3, 4, 5, 6, 7, 8, 9};
  auto third = [n = 0](int) mutable { return ++n == 3; };
  // Not guaranteed to remove only the third element.
  // libstdc++ removes 3 and 6 (the predicate is copied after a find_if);
  // libc++ removes only 3.
  v.erase(std::remove_if(v.begin(), v.end(), third), v.end());
}
```

If you need shared state, keep it outside the function object and capture it by reference, or wrap the object in `std::ref`. `std::for_each` is the exception that returns its function object, so it can be used to accumulate.

## What `remove` and `unique` actually do

`std::remove(first, last, value)` shifts the elements to keep towards the front, preserving their order, and returns an iterator to the new logical end. The physical size of the container does not change. The elements in `[result, last)` are in a valid but unspecified state, because the algorithm may have moved from them; for `int` they usually still hold old values, for `std::string` they may be empty.

```cpp
#include <algorithm>
#include <vector>

void demo() {
  std::vector<int> v{1, 2, 3, 2, 5};
  auto it = std::remove(v.begin(), v.end(), 2);
  // v.size() is still 5, it - v.begin() is 3, v starts with 1 3 5
  v.erase(it, v.end());   // the erase-remove idiom: now v.size() is 3
}
```

Since C++20, `std::erase(v, value)` and `std::erase_if(v, pred)` do both steps for `vector`, `deque`, `basic_string`, `list` and `forward_list`; for the two lists they use the efficient member functions.

`std::unique` follows the same pattern but only collapses **adjacent** equal elements. `{1, 1, 2, 1, 1}` becomes `{1, 2, 1}` after erase-unique, not `{1, 2}`. To remove all duplicates, sort first. `remove`, `remove_if` and `unique` are stable: the kept elements stay in their original order.

> **Standardese.** [alg.remove] states that each element in `[ret, last)` has a valid but unspecified state, and it calls the algorithms stable. [alg.unique] requires the comparison to be an equivalence relation, and the result keeps only the first element of each group of consecutive equivalent elements.

## Copying, overlap and in-place transforms

`std::copy(first, last, d_first)` assigns forward, from `first` towards `last`. Its precondition is that `d_first` is not in `[first, last)`. Copying a range onto an overlapping destination that starts inside the source is undefined behavior: a forward loop would overwrite elements before reading them, and an implementation is free to use `memmove`, a vectorised loop, or anything else.

When the destination overlaps the source on the right, use `std::copy_backward`, which takes the end of the destination and assigns from the back. Its precondition is the mirror image: `d_last` must not be in `(first, last]`. `std::move` and `std::move_backward` follow the same rules.

```cpp
#include <algorithm>
#include <vector>

void demo() {
  std::vector<int> v{1, 2, 3, 4, 5};
  // std::copy(v.begin(), v.begin() + 3, v.begin() + 1);   // UB: overlap
  std::copy_backward(v.begin(), v.begin() + 3, v.begin() + 4);
  // v is now 1 1 2 3 5
}
```

`std::transform` is different: its specification explicitly allows the output to equal the input, so `std::transform(v.begin(), v.end(), v.begin(), f)` is a well-defined in-place update. Partial overlap is still not allowed.

## Sorting and sorted-range algorithms

`std::sort` is unstable: equivalent elements may be reordered. Since C++11 it guarantees *O*(*N* log *N*) comparisons in the worst case; C++03 only promised that on average. `std::stable_sort` keeps equivalent elements in order and performs *O*(*N* log *N*) comparisons if it can allocate a buffer, and *O*(*N* log² *N*) otherwise. `std::partial_sort` sorts only a prefix, and `std::nth_element` puts one element in its sorted position with smaller ones before it, in linear time on average.

All of these need a comparator that is a strict weak ordering. What that means and what breaks without it belongs to its own topic; the short version is that `<=` is not one, and using it is undefined behavior.

The binary-search family, `lower_bound`, `upper_bound`, `equal_range` and `binary_search`, does not actually require a sorted range. It requires the range to be **partitioned** with respect to the value being searched: all elements for which `e < value` come before all others. A sorted range satisfies this for every value, but an unsorted one may satisfy it for some.

```cpp
#include <algorithm>
#include <vector>

std::vector<int> v{3, 1, 2, 5, 9, 7};      // not sorted
auto it = std::lower_bound(v.begin(), v.end(), 5);
// well-defined: {3,1,2} are < 5 and {5,9,7} are not; it - v.begin() is 3
```

When the precondition is violated, the result is not merely a wrong answer that the standard specifies; it is a precondition violation with undefined behavior. In practice you get an arbitrary iterator. `lower_bound` performs about log₂(*N*) comparisons, plus a constant, for any forward iterator, but advancing a forward iterator is linear, so on a `std::list` it saves comparisons, not steps.

The same goes for `merge`, `includes`, `set_union`, `set_intersection` and `set_difference`: they all expect input sorted by the comparator you pass them.

> **Pitfall.** Sorting with one comparator and searching with another is a silent precondition violation. If you sort by `name` and then call `lower_bound` comparing by `id`, the range is not partitioned with respect to the search and the result is meaningless.

## Partitions and heaps

`std::partition` reorders a range so that elements satisfying a predicate come first, and returns the boundary. It is unstable and uses linear predicate applications; `std::stable_partition` preserves order, at the cost of a buffer or *O*(*N* log *N*) swaps. `std::partition_point` finds the boundary of an already partitioned range by binary search, which is what the binary-search family does internally.

The heap algorithms maintain a binary max-heap inside a random-access range, the structure `std::priority_queue` is built on.

```cpp
#include <algorithm>
#include <vector>

void demo() {
  std::vector<int> v{3, 1, 4, 1, 5, 9, 2, 6};
  std::make_heap(v.begin(), v.end());   // v.front() is 9, the largest
  std::pop_heap(v.begin(), v.end());    // moves 9 to v.back(), re-heaps the rest
  v.pop_back();                         // the container removes it
}
```

`make_heap` uses at most 3*N* comparisons, `push_heap` and `pop_heap` logarithmic. Like `remove`, `pop_heap` cannot change the container's size; it only moves the top element to the end.

## The `std::ranges` versions

C++20 added constrained versions in `std::ranges` for almost every algorithm. They differ in four ways.

1. **Concepts.** Requirements are checked with concepts such as `std::sortable` and `std::indirect_unary_predicate`, so passing a `std::list` to `std::ranges::sort` fails at the call with a readable diagnostic.
2. **Ranges and sentinels.** They accept a whole range, or an iterator and a sentinel of a different type, such as a null terminator or an unbounded count.
3. **Projections.** An extra callable is applied to each element before the predicate or comparator sees it, so `std::ranges::sort(people, {}, &Person::age)` sorts by age with the default `std::ranges::less`.
4. **Return types.** They return what they computed instead of discarding it: `ranges::copy` returns an `in_out_result` holding both end iterators, `ranges::remove` returns a `subrange` of the leftover tail, and `ranges::sort` returns the end iterator.

```cpp
#include <algorithm>
#include <string>
#include <vector>

struct Person { std::string name; int age; };

void tidy(std::vector<Person>& ps) {
  std::ranges::sort(ps, {}, &Person::age);
  auto tail = std::ranges::remove(ps, 0, &Person::age);  // subrange to erase
  ps.erase(tail.begin(), tail.end());
}
```

These are function objects, not function templates, so argument-dependent lookup never finds them and you cannot pass explicit template arguments; the topic on customization points and niebloids covers why. When a ranges algorithm is called on an rvalue range whose iterators would dangle, it returns `std::ranges::dangling` instead, which is the subject of the topic on borrowed ranges.

The legacy algorithms still have one thing the ranges versions in C++23 lack: overloads taking an execution policy for parallel execution.

## What to remember

- Algorithms see iterators, not containers, so they never change a container's size.
- Requirements on iterators, predicates and input order are preconditions; violating them is undefined behavior.
- Function objects may be copied freely; keep mutable state outside them.
- `remove` and `unique` return the new logical end; erase the tail, or use C++20 `std::erase_if`. The tail is valid but unspecified.
- `unique` only collapses adjacent duplicates.
- `copy` forbids a destination starting inside the source; use `copy_backward` for overlap to the right. `transform` may write in place.
- `sort` is unstable with worst-case *O*(*N* log *N*) since C++11; `stable_sort` keeps equivalent elements in order.
- Binary searches need the range partitioned with respect to the value, under the same comparator.
- `ranges::` algorithms add concepts, sentinels, projections and informative return types, and are not found by ADL.
