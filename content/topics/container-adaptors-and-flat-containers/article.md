---
title: "Container adaptors and flat containers"
summary: "stack, queue and priority_queue restrict a real container to a narrow interface, and the C++23 flat_map and flat_set family turns sorted vectors into associative containers. Both trade a wide interface for a layout you can reason about, and both have sharp edges."
track: "containers"
minutes: 12
standard:
  - "[container.adaptors]"
  - "[stack]"
  - "[queue]"
  - "[priority.queue]"
  - "[flat.map]"
  - "[flat.set]"
cppreference:
  - title: "std::stack"
    path: "container/stack"
  - title: "std::queue"
    path: "container/queue"
  - title: "std::priority_queue"
    path: "container/priority_queue"
  - title: "std::flat_map"
    path: "container/flat_map"
  - title: "std::flat_set"
    path: "container/flat_set"
  - title: "std::sorted_unique"
    path: "container/sorted_unique"
  - title: "std::flat_map::extract"
    path: "container/flat_map/extract"
prerequisites:
  - "sequence-containers"
  - "associative-and-unordered-containers"
  - "iterator-invalidation"
---

## The one idea

A container adaptor is not a container. It holds a real container, the **underlying container**, as a data member and exposes only a few operations on it. `stack` shows the back, `queue` shows both ends, and `priority_queue` keeps a heap inside a random access container and shows only the largest element. The restriction is the feature: it states what the program needs and prevents anything else.

The C++23 flat containers use the same trick in the other direction. `flat_map` and `flat_set` hold a sorted sequence container, or two for a map, and add associative operations on top. They are adaptors that give you the interface of `map` and `set` with the layout of a sorted `vector`.

> **Mental model.** An adaptor is a wrapper around a sequence container plus an invariant it maintains for you. A stack's invariant is "only the back is touched", a priority queue's is "the underlying range is a heap", and a flat map's is "keys are sorted and unique and values line up with them".

## `stack`, `queue` and `priority_queue`

The defaults are `deque` for `stack` and `queue`, and `vector` for `priority_queue`. You may substitute any container that supplies the operations the adaptor calls. A stack needs `back`, `push_back` and `pop_back`. A queue needs `front`, `back`, `push_back` and `pop_front`, so it works over `deque` and `list` but not `vector`. A priority queue needs random access iterators, plus `front`, `push_back` and `pop_back`.

The requirements are checked lazily. A `std::queue<int, std::vector<int>>` can be declared and pushed to, and fails to compile only when you call `pop()`, which needs `pop_front`.

```cpp
#include <list>
#include <queue>
#include <stack>
#include <vector>

std::stack<int, std::vector<int>> s;   // a vector-backed stack: common and fast
std::queue<int, std::list<int>> q;     // OK: list has pop_front
// std::queue<int, std::vector<int>> bad; bad.pop();   // ill-formed: no pop_front
```

The interface is deliberately small. There are no iterators, so you cannot walk a stack, a queue or a priority queue; popping is the only way to see an element other than the top. `pop()` returns `void`, and `top()` and `front()` return references. A `pop` that returned the element by value could lose it if the copy or move out of the container threw, so the standard splits reading from removing. Calling `top`, `front` or `pop` on an empty adaptor is undefined behavior.

## `priority_queue`: comparator direction and the const top

`priority_queue<T, Container, Compare>` keeps the elements of its container arranged as a heap using `push_heap` and `pop_heap`. `push` and `pop` are logarithmic, `top` is constant, and building from a range is linear.

The comparator is where people trip. `Compare(a, b)` returns true when `a` comes before `b` in a weak ordering, and the queue's top is the element that comes last. The default `std::less` therefore produces a max-heap, and `std::greater` a min-heap. The comparator expresses "is lower priority than", not "should be served first".

