---
title: "Node handles and heterogeneous lookup"
summary: "Node handles (C++17) let you take a node out of a map or set, change its key or move its value, and put it back or into another container without copying or allocating. Heterogeneous lookup (C++14 ordered, C++20 unordered) lets you search by a type other than the key, so no temporary key has to be built."
track: "containers"
minutes: 12
standard:
  - "[container.node]"
  - "[container.insert.return]"
  - "[associative.reqmts]"
  - "[unord.req]"
cppreference:
  - title: "Node handle"
    path: "container/node_handle"
  - title: "std::map::extract"
    path: "container/map/extract"
  - title: "std::map::merge"
    path: "container/map/merge"
  - title: "std::map::insert"
    path: "container/map/insert"
  - title: "std::map::find"
    path: "container/map/find"
  - title: "std::unordered_map::find"
    path: "container/unordered_map/find"
  - title: "std::map::erase"
    path: "container/map/erase"
prerequisites:
  - "associative-and-unordered-containers"
  - "iterator-invalidation"
  - "allocators-and-pmr"
---

## The one idea

The associative containers are node-based: each element lives in its own allocation. Two features exploit that, and both are about not doing work you do not need to do.

A **node handle** is an owning pointer to one detached node. You can pull a node out of a container, edit it, and push it into the same or another container by relinking pointers. No element is copied, moved, or reallocated.

**Heterogeneous lookup** is the other direction: the container's comparison or hash is allowed to accept an argument of a type other than the key, so `find("literal")` does not have to build a `std::string` just to throw it away.

> **Mental model.** A node handle is a `unique_ptr` to a map or set node, and it stops being a view of the container the moment it is extracted. Heterogeneous lookup is a promise that comparing a key with a foreign type gives the same answers as comparing keys.

## Extracting and inserting nodes

`extract` takes an iterator or a key. It unlinks the node, with no allocation and no element move, and returns a handle of type `node_type`. If the key is absent it returns an empty handle. The handle is move-only, and if it is destroyed while holding a node, it destroys the element and frees the node.

The reason this matters for maps: a `map` key is `const`, so there is normally no way to rename an element short of erasing it and inserting a copy. With a node handle the key is accessible and writable.

```cpp
#include <map>
#include <string>

void rename_key() {
  std::map<int, std::string> m{{1, "a"}, {2, "b"}};
  auto nh = m.extract(1);       // unlinked; m is now {2:"b"}
  nh.key() = 3;                 // non-const access to the key
  m.insert(std::move(nh));      // relinked at the position for 3; no allocation
  // m is {2:"b", 3:"a"}
}
```

Sets get the same benefit, since `set` elements are also `const`. A set node's `value()` is a mutable reference, so you can move an element out of a set, which nothing else allows.

```cpp
#include <memory>
#include <set>

std::unique_ptr<int> take(std::set<std::unique_ptr<int>>& s) {
  return std::move(s.extract(s.begin()).value());
}
```

> **Standardese.** [container.node] describes a node handle as owning an element and its allocator, and being empty after a move. Extraction invalidates only iterators to the extracted element. Pointers and references to it remain valid but may not be used to access the element while a handle owns it. They become usable again if the element is inserted into a container.

That last sentence is easy to misread as a promise that references are always fine. They are fine only before extraction and after reinsertion, not in between.

The node handle's `key()` and `mapped()` exist only for map nodes, and `value()` only for set nodes. All three have undefined behavior on an empty handle, and so does `get_allocator()`. Use `empty()` or `explicit operator bool` to check.

## The result of inserting a node

For a unique container (`map`, `set`, and their unordered cousins), inserting a node can fail if an equivalent key is already present. `insert(node_type&&)` returns an `insert_return_type`, an aggregate with three members: `position`, an iterator; `inserted`, a bool; and `node`, a node handle.

- If the handle was empty: `inserted` is false, `position` is `end()`, and `node` is empty.
- If insertion happened: `inserted` is true, `position` points at the new element, and `node` is empty.
- If it failed because of a duplicate: `inserted` is false, `position` points at the element that blocked it, and `node` **still owns the element you tried to insert**.

```cpp
#include <set>

void dup() {
  std::set<int> s{1, 2};
  auto nh = s.extract(1);
  s.insert(1);                        // someone else took key 1
  auto r = s.insert(std::move(nh));
  // r.inserted == false; *r.position == 1; r.node is not empty: it still owns the extracted 1
}
```

That third case is why the return type carries the node: otherwise a failed insertion would destroy the element you extracted, silently. Multiset and multimap cannot fail on duplicates, so their `insert(node_type&&)` returns a plain iterator. The hinted overload `insert(hint, nh)` also returns an iterator, and if insertion fails, the argument handle keeps ownership.

## Merging containers

`a.merge(b)` extracts every element of `b` whose key does not already exist in `a` and inserts it into `a`, using `a`'s comparator or hash. Elements with duplicate keys stay in `b`. No element is copied or moved, and pointers and references to the transferred elements remain valid, but refer into `a`. Do not keep using iterators to the transferred elements.

```cpp
#include <map>
#include <string>

void merging() {
  std::map<int, std::string> m1{{1, "a"}, {2, "b"}};
  std::map<int, std::string> m2{{2, "X"}, {3, "c"}};
  m1.merge(m2);
  // m1 is {1:"a", 2:"b", 3:"c"}; m2 is {2:"X"}: the duplicate stayed behind
}
```

