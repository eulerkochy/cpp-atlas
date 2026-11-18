---
title: "Iterator invalidation"
summary: "An iterator is a handle into a container's storage, and an operation invalidates it exactly when that storage or the machinery for finding it changes. Learn each container's layout and the invalidation rules can be derived rather than memorized."
track: "containers"
minutes: 12
standard:
  - "[container.reqmts]"
  - "[vector.modifiers]"
  - "[vector.capacity]"
  - "[deque.modifiers]"
  - "[list.modifiers]"
  - "[associative.reqmts]"
  - "[unord.req]"
  - "[string.require]"
cppreference:
  - title: "Iterator invalidation rules for C++ containers"
    path: "container"
  - title: "std::vector::erase"
    path: "container/vector/erase"
  - title: "std::deque::insert"
    path: "container/deque/insert"
  - title: "std::unordered_map::rehash"
    path: "container/unordered_map/rehash"
  - title: "std::erase_if (std::map)"
    path: "container/map/erase_if"
prerequisites:
  - "sequence-containers"
  - "associative-and-unordered-containers"
---

## The one idea

An iterator, a pointer and a reference to an element are three ways of naming an element, and they break for different reasons. A pointer or reference breaks when the element moves or dies. An iterator breaks in those cases too, and also when the **navigation machinery** it depends on changes: the block index of a `deque`, the bucket array of a hash table, the end of a `vector`.

So there is no table to memorize. For each container ask three questions of an operation. Did any element move in memory? Did an element die? Did the structure used to reach elements change?

> **Mental model.** Invalidation is a statement about storage, not about the operation's name. If an operation leaves every element where it is, only iterators tied to a changed structure break. If it moves elements, all names for them break.

Once invalidated, an iterator is in a singular state. The only things you may do with it are assign to it or destroy it. Dereferencing, incrementing and comparing it are all undefined behavior, even when the memory it points at looks fine.

## `vector`: contiguous storage

A `vector` has two events. **Reallocation** moves every element into a new block, so all iterators, pointers, references, and the end iterator die. This happens when the new size would exceed `capacity()`. Without reallocation, elements before the point of change stay put.

- Insertion without reallocation invalidates iterators and references at or after the insertion point, and the end iterator. Those before the point stay valid.
- Insertion that reallocates invalidates everything.
- Erasure invalidates iterators and references at or after the erased position, including the end iterator, because later elements shift down.
- `reserve` and `shrink_to_fit` invalidate everything if they reallocate, and nothing otherwise. `clear` and `assign` invalidate everything.

After `v.reserve(n)`, the standard guarantees no reallocation until the size would exceed `capacity()`, so iterators to existing elements survive appends up to that limit.

```cpp
#include <vector>

void demo() {
  std::vector<int> v{1, 2, 3};
  v.reserve(100);
  auto it = v.begin();
  v.push_back(4);   // no reallocation: it is still valid, v.end() is not
  *it = 0;          // OK

  auto e = v.end();
  v.push_back(5);
  // e is invalidated even if there was no reallocation
  (void)e;
}
```

Erasure and the saved `end()` cause the most bugs. `end()` is the one iterator that every erase and every insertion invalidates, so a loop that caches it is wrong the moment the loop body changes the vector.

## `deque`: the asymmetric one

A `deque` stores elements in fixed-size blocks and finds them through an index of blocks. Adding an element at either end may allocate a new block and grow that index, and iterators are tied to the index, so all iterators die. Elements themselves are never moved by an end insertion, so pointers and references survive.

- Insertion at the front or back invalidates all iterators, including `end()`, but no references or pointers.
- Insertion in the middle shifts elements, so it invalidates all iterators and references.
- Erasing the last element invalidates only the erased element's iterators and references, plus the end iterator.
- Erasing the first element, if it is not also the last, invalidates only that element's iterators and references.
- Erasing from the middle invalidates everything, including the end iterator.

```cpp
#include <deque>

void demo() {
  std::deque<int> d{1, 2, 3, 4};
  auto it = d.begin() + 2;     // refers to 3
  int& r = d[3];               // refers to 4
  d.erase(d.begin());          // erasing the first element: it and r stay valid
  d.push_back(5);              // it is invalid now; r is still valid
  r = 0;                       // OK
}
```

The erase-at-front rule surprises people who know that `vector` and `deque` look alike. Nothing shifts, because the front is simply abandoned.

## Node containers: `list`, `forward_list`, `map`, `set` and friends

Every element has its own node, and nodes never move. So insertion invalidates nothing, and erasure invalidates only iterators and references to the erased elements. This is the whole rule for `list`, `forward_list`, `set`, `map` and their multi versions.

Two details are worth knowing. The `end()` iterator of these containers stays valid under erase, since it does not name an element. And `list::splice` keeps iterators valid, with the caveat that they now belong to the destination list.

## Unordered containers

The nodes are stable, but iterators can walk across buckets, and the bucket array can be rebuilt. The rules are:

