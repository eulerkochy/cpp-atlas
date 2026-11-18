---
title: "Sequence containers"
summary: "vector, deque, list, forward_list and array differ in one thing, where they put their elements, and every complexity bound, invalidation rule and exception guarantee follows from that layout. Learn the layouts and the rest can be derived."
track: "containers"
minutes: 12
standard:
  - "[sequence.reqmts]"
  - "[vector.capacity]"
  - "[vector.modifiers]"
  - "[deque.modifiers]"
  - "[list.ops]"
  - "[forward.list]"
  - "[vector.erasure]"
cppreference:
  - title: "std::vector"
    path: "container/vector"
  - title: "std::deque"
    path: "container/deque"
  - title: "std::list"
    path: "container/list"
  - title: "std::forward_list"
    path: "container/forward_list"
  - title: "std::array"
    path: "container/array"
  - title: "std::vector::reserve"
    path: "container/vector/reserve"
  - title: "std::list::splice"
    path: "container/list/splice"
prerequisites:
  - "copy-and-move"
  - "noexcept"
---

## The one idea

A sequence container keeps its elements in an order you control, and the only real design choice is where the elements live. A `vector` keeps them in one contiguous block. A `deque` keeps them in several fixed-size blocks reached through an index. A `list` and a `forward_list` give every element its own node. A `std::array` keeps them inside the object itself.

Once you know the layout you can predict almost everything the standard promises: how long an operation takes, whether pointers to elements survive it, and what happens when an element's move constructor throws.

> **Mental model.** Ask two questions of any operation. Does it need to shift or reallocate elements? If so, it costs linear time and breaks references. Does it only relink or construct one element at an end? If so, it is cheap and the rest of the container is left alone.

```text
vector      [e0 e1 e2 e3 .. spare ..]        one block, capacity >= size
deque       map -> [e0 e1 e2] [e3 e4 e5] ... blocks, index of blocks
list        e0 <-> e1 <-> e2 <-> e3          node per element, two links
forward_list e0 -> e1 -> e2 -> e3            node per element, one link
array<T,N>  [e0 e1 e2]                       inside the object, no heap
```

The block structure of `deque` is an implementation technique rather than a requirement, but the guarantees the standard states can only be met by something like it.

## What each container guarantees

| Container | Element access | Insert or erase at end | At front | In the middle |
| --- | --- | --- | --- | --- |
| `vector` | random, contiguous | amortized constant | linear | linear |
| `deque` | random, not contiguous | constant | constant | linear |
| `list` | none by index | constant | constant | constant, given an iterator |
| `forward_list` | none by index | linear to find the end | constant | constant after an iterator |

`vector` and `array` are the contiguous ones: `&v[0]` plus an offset reaches every element, so `v.data()` can be handed to a C interface. `deque` is random access but not contiguous, so it has no `data()`. `list` and `forward_list` have only bidirectional and forward iterators.

`forward_list` has no `size()` at all. The standard leaves it out so the container costs no more than a hand-written singly linked list. It also has no `push_back` and no `insert`, only `insert_after` and `erase_after`, because a node cannot reach its predecessor.

## Growth, `reserve` and `shrink_to_fit`

`vector::push_back` is amortized constant time because capacity grows geometrically. The standard does not say what the factor is, only that `capacity()` is at least `size()` and that reallocation happens only when a larger size would exceed the capacity. Do not assume doubling.

`reserve(n)` raises capacity to at least `n`, and after it, insertions will not reallocate until the size would exceed `capacity()`. That is a guarantee you can build on: iterators and references stay valid across those insertions. It does not create elements.

```cpp
#include <vector>

void demo() {
  std::vector<int> v;
  v.reserve(100);
  // v.size() == 0 and v.capacity() >= 100, but v[0] is undefined behavior.
  v.push_back(1);          // no reallocation, whatever the growth policy is
  v.resize(10);            // this is what creates elements
  v.shrink_to_fit();       // a request: capacity() may stay larger
}
```

`shrink_to_fit` is explicitly a non-binding request. An implementation may ignore it, and if it does reallocate, everything is invalidated. If you must release the storage, destroy the vector or swap it with an empty one.

A `deque` has no `capacity`, `reserve` or `data`. `list` and `forward_list` have none of these either: there is nothing to reserve when every element is its own allocation.

## Reallocation and `noexcept` moves

When a `vector` runs out of room it allocates a new block and relocates the old elements. It must keep the strong exception guarantee for `push_back`: if something throws, the vector is as it was before. Moving elements out of the old block would break that, because a throwing move leaves some elements already stolen.

So the implementation uses `std::move_if_noexcept`. If the move constructor is `noexcept`, or the type cannot be copied, elements are moved. Otherwise they are copied, and the originals stay safe until the copy finishes.

```cpp
#include <cstdio>
#include <vector>

struct Slow {
  Slow() = default;
  Slow(const Slow&) { std::puts("copy"); }
  Slow(Slow&&) { std::puts("move"); }   // forgot noexcept: growth copies
};

struct Fast {
  Fast() = default;
  Fast(const Fast&) { std::puts("copy"); }
  Fast(Fast&&) noexcept { std::puts("move"); }  // growth moves
};
```

This is why a missing `noexcept` on a move constructor is a performance bug that no test fails on. The rule is covered in depth in the topic on `noexcept`. The standard requires the strong guarantee for a single `push_back` of a copyable type, and the mainstream implementations meet it with `move_if_noexcept`.

> **Pitfall.** A move-only type whose move constructor can throw is moved anyway, because there is no copy to fall back on. If that move throws during growth, the standard says the effects are unspecified.

## `emplace_back` versus `push_back`