The two containers may differ in comparison or hash, and a `map` can merge from a `multimap` and the reverse, as long as key, mapped type, and allocator types match. The same compatibility lets you insert a node extracted from a `std::map` into a `std::multimap`.

## Allocators

A node handle carries a copy of its source container's allocator, because it needs it for destruction. Inserting a node, and merging, requires the allocators to compare equal. The behavior is undefined otherwise, even though the code compiles.

This bites in practice with `std::pmr` containers: two `pmr::map` objects backed by different memory resources have unequal allocators, so moving a node between them is undefined behavior, even though each is a `pmr::map<int, int>`. Copy the element in that case. With the default `std::allocator`, which is always equal, the problem does not arise.

> **Pitfall.** `extract` plus `insert` across containers is a pointer splice, which only works if the node's memory can legally be freed by the destination container. Unequal allocators violate that, and the standard declares it undefined instead of making the container reallocate.

## Heterogeneous lookup

`std::map<std::string, int>` uses `std::less<std::string>`. Calling `find("a literal")` converts the argument to a `std::string`, and a long text means a heap allocation, to do one comparison. Passing a `std::string_view` does not compile at all, since there is no implicit conversion from it to `std::string`.

Since C++14, ordered containers support lookup with another type when the comparator is **transparent**: it has a nested type named `is_transparent`. `std::less<>`, which is `std::less<void>`, is transparent and forwards to `operator<` on whatever types it is given.

```cpp
#include <map>
#include <string>
#include <string_view>

void lookup() {
  std::map<std::string, int> plain;
  std::map<std::string, int, std::less<>> open;
  std::string_view key = "needle";
  // plain.find(key);          // ill-formed: no overload takes string_view
  open.find(key);              // OK: compares string_view with string directly
  open.count("literal");       // OK: no temporary std::string
}
```

The overloads that gain a template form are `find`, `count`, `contains`, `lower_bound`, `upper_bound` and `equal_range`. Declaring the map with `std::less<>` changes its type, so it cannot be assigned to `std::map<std::string, int>`.

### Unordered containers (C++20)

The unordered containers need two transparent parts: a hash and an equality predicate. `std::hash<std::string>` is not transparent, so you write your own, and the hash must give the same value for a `string_view` as for the equal `std::string`. The simple way is to hash through `string_view`:

```cpp
#include <functional>
#include <string>
#include <string_view>
#include <unordered_map>

struct StrHash {
  using is_transparent = void;
  std::size_t operator()(std::string_view s) const {
    return std::hash<std::string_view>{}(s);
  }
};

using Table = std::unordered_map<std::string, int, StrHash, std::equal_to<>>;

int get(const Table& t, std::string_view k) {
  auto it = t.find(k);                 // OK since C++20: no std::string built
  return it == t.end() ? 0 : it->second;
}
```

### Erase and extract (C++23), insertion (C++26)

C++23 added template overloads of `erase` and `extract` that take a transparent key, so `m.erase("abc"sv)` and `m.extract("abc"sv)` work. They are excluded if the argument converts to `iterator` or `const_iterator`, so `m.erase(it)` still means what it did. C++26 adds the remaining ones, `operator[]`, `at`, `try_emplace` and `insert_or_assign`.

Library support is uneven. g++-16 provides erase and extract in C++23 mode and the insertion overloads in C++26 mode. libc++ 21, bundled with Homebrew clang 21, provides the C++14 and C++20 lookup but neither of the later additions.

## Pitfalls with inconsistent comparators

Transparency is a claim, and the container takes your word for it. Three failure modes follow.

First, the comparator must accept both argument orders: lookup needs `comp(key, other)` and `comp(other, key)`. A comparator written for one order does not compile as soon as you use it for lookup.

Second, the ordering of foreign values must agree with the ordering of keys. If `comp(a, b)` says one thing about a `string_view` against a key and a different thing from the key-to-key comparison, the tree can lie about where an element would be and `find` misses elements that are present. The standard requires this partitioning, and a violation is undefined behavior, not a wrong answer.

Third, hashing: if `h("abc")` for a `const char*` is a pointer hash while `h(std::string("abc"))` hashes characters, equal keys land in different buckets and lookups fail. Make every overload of the hash agree on equal values.

## What to remember

- `extract` unlinks a node with no allocation; the handle is move-only, owns the element, and frees it if never reinserted.
- `nh.key()` is the only way to change a map key without copying; sets allow moving elements out through `value()`.
- Pointers and references to an extracted element are not usable while the handle holds it, and are usable again after reinsertion.
- `insert(node_type&&)` into a unique container returns `{position, inserted, node}`, and on a duplicate the node keeps the element.
- `merge` leaves duplicate-key elements in the source, copies nothing, and requires equal allocators.
- Inserting or merging a node across unequal allocators is undefined, as with two `pmr` containers on different resources.
- Ordered heterogeneous lookup needs a transparent comparator such as `std::less<>`; unordered needs a transparent hash and equality (C++20).
- C++23 adds heterogeneous `erase` and `extract`, and C++26 adds `operator[]`, `at`, `try_emplace` and `insert_or_assign`.
- Foreign-type comparisons and hashes must be consistent with the key ones, or lookup is undefined.
