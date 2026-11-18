---
title: "Associative and unordered containers"
summary: "The ordered containers are sorted trees driven by a comparator, and the unordered ones are hash tables driven by a hash and an equality predicate. The rules for keys, complexity, rehashing and the many insertion functions all follow from those two designs."
track: "containers"
minutes: 12
standard:
  - "[associative.reqmts]"
  - "[unord.req]"
  - "[map.access]"
  - "[map.modifiers]"
  - "[unord.hash]"
cppreference:
  - title: "std::map"
    path: "container/map"
  - title: "std::set"
    path: "container/set"
  - title: "std::unordered_map"
    path: "container/unordered_map"
  - title: "std::unordered_set"
    path: "container/unordered_set"
  - title: "std::map::try_emplace"
    path: "container/map/try_emplace"
  - title: "std::hash"
    path: "utility/hash"
  - title: "std::unordered_map::rehash"
    path: "container/unordered_map/rehash"
prerequisites:
  - "sequence-containers"
---

## The one idea

There are eight standard associative containers, and they are two designs wearing four hats each. `set`, `map`, `multiset` and `multimap` keep elements sorted by a comparator, and the logarithmic guarantees for lookup, insertion and erasure essentially force a balanced search tree. `unordered_set`, `unordered_map` and their multi versions keep elements in a hash table: lookup, insertion and erasure are constant on average and linear in the worst case.

Both designs are **node based**. Each element is its own allocation, which is why an element's address never changes while it is in the container, and why neither design has `capacity` or random access.

> **Mental model.** Ordered containers decide where a key goes with `<`, and two keys are the same key if neither is less than the other. Unordered containers decide with a hash and then `==`, and two keys are the same key if the equality predicate says so. Everything else, including what counts as a duplicate, comes from that choice.

## Ordered containers and the comparator

The comparator must be a strict weak ordering. In practice that means `comp(x, x)` is false, the relation is transitive, and "neither is less than the other" is an equivalence relation. The container never calls `==`. It calls the comparator in both directions, and two keys are the same key when `!comp(a, b) && !comp(b, a)`.

That is why a case-insensitive set is a one-line change, and why `std::less_equal` is a bug.

```cpp
#include <algorithm>
#include <cctype>
#include <set>
#include <string>

struct CaseLess {
  bool operator()(const std::string& a, const std::string& b) const {
    return std::lexicographical_compare(
        a.begin(), a.end(), b.begin(), b.end(),
        [](unsigned char x, unsigned char y) {
          return std::tolower(x) < std::tolower(y);
        });
  }
};

void demo() {
  std::set<std::string, CaseLess> names;
  names.insert("Ada");
  auto [it, ok] = names.insert("ADA");  // ok == false: equivalent to "Ada"
  // *it is still "Ada"
}
```

A comparator that is not a strict weak ordering, such as `<=`, breaks a precondition of the container and the behavior is undefined, even if one implementation happens to store two copies. A key type compared by pointer, such as `const char*`, is well-defined but orders by address, not by text.

Because the sort order is the structure, the stored key must never change. That is the reason for **key constness**: the value type of `map<K, V>` is `pair<const K, V>`, and the elements of a `set` are const. If you need to change a key, erase and reinsert, or use a node handle, which the topic on node handles covers along with transparent comparators for lookup without constructing a key.

Ordered containers also give you range queries that hash tables cannot. `lower_bound(k)` returns the first element not less than `k`, `upper_bound(k)` the first greater, and `equal_range(k)` the pair of them: the elements equivalent to `k`. Iteration visits elements in comparator order.

## Unordered containers: buckets, load factor and rehash

A hash table has an array of **buckets**. The hash of a key picks a bucket, and the equality predicate finds the key within it. The **load factor** is the average number of elements per bucket, `size() / bucket_count()`, and `max_load_factor()` is the limit, 1.0 by default. When an insertion would push the load factor above the limit, the container grows its bucket count and redistributes every element. That redistribution is a **rehash**.

```cpp
#include <cassert>
#include <unordered_set>

void demo() {
  std::unordered_set<int> s;
  s.reserve(1000);                 // buckets for 1000 elements at max_load_factor 1.0
  assert(s.bucket_count() >= 1000);
  for (int i = 0; i < 1000; ++i) s.insert(i);   // no rehash: reserved up front
}
```

`reserve(n)` is the unordered counterpart of `vector::reserve`: it is `rehash(ceil(n / max_load_factor()))`. `rehash(b)` sets the bucket count to at least `b` and at least what the current size needs. Both cost linear time on average.

The complexity bounds are averages. If many keys land in one bucket, whether by a poor hash or by an adversary, lookups degrade to linear. The standard guarantees constant time only on average and linear in the worst case.

The iteration order of an unordered container is unspecified, can differ between implementations, and can change after a rehash. Never depend on it.

**Stability across rehash** is where the node design pays off. A rehash invalidates all iterators, because iterators know about the bucket structure. It does not invalidate pointers or references to elements, because the nodes themselves are not touched. Insertion that does not trigger a rehash invalidates nothing.

## Hash requirements

The hash function must be consistent with the equality predicate: if two keys compare equal, their hashes must be equal. A hash and equality pair that violates this makes the behavior undefined, because the container will look in the wrong bucket. The hash must also return the same value for the same key within a program run.