`push_back(x)` takes an already-built element, copies or moves it into the new slot. `emplace_back(args...)` forwards its arguments to a constructor and builds the element in place. The saved temporary rarely matters for cheap types, but two differences are about correctness.

First, `emplace_back` can call an `explicit` constructor, where `push_back(3)` cannot convert an `int` into an explicit-constructible `P` and is rejected. That cuts both ways: `emplace_back` also makes it easy to construct something you did not mean to. Second, `emplace_back` returns a reference to the new element since C++17, so you can use the new element straight away.

```cpp
#include <string>
#include <vector>

struct P {
  explicit P(int);
};

void f(std::vector<P>& v, std::vector<std::string>& s) {
  v.emplace_back(1);        // OK: explicit constructor, called directly
  // v.push_back(1);        // ill-formed: needs an implicit conversion
  s.push_back("abc");       // builds a std::string temporary, then moves it
  s.emplace_back("abc");    // builds the std::string directly in the slot
}
```

The argument may even alias an element: `v.push_back(v[0])` is required to work, even when it reallocates, so implementations construct the new element before destroying the old block.

## `deque` and `list`: what stays put

`deque` keeps its element blocks where they are when you add at either end. The index of blocks may be rebuilt, so every iterator is invalidated, but no element moves, so references and pointers survive. Inserting or erasing in the middle shifts elements and invalidates everything.

```cpp
#include <deque>

void demo() {
  std::deque<int> d{1, 2, 3};
  int& r = d[1];
  d.push_front(0);
  d.push_back(4);
  r = 99;                   // OK: references survive end insertions
  // an iterator taken before the pushes would be invalid here
}
```

The full table of rules lives in the topic on iterator invalidation. A `list` is the extreme case: no element ever moves, so only iterators to the erased elements die. That also makes `splice` possible. `a.splice(pos, b, it)` relinks one node from `b` into `a` in constant time. No element is copied or destroyed, so references stay valid and iterators keep referring to the same elements, now as iterators into `a`.

```cpp
#include <list>

void demo() {
  std::list<int> a{1, 2, 3}, b{4, 5};
  auto it = a.begin();
  b.splice(b.end(), a, it);   // constant time; *it is still 1, now inside b
  b.splice(b.end(), a);       // moves everything left in a: also constant
}
```

Splicing a range `[first, last)` from a different list is linear in the length of the range, because the destination's `size()` must be updated and `list::size()` is constant time. Same list, constant.

`forward_list` has the matching operations with `_after` names: `splice_after`, `insert_after`, `erase_after`, and `before_begin()` to get a position before the first element. `merge`, `sort`, `reverse`, `remove` and `unique` are member functions on both list types, because the generic algorithms need random access or cannot relink nodes.

## Erasing and the C++20 and C++23 additions

Removing elements by value or predicate used to mean the erase-remove idiom: `v.erase(std::remove_if(...), v.end())`. C++20 added non-member `std::erase(c, value)` and `std::erase_if(c, pred)` for `vector`, `deque`, `list` and `forward_list`, and `erase_if` for the associative containers too. They return the number of removed elements. For `list` and `forward_list` they call the member `remove_if`, which relinks nodes; for `vector` and `deque` they do the erase-remove idiom.

```cpp
#include <vector>

void demo() {
  std::vector<int> v{1, 2, 3, 4, 5, 6};
  auto n = std::erase_if(v, [](int x) { return x % 2 == 0; });
  // n == 3, v == {1, 3, 5}
  (void)n;
}
```

C++23 added range-aware members. `insert_range(pos, rg)` inserts a whole range and returns an iterator to the first inserted element. `append_range(rg)` adds at the end and returns `void`. `assign_range` replaces the contents. `forward_list` has `insert_range_after` and `prepend_range` instead. They avoid the temporary container and let `vector` allocate once when the range's size is known. The inserted range must not overlap the container itself.

## Choosing

Start with `vector`; it wins more often than its complexity table suggests, because contiguous memory is friendly to caches and prefetchers. A `list` earns its place only when you need stable iterators and references through arbitrary insertion and removal, or constant-time `splice`. Reach for `deque` when you need both-end insertion with reference stability, a queue that grows at the back and shrinks from the front, or very large containers where reallocating one huge block hurts. Use `forward_list` only when per-element overhead of one pointer matters. Use `std::array` when the size is a compile-time constant; its details belong to the topic on `array`, `bitset` and `vector<bool>`.

> **Standardese.** [list.ops] says that after a splice, pointers and references to the moved elements refer to the same elements as members of the destination, and iterators keep referring to their elements but behave as iterators into the destination. [vector.capacity] says no reallocation takes place after `reserve` until an insertion would make the size exceed the capacity, and describes `shrink_to_fit` as a non-binding request.

## What to remember

- Layout decides everything: contiguous block, block index, one node per element, or inline storage.
- `vector` growth is amortized constant, with an unspecified factor; `reserve` creates capacity, not elements.
- `shrink_to_fit` and `reserve` beyond capacity can reallocate; only `reserve` gives a guarantee about later insertions.
- Growth moves elements only when their move is `noexcept` or they cannot be copied; otherwise it copies. Mark moves `noexcept`.
- `emplace_back` constructs in place and can call explicit constructors; `push_back` takes a finished element.
- `deque` end insertions invalidate iterators but not references; middle insertions invalidate both.
- `list::splice` moves nodes without touching elements, so iterators stay valid and now belong to the destination.
- `forward_list` has no `size()`, and its operations act after a position.
- C++20 `erase` and `erase_if` replace the erase-remove idiom; C++23 `insert_range` and `append_range` take whole ranges.
- Default to `vector`, and change only for a stated reason.