```cpp
#include <functional>
#include <queue>
#include <vector>

std::priority_queue<int> maxq;                                         // top is largest
std::priority_queue<int, std::vector<int>, std::greater<int>> minq;   // top is smallest
```

`top()` returns a `const` reference, because changing the top element in place would silently break the heap. That has a consequence for move-only or expensive elements: `std::move(pq.top())` is a `const T&&`, which binds to the copy constructor, so you copy and leave the original in the queue.

> **Pitfall.** `T x = std::move(pq.top()); pq.pop();` compiles and runs, but it copies every time. The compiler may warn about the redundant move, which is a hint that it does nothing.

There is no member that extracts an element, but the underlying container and comparator are `protected` members named `c` and `comp`, and the standard specifies that, so a derived class can pop the heap properly and move the element out.

```cpp
#include <algorithm>
#include <functional>
#include <queue>
#include <utility>
#include <vector>

template <class T, class C = std::vector<T>, class Cmp = std::less<T>>
struct MovablePQ : std::priority_queue<T, C, Cmp> {
  T pop_value() {
    std::pop_heap(this->c.begin(), this->c.end(), this->comp);  // top moves to the back
    T v = std::move(this->c.back());
    this->c.pop_back();
    return v;
  }
};
```

C++23 adds range constructors that take `std::from_range`, and `push_range` members, to all three adaptors.

## Flat containers: sorted vectors with a map interface

C++23 added `flat_map`, `flat_set`, `flat_multimap` and `flat_multiset`. A `flat_set<T>` is a sorted `vector<T>` with no duplicates. A `flat_map<K, V>` is two vectors: a sorted vector of keys, and a vector of values where position `i` belongs to key `i`. The container types are template parameters, so you may use `deque` or any other random access container instead of `vector`.

```text
flat_map<int,char>:   keys   [ 1   3   7   9 ]   sorted, unique
                      values [ a   b   c   d ]   same positions
```

The trade-offs follow from that layout. Lookup is a binary search over contiguous memory, so it is logarithmic and cache friendly. Iteration is a linear scan and is very fast. Insertion and erasure in the middle shift elements of both vectors, so they are linear in the size. That is the opposite of `std::map`, where every operation is logarithmic and every access chases a pointer. A flat container wins when it is built once and read often, when it is small, or when iteration dominates; it loses on large containers with frequent random insertion.

Because the storage is a plain sequence, there are no nodes. That has three consequences. There are no node handles and no `merge`. Insertion and erasure invalidate iterators, references and pointers the way `vector` does, so treat every modification as invalidating everything; `clear` certainly does. And the memory is reusable: you can take the underlying containers out and put them back.

```cpp
#include <flat_map>
#include <utility>
#include <vector>

void demo() {
  std::flat_map<int, char> m{{3, 'c'}, {1, 'a'}};
  auto c = std::move(m).extract();       // m is now empty; c.keys == {1, 3}
  c.values[0] = 'z';                     // plain vectors, edit freely
  m.replace(std::move(c.keys), std::move(c.values));  // keys must be sorted, unique
}
```

`extract()` is rvalue-qualified and moves out both containers as a struct with `keys` and `values` members, leaving the map empty. `replace(keys, values)` installs them again, and the sizes must match, the keys must be sorted by the comparator, and they must be unique, or the behavior is undefined. `keys()` and `values()` give const access to the vectors without extracting.

## Building: `sorted_unique` and the cost of trust

Constructing from a general range sorts and removes duplicates. If you already have sorted, unique data, the tag `std::sorted_unique` says so and skips that work. The constructor believes you: if the data is not sorted or has equivalent keys, the behavior is undefined.

```cpp
#include <flat_map>
#include <flat_set>
#include <vector>

void demo() {
  std::vector<int> keys{1, 2, 3}, vals{10, 20, 30};
  std::flat_map<int, int> a(std::sorted_unique, keys, vals);   // trusted: O(n)
  std::flat_set<int> b{3, 1, 2, 3};                            // sorted, deduplicated
  // std::flat_set<int> c(std::sorted_unique, {3, 1, 2});      // undefined behavior
  (void)a; (void)b;
}
```