- Insertion that does not trigger a rehash invalidates nothing.
- Insertion that triggers a rehash invalidates all iterators, but not pointers or references to elements.
- `rehash` and `reserve` invalidate all iterators and no references.
- Erasure invalidates only the erased elements.

```cpp
#include <unordered_map>

void demo() {
  std::unordered_map<int, int> m{{1, 10}};
  auto it = m.find(1);
  int& r = it->second;
  m.reserve(1000);          // may rehash
  r = 20;                   // OK: references survive
  // *it = ...;             // undefined behavior: iterators do not
}
```

> **Pitfall.** Inserting into an unordered container while iterating over it is only safe if you know no rehash can occur. With `m.reserve` large enough up front it cannot, but without it, an insertion in a loop body can invalidate the loop's own iterator.

## `string`, swap, move and `end()`

`std::string` follows the conservative rule that nearly any non-const member call may invalidate iterators, pointers and references. The exceptions are `operator[]`, `at`, `data`, `front`, `back` and the iterator getters. One reason is the small-string optimization: short strings live inside the object, so even a swap or a move can relocate characters. Treat any mutation of a string as invalidating everything. The topic on strings covers the rest.

For the other containers, `swap` invalidates nothing. Iterators, pointers and references keep referring to the same elements, which now belong to the other container. `std::array` is the exception: its swap exchanges element values, so iterators stay associated with their original array and now see the swapped values.

```cpp
#include <vector>

void demo() {
  std::vector<int> a{1, 2, 3}, b{4, 5};
  auto it = a.begin();
  a.swap(b);
  // it still refers to the element 1, which is now b[0]
  // it == b.begin() is true; *it is 1
  (void)it;
}
```

The same logic covers moving. For all containers except `array`, move construction and move assignment with an allocator that propagates (always true for `std::allocator`) leave references, pointers and iterators into the source valid, and they refer to the elements now in the destination. This is what makes `std::vector` moves constant time. The moved-from container itself is valid but unspecified, and the `end()` iterator is never covered by these guarantees.

> **Standardese.** [container.reqmts] states that, unless otherwise specified, `swap` does not invalidate iterators, references or pointers into the swapped containers, and that move construction does not invalidate them for any container except `array`. In both cases a note adds that `end()` names no element and may be invalidated.

## Erasing while iterating

The rule for every erasing loop is the same: use the iterator the erase function returns, because the old one is dead. `erase` returns an iterator to the element after the last one removed, so the loop can carry on from there.

```cpp
#include <list>
#include <map>
#include <vector>

void demo() {
  std::vector<int> v{1, 2, 3, 4, 5, 6};
  for (auto it = v.begin(); it != v.end();) {
    if (*it % 2 == 0) it = v.erase(it);   // returns the next valid position
    else ++it;
  }

  std::map<int, int> m{{1, 1}, {2, 2}, {3, 3}, {4, 4}};
  for (auto it = m.begin(); it != m.end();) {
    if (it->first % 2 == 0) it = m.erase(it);  // C++11: erase returns the next
    else ++it;
  }

  std::list<int> l{1, 2, 3, 4};
  for (auto it = l.begin(); it != l.end();) {
    if (*it % 2 == 0) l.erase(it++);   // OK only for node containers
    else ++it;
  }
}
```

The `erase(it++)` form works because the increment happens before the call and node containers invalidate only the erased element. It would be undefined behavior for a `vector`.

Better still, do not write the loop. C++20 added `std::erase_if(container, pred)` for the sequence containers and for every associative and unordered container, and it returns the number of elements removed. For `vector` it is the erase-remove idiom in one call. The loop above that is needed only when the body needs to do more than remove.

## Why use after invalidation is undefined behavior

The standard says an invalidated iterator is singular and may only be assigned to or destroyed. The reason is practical: an iterator in most containers is a pointer or a pointer plus bookkeeping, and checking validity on every dereference would add a cost the standard does not mandate. After a reallocation, the old pointer addresses freed memory. After a rehash, the old iterator points into a bucket array that no longer exists.

That something "worked in testing" is therefore not evidence. A debug mode can catch it: libstdc++ built with `_GLIBCXX_DEBUG` aborts with a message about a singular iterator, and MSVC's iterator debugging does something similar. These are tools to find the bug, not a promise that the program is defined without them.

## What to remember

- Ask three questions: did elements move, did an element die, did the structure for finding elements change?
- `vector`: reallocation kills everything; otherwise only iterators and references at or after the change, and `end()`.
- `deque`: end insertion kills iterators but not references; erasing the first or last element is gentle; the middle kills everything.
- Node containers: insertion invalidates nothing; erase invalidates only the erased elements.
- Unordered containers: a rehash kills iterators but not references or pointers.
- `string` is conservative; `swap` and move keep iterators valid and moved to the other container, except `array`.
- `end()` is not an element, so most guarantees do not cover it. Do not cache it across modifications.
- In erase loops use the iterator that `erase` returns, or call `std::erase_if`.
- Using an invalidated iterator is undefined behavior even if it appears to work.
