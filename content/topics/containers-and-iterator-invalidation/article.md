---
title: "Containers, memory layouts, and iterator invalidation"
summary: "How physical memory layouts dictate pointer, reference, and iterator invalidation across vector, deque, list, node-based maps, unordered hash tables, and C++23 flat_map."
track: containers
minutes: 9
standard:
  - "[container.requirements]"
  - "[sequence.reqmts]"
  - "[vector.modifiers]"
  - "[deque.modifiers]"
  - "[associative.reqmts]"
  - "[unord.req]"
  - "[flat.map]"
cppreference:
  - title: "Containers library"
    path: "container"
  - title: "std::vector"
    path: "container/vector"
  - title: "std::deque"
    path: "container/deque"
  - title: "std::list"
    path: "container/list"
  - title: "std::map"
    path: "container/map"
  - title: "std::unordered_map"
    path: "container/unordered_map"
  - title: "std::flat_map"
    path: "container/flat_map"
  - title: "std::vector<bool>"
    path: "container/vector_bool"
  - title: "Container (named requirement)"
    path: "named_req/container"
  - title: "ContiguousContainer (named requirement)"
    path: "named_req/contiguouscontainer"
prerequisites:
  - object-lifetime-and-storage
  - copy-and-move
  - smart-pointers-and-allocators
---

Iterator invalidation rules are not arbitrary library trivia—they fall straight out of each container's physical memory layout. Once you separate **pointer/reference stability** (whether elements stay at the same address) from **iterator stability** (whether traversal handles remain valid), you can predict invalidation guarantees on demand.

## Why physical layout predicts invalidation

Standard containers organize memory using four distinct strategies:

1. **Single contiguous buffer** (`std::vector`, `std::string`, `std::flat_map`): elements occupy adjacent slots in one heap array; growing capacity or shifting mid-array relocates elements in memory.
2. **Spine of fixed-size chunks** (`std::deque`): a central pointer table addresses fixed-size contiguous pages; appending at either end grows the spine without relocating existing elements.
3. **Linked heap nodes** (`std::list`, `std::forward_list`, `std::map`, `std::set`): every element lives inside its own heap node linked by pointers, so elements never relocate until erased.
4. **Bucket pointer array plus linked nodes** (`std::unordered_map`, `std::unordered_set`): elements live in individual heap nodes, while a contiguous bucket array indexes node chains.

> **Mental model.** Ask two questions before mutating a container: does the operation move existing elements to new addresses (invalidating pointers and references), and does it rewrite traversal metadata or sentinel slots (invalidating iterators)?

## Contiguous sequences and the reallocation cliff

In `std::vector`, `push_back` or `emplace_back` behaves differently depending on spare capacity. When `size() < capacity()`, appending writes into uninitialized tail storage and invalidates **only** `end()`; every existing iterator, pointer, and reference remains valid. When `size() == capacity()`, reallocation allocates a larger buffer, relocates elements via `std::move_if_noexcept`, frees the old array, and invalidates **all** iterators, pointers, and references. Remember that `std::move_if_noexcept` silently falls back to copying if a type's move constructor lacks `noexcept` and its copy constructor is available, preserving the strong exception guarantee.

Inserting or erasing in the middle of a `vector` without reallocation shifts trailing elements, invalidating iterators, pointers, and references at and after the modified index (plus `end()`). Beware the self-aliasing boundary in `[sequence.reqmts]`: single-element insertion or append from the same container (`v.push_back(v[0])`) is **guaranteed** to work even across reallocation, whereas inserting an iterator range from the same container (`v.insert(v.end(), v.begin(), v.end())`) is undefined behavior!

`std::vector<bool>` is a bit-packed space optimization rather than a true `ContiguousContainer`. Its `operator[]` returns a proxy `std::vector<bool>::reference` object instead of `bool&`, breaking reference binding and hiding a dangling pointer hazard.

> **Pitfall.** Writing `auto flag = flags[0];` on a `std::vector<bool>` deduces `flag` as a proxy `reference` rather than `bool`. If `flags` reallocates or leaves scope, inspecting `flag` later triggers use-after-free; always annotate `bool flag = flags[0];` when copying out a bit.

## Deque: chunked blocks and pointer stability

`std::deque` maintains a dynamic array of pointers (the spine) pointing to fixed-size contiguous blocks. Because pushing at either end allocates a new block when needed and only reallocates the **spine**—never copying existing elements—`std::deque` splits iterator validity from pointer and reference validity.

Under `[deque.modifiers]`, `push_back`, `push_front`, `emplace_back`, and `emplace_front` invalidate **all iterators** (because deque iterators cache pointers into the spine array), yet **preserve all pointers and references** to existing elements. Erasure at the boundaries is even more surgical: `pop_front` (or erasing the first element when `size() > 1`) invalidates only iterators and references to the erased element while leaving `end()` intact; `pop_back` (or erasing the last element) invalidates only handles to the erased element and `end()`. Inserting or erasing anywhere in the middle invalidates **all** iterators, pointers, and references to every element in the deque.