For bulk loading prefer `insert(first, last)` or `insert_range`, which append and merge, over a loop of single insertions that each shift the tail. For multi variants the tag is `std::sorted_equivalent`, which allows equal keys but still requires sorted order.

## The proxy-like reference of `flat_map`

A `flat_map` has no `pair<K, V>` objects in memory, so dereferencing an iterator cannot return a reference to one. Its `reference` type is `pair<const K&, V&>`, built on the fly and returned by value, while `value_type` is `pair<K, V>`. That differs from `map`, whose value type is `pair<const K, V>`, and it changes code that works with `map`.

```cpp
#include <flat_map>

void demo() {
  std::flat_map<int, int> m{{1, 10}, {2, 20}};
  // for (auto& [k, v] : m) v += 1;   // ill-formed: cannot bind auto& to a prvalue
  for (auto&& [k, v] : m) v += 1;     // OK
  for (auto [k, v] : m) v += 1;       // also modifies m: auto copies the pair of references
}
```

The last loop is the one that bites. `auto` copies the pair, but the pair holds references, so the value is still modified in the map. Write `auto&&`, or `const auto&` for read-only loops.

The same applies to code that stores `*it` in a variable or passes it to an algorithm expecting `value_type&`. The key is never mutable: the first element of the pair is `const K&`.

## Exception safety and implementation status

Two containers must stay in step. A flat map update is a pair of operations on two vectors, so the failure modes are different from a node-based `map`, where an insertion is a single allocation and either happens or does not. The reference documents a no-effect guarantee for single-element `insert` and `emplace`, and documents nothing for the range operations, so do not assume strong exception safety for bulk updates. The underlying containers' `size` and `max_size` must not throw.

For implementation status, I compiled and ran a `flat_map` and `flat_set` program with GCC 16.2 (libstdc++) and with Homebrew LLVM 21.1.2 (libc++), both on arm64 macOS, using `-std=c++23`. Both provide `<flat_map>` and `<flat_set>`, with the multi variants. GCC reports `__cpp_lib_flat_map` and `__cpp_lib_flat_set` as 202511, libc++ as 202207. In `-std=c++20` mode GCC does not provide the types. I did not check other implementations.

> **Standardese.** The synopses in [stack], [queue] and [priority.queue] declare the underlying container `c`, and for `priority_queue` also the comparator `comp`, as protected members, which is what makes a derived class legal and portable. For `flat_map` and `flat_set`, [flat.map] and [flat.set] define the `sorted_unique` overloads and say the input must be sorted and unique with respect to the comparator, so a violation is a precondition failure and therefore undefined behavior.

## What to remember

- An adaptor wraps a container and exposes a narrow interface; the underlying container is a template parameter.
- `stack` needs a back; `queue` needs `pop_front`, so not `vector`; `priority_queue` needs random access.
- Adaptors have no iterators, `pop()` returns `void`, and `top`, `front` and `pop` on an empty adaptor are undefined behavior.
- `priority_queue` surfaces the element that is last under the comparator: `less` gives a max-heap, `greater` a min-heap.
- `top()` is const so you cannot break the heap, which means `std::move(pq.top())` copies; move out through a derived class or `pop_heap` yourself.
- `flat_map` and `flat_set` are sorted vectors: logarithmic lookup, linear insertion and erasure, fast iteration.
- No nodes means no stable references and no node handles; `extract()` and `replace()` move whole containers in and out.
- `sorted_unique` skips sorting and trusts you; wrong input is undefined behavior.
- `flat_map` dereferences to `pair<const K&, V&>`: write `auto&&`, not `auto&`, and know that `auto` still writes through.
- GCC 16.2 and libc++ 21.1 both ship the flat containers in C++23 mode.