`std::hash` has enabled specializations for the built-in arithmetic types, pointers, strings, string views, and several library types. It has none for `std::pair`, `std::tuple` or your own types, so such a key does not compile with the default hash. For a type you own, you may specialize `std::hash`, which is one of the few things the standard lets you add to `namespace std`:

```cpp
#include <cstddef>
#include <functional>
#include <unordered_map>

struct Point {
  int x, y;
  friend bool operator==(const Point&, const Point&) = default;
};

template <>
struct std::hash<Point> {
  std::size_t operator()(const Point& p) const noexcept {
    std::size_t h = std::hash<int>{}(p.x);
    return h ^ (std::hash<int>{}(p.y) + 0x9e3779b9 + (h << 6) + (h >> 2));
  }
};

std::unordered_map<Point, int> grid;   // OK: default Hash is std::hash<Point>
```

The standard provides no combiner for hashes, so the mixing step above is the usual hand-written pattern. Alternatively, pass a hash type as the container's second template argument and leave `std::hash` alone.

> **Pitfall.** Equality and hash must come from the same notion of "same key". If `operator==` ignores a field, the hash must ignore it too. A hash that includes a field the equality ignores breaks the rule above and is undefined behavior.

## Inserting and looking up

The two families share a family of insertion functions, and they differ in exactly two ways: what they do when the key already exists, and when they construct things.

```cpp
#include <map>
#include <string>
#include <utility>

struct NoDefault {
  explicit NoDefault(int v) : v(v) {}
  int v;
};

void demo() {
  std::map<std::string, int> m;
  m["a"] = 1;                      // inserts 0 if missing, then assigns
  int x = m["b"];                  // also inserts "b" -> 0; not a pure lookup
  m.insert({"c", 3});              // does nothing if "c" exists
  m.emplace("d", 4);               // may build a node first, then discard it
  m.try_emplace("e", 5);           // looks up first; arguments untouched if present
  m.insert_or_assign("a", 10);     // always ends with a == 10
  int y = m.at("a");               // throws std::out_of_range if missing
  (void)x; (void)y;

  std::map<int, NoDefault> n;
  n.try_emplace(1, 7);             // OK: constructs from args
  // n[1];                         // ill-formed: needs NoDefault()
}
```

`operator[]` is the odd one: it returns a reference to the mapped value, inserting a value-initialized one if needed, so it requires a default-constructible mapped type and does not exist on a const map. `at` is the pure lookup that reports a missing key with an exception. `find` returns an iterator and `contains` (C++20) returns a `bool`; `count` returns the number of matches.

`insert` and `emplace` return a pair of an iterator and a `bool` and never overwrite. They differ in that `emplace` may allocate a node and construct the element before it checks for the key, so with an existing key it can still move out of your arguments, whereas `try_emplace` (C++17) checks first and leaves its arguments alone. `try_emplace` also takes the key separately from the mapped value's constructor arguments, which makes it the right tool when the mapped value is expensive or move-only. `insert_or_assign` (C++17) is the one that overwrites, and, unlike `operator[]`, does not need a default constructor.

## Multi containers and `equal_range`

`multiset` and `multimap` allow equivalent keys. They have no `operator[]` or `at`, since a key may map to several values, and `insert` always succeeds, returning just an iterator. The standard guarantees that a new element goes at the upper end of its equivalent range, so equivalent elements stay in insertion order. `erase(key)` removes all of them and returns the count; to remove one, erase by iterator. `equal_range(k)` is the way to visit them all, and for the unordered multi containers it returns a range whose elements are guaranteed to be adjacent in iteration order.

> **Standardese.** [associative.reqmts] requires `Compare` to induce a strict weak ordering and defines equivalence in terms of it. [unord.req] says that if the equality predicate holds for two keys, the hash function must return the same value for both. Violating either requirement is undefined behavior, not an error the compiler can detect.

## Choosing between them

Pick an ordered container when you need sorted iteration, range queries with `lower_bound` and `upper_bound`, a worst case you can state, or a key type that has an ordering but no good hash. Pick an unordered one when lookups dominate and the keys hash well. Both pay one heap allocation per element and chase pointers on every lookup. For small collections, or ones built once and read many times, a sorted `vector` or the C++23 flat containers often beat both, as the topic on container adaptors and flat containers explains.

Reserve unordered containers when you know the size, and watch for hash quality: a hash that maps all keys to a few values turns constant time into linear time without any compiler warning.

## What to remember

- Ordered containers are sorted trees: logarithmic operations, sorted iteration, keys compared only with the comparator, which must be a strict weak ordering.
- Unordered containers are hash tables: constant on average and linear in the worst case, unspecified iteration order.
- Keys are const inside the container, because changing one would break the structure.
- A rehash invalidates iterators but not references or pointers to elements; `reserve(n)` avoids rehashing up to `n` elements.
- Equal keys must have equal hashes, and `std::hash` must be specialized or replaced for your own key types.
- `operator[]` inserts; `at` throws; `insert` and `emplace` never overwrite; `try_emplace` does not touch its arguments for an existing key; `insert_or_assign` overwrites.
- `contains` (C++20) is the clear way to test membership.
- Multi containers keep equivalent elements in insertion order, and `erase(key)` removes all of them.