## Node containers, rehashing, and node handles

Tree and list containers (`std::list`, `std::forward_list`, `std::map`, `std::set`, `std::multimap`, `std::multiset`) allocate each element in a standalone node. Inserting elements **never** invalidates any iterator, pointer, or reference, and erasing invalidates **only** handles pointing to erased nodes.

Unordered hash containers (`std::unordered_map`, `std::unordered_set`) combine a dynamic bucket pointer array with linked element nodes. Erasing an element invalidates only handles to that erased node. When insertion pushes `size() > max_load_factor() * bucket_count()`, or when `rehash()` or `reserve()` expands the bucket array, hash tables rebuild their bucket table—invalidating **all iterators** while keeping every element pointer and reference valid!

C++17 introduced `extract()` and `merge()` via `node_type` handles, letting you unlink a node from one `map` or `unordered_map` and transplant it into another with zero key/value copies or moves. Extracting invalidates iterators to the removed element, while pointers and references to that element stay valid once reinserted. For safe conditional deletion, prefer C++20 `std::erase` and `std::erase_if` over manual loop-and-erase boilerplate.

> **Standardese.** Under `[unord.req]`, rehashing an unordered associative container invalidates all iterators and may reorder elements across buckets, yet references and pointers to elements in the container remain valid.

```cpp
#include <deque>
#include <flat_map>
#include <unordered_map>
#include <vector>

void invalidation_patterns() {
    std::vector<int> vec{1, 2, 3};
    vec.push_back(vec[0]); // Well-defined self-aliasing even if vec reallocates

    std::deque<int> dq{10, 20, 30};
    int& front_ref = dq.front();
    dq.push_back(40); // Invalidates ALL iterators, yet front_ref remains valid!
    (void)front_ref;

    std::unordered_map<int, int> umap{{1, 100}};
    int& mapped_ref = umap.at(1);
    umap.rehash(64); // Invalidates ALL iterators, yet mapped_ref remains valid!
    (void)mapped_ref;

    auto node = umap.extract(1); // Moves node without copying key or value
    std::unordered_map<int, int> dest;
    dest.insert(std::move(node));

    std::flat_map<int, int> fmap{{2, 20}, {1, 10}};
    std::erase_if(fmap, [](const auto& kv) { return kv.first == 1; });
}
```

## C++23 flat_map and flat_set trade-offs

C++23 `<flat_map>` and `<flat_set>` are container adaptors storing keys and mapped values in parallel sorted contiguous sequences (typically two `std::vector` objects) instead of heap-allocated tree nodes. Searching benefits from hardware prefetching and zero per-node pointer overhead, making lookup and iteration dramatically faster on small-to-medium maps.

That contiguous layout comes with two costs: single-element `insert` and `erase` run in O(N) time by shifting trailing entries, and—like `std::vector`—any insertion or erasure may invalidate **all** iterators, pointers, and references across the entire container.

> **Pitfall.** Replacing `std::map` with `std::flat_map` silently removes pointer and reference stability. Code that saves `&cache[key]` before inserting another key compiles identically and turns into a dangling pointer on the next insertion.

Invalidation behavior across the major standard container families lines up cleanly with their backing storage:

| Container | Insert / Push (No Growth) | Reallocate / Rehash | Erase |
| --- | --- | --- | --- |
| `std::vector` | Only `end()` on `push_back`; `[pos, end()]` on mid-insert | All iterators, pointers, and references | `[pos, end()]` |
| `std::deque` | At ends: all iterators; pointers & refs stay valid | Middle insert: all iterators, pointers, and refs | Ends: erased (+ `end()` at back); middle: all |
| `std::list` / `std::map` | None | N/A (node-based) | Erased element(s) only |
| `std::unordered_map` | None (unless load factor triggers rehash) | All iterators; pointers & refs stay valid | Erased element(s) only |
| `std::flat_map` | All iterators, pointers, and references | All iterators, pointers, and references | All iterators, pointers, and references |

## What to remember

- Distinguish **iterator** invalidation from **pointer and reference** invalidation: `std::deque::push_back` and `std::unordered_map::rehash` invalidate every iterator while keeping element addresses intact.
- In `std::vector`, reallocation invalidates everything, non-reallocating `push_back` invalidates only `end()`, and range `insert` from `[i, j)` into the same `vector` is undefined behavior even though `v.push_back(v[0])` is valid.
- Mark element move constructors `noexcept` so `std::vector` growth can move instead of copying via `std::move_if_noexcept`, and never capture `std::vector<bool>` elements with `auto`.
- Use `extract()` and `merge()` to relocate nodes between associative or unordered containers without copying keys or values, and reach for `std::erase_if` for safe predicate erasure.
- Treat C++23 `std::flat_map` and `std::flat_set` like `std::vector` for invalidation: any insertion or deletion can invalidate every iterator, pointer, and reference.
