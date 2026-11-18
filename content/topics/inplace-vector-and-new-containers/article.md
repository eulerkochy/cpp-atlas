---
title: "inplace_vector and the new C++26 containers"
summary: "C++26 adds inplace_vector, a vector whose capacity is fixed and whose elements live inside the object; hive, a block-based container with stable addresses; and indirect and polymorphic, which give heap-allocated objects value semantics. optional becomes a range and gains a reference specialization, and span gets at()."
track: "cpp26"
minutes: 14
standard:
  - "[inplace.vector]"
  - "[inplace.vector.overview]"
  - "[inplace.vector.modifiers]"
  - "[hive]"
  - "[hive.overview]"
  - "[hive.modifiers]"
  - "[indirect]"
  - "[polymorphic]"
  - "[optional.iterators]"
  - "[optional.optional.ref]"
  - "[span.elem]"
  - "[container.reqmts]"
cppreference:
  - title: "std::inplace_vector"
    path: "container/inplace_vector"
  - title: "std::inplace_vector::try_push_back"
    path: "container/inplace_vector/try_push_back"
  - title: "std::span::at"
    path: "container/span/at"
  - title: "std::optional"
    path: "utility/optional"
  - title: "std::optional::begin"
    path: "utility/optional/begin"
prerequisites:
  - "sequence-containers"
  - "iterator-invalidation"
  - "optional-variant-any"
  - "smart-pointers"
  - "span-and-mdspan"
---

## The one idea

Each new type in this topic answers one question: where does the object live, and what happens to it when you copy or move the thing that owns it?

An `inplace_vector<T, N>` keeps up to `N` elements inside itself, like an `array` with a size, so it never allocates. A `hive<T>` spreads its elements over separately allocated blocks and never moves one to make room, so pointers to elements stay valid. `indirect<T>` and `polymorphic<T>` put one object on the heap but copy it deeply, so a class can hold an incomplete or polymorphic member and still behave like a value.

This is C++26. The papers are P0843R14 for `inplace_vector` (2024), P0447R28 for `hive` and P3019R14 for `indirect` and `polymorphic` (both February 2025), P3168R2 for optional range support, P2988R12 for `optional<T&>`, and P2821R5 for `span::at`. National-body comments then changed `inplace_vector` in March 2026: P3981R2 made `try_push_back` return `optional<T&>`, and P4022R0 removed `try_append_range`. Everything here follows N5050, the final C++26 draft. Its international ballot closed in October 2026 and was reported as not approved, so check the status before you quote it as published ISO C++. GCC 16's libstdc++ implements everything here except `hive`, behind `-std=c++26`, and its `inplace_vector` is not yet fully constexpr. Clang 21's libc++ has none of these types.

> **Mental model.** `inplace_vector` is "storage inside, size varies". `hive` is "storage outside, addresses never move". `indirect` and `polymorphic` are "storage outside, but copies are deep". Pick by asking who owns the bytes and what a copy means.

## inplace_vector: capacity in the type

`inplace_vector<T, N>` is a contiguous sequence container. It supports almost everything `vector` does, except the front operations: there is no `push_front`, `pop_front`, `emplace_front` or `prepend_range`. Its storage is a member, so moving one is linear in the number of elements, like `array` and unlike `vector`. The same is true of `swap`.

`capacity()` and `max_size()` are `static constexpr` and return `N`. `reserve(n)` is static too. It does nothing, except that it throws `bad_alloc` when `n > N`. `shrink_to_fit()` does nothing at all.

The headline rule is how it reports overflow. Any member function that would make the size exceed `N` throws `std::bad_alloc`, even though no allocation was attempted. That includes constructors, `resize`, `insert` and `push_back`.

```cpp
#include <cstdio>
#include <inplace_vector>
#include <new>

int main() {
  std::inplace_vector<int, 3> v{1, 2, 3};
  try {
    v.push_back(4);                       // would make size 4 > 3
  } catch (const std::bad_alloc&) {
    std::puts("full");                    // printed; v is unchanged
  }
  try {
    std::inplace_vector<int, 3> w(10);    // the constructor also throws
  } catch (const std::bad_alloc&) {
    std::puts("too big");
  }
}
```

> **Standardese.** [inplace.vector.overview] says that any member function of `inplace_vector<T, N>` that would cause the size to exceed `N` throws an exception of type `bad_alloc`. `push_back` and `emplace_back` additionally promise that if an exception is thrown there are no effects on the container.

Because the elements never relocate, `push_back` and `emplace_back` leave existing pointers and references valid. Middle insertion and erasure still shift the later elements, as in `vector`.

## Three ways to append

Throwing is right when overflow is a bug. When overflow is an expected outcome, or when exceptions are not available, two other families exist:

- `try_push_back(x)` and `try_emplace_back(args...)` append if there is room and return `optional<T&>` referring to the new element. If the vector is full they do nothing and return `nullopt`. They throw only if constructing the element throws.
- `unchecked_push_back(x)` and `unchecked_emplace_back(args...)` have the precondition `size() < capacity()`. Breaking it is undefined behavior, so use them only after you have checked.

```cpp
#include <cstdio>
#include <inplace_vector>

int main() {
  std::inplace_vector<int, 2> v;
  for (int i = 0; i < 4; ++i) {
    if (auto r = v.try_push_back(i * 10))
      std::printf("stored %d\n", *r);     // prints 0 and 10
    else
      std::printf("dropped %d\n", i * 10); // prints 20 and 30
  }
  if (v.size() < v.capacity())
    v.unchecked_push_back(99);            // not reached: v is full
}
```

In a freestanding implementation, the throwing members are deleted, while the `try_` and `unchecked_` members remain available.

> **Pitfall.** Until March 2026 the draft had `try_push_back` return `T*`, with a null pointer for failure, and it also had `try_append_range`. Older articles, and the cppreference page for `try_push_back`, still show that design. The final C++26 text returns `optional<T&>`, and `try_append_range` is gone. GCC 16 already follows the final text, and it reports `__cpp_lib_inplace_vector` as `202603L`.

## Triviality and constexpr

`inplace_vector` passes triviality through from `T`. If `T` has a trivial copy constructor, so does `inplace_vector<T, N>`. The same goes for the move constructor. If `T` is trivially destructible, so is the vector, and then it also has trivial copy and move assignment when `T` does. So `inplace_vector<int, 8>` is trivially copyable and can be copied with `memcpy`. For `N == 0`, the specialization is empty and trivially copyable whatever `T` is.

```cpp
#include <inplace_vector>
#include <string>
#include <type_traits>

static_assert(std::is_trivially_copyable_v<std::inplace_vector<int, 8>>);
static_assert(std::is_empty_v<std::inplace_vector<std::string, 0>>);
static_assert(std::inplace_vector<std::string, 5>::capacity() == 5);
```

Every member is `constexpr`, and constant evaluation also handles the overflow exception, since C++26 allows exceptions there. P0843R14 limited constant evaluation to trivially copyable, trivially default-constructible element types. P3074R7 (trivial unions, February 2025) removed that limit, and `__cpp_lib_constexpr_inplace_vector` marks the change.

```cpp
#include <inplace_vector>
#include <new>

constexpr int overflow() {
  std::inplace_vector<int, 1> v{1};
  try { v.push_back(2); } catch (const std::bad_alloc&) { return 42; }
  return 0;
}
static_assert(overflow() == 42);
```

GCC 16 does not define `__cpp_lib_constexpr_inplace_vector`. Its `inplace_vector` works at compile time only when `T` is trivial, so a `constexpr` function that builds an `inplace_vector<std::string, 3>` fails to evaluate. The topic on constexpr in C++26 covers the language side of this.

## hive: stable addresses, unordered insertion

A `hive<T, Allocator>` stores elements in a chain of separately allocated **element blocks**. Erasing an element does not move any other element. The draft only says that erased slots are found and skipped by "unspecified techniques of constant time complexity". The reference implementation, plf::colony, keeps a **skipfield** in each block that records runs of erased slots, so iteration can jump over a run in one step. It also keeps a free list of erased slots, which later insertions reuse. Blocks that become empty are freed or kept as reserved blocks. Block sizes grow by an implementation-defined factor and can be bounded with `hive_limits`.

```text
block 0 (cap 4)      block 1 (cap 8)
[ a ][ - ][ c ][ d ] [ e ][ - ][ - ][ h ][ . ][ . ][ . ][ . ]
       ^ erased             ^ skip run of 2   ^ unused capacity
iteration: a c d e h  (no element ever moved)
```

The consequences are written into the interface:

- `insert` and `emplace` take no position. The container chooses where the element goes, and a hint argument is ignored. Both are constant time.
- Insertion invalidates only the past-the-end iterator. Erasure invalidates only iterators, pointers and references to the erased elements, and also `end()` if the last element goes.
- Iterators are bidirectional, but they also support `<` and `<=>`. There is no `operator[]`.
- `hive` has no `==` or `!=`, because two hives with the same elements may hold them in different orders.
- `sort`, `unique` and `splice` are members. `get_iterator(p)` turns an element pointer back into an iterator, in time linear in the number of blocks.
- `reserve` and `trim_capacity` never invalidate anything. `shrink_to_fit`, `reshape` and `sort` may move elements and invalidate everything.

`hive` suits workloads like game entities or particle systems: lots of insertion and erasure, frequent iteration, and other structures holding pointers into the container. If you only need fast erase and don't care about order, a `vector` with swap-and-pop is often simpler. `hive` earns its place when pointers into the container must survive.

GCC 16 does not ship `<hive>`, and neither does Clang 21's libc++, so nothing in this section could be compiled here. The statements above come from the N5050 text.

## indirect and polymorphic: heap objects with value semantics

`unique_ptr<T>` is a natural way to hold a large, incomplete or polymorphic member, but it makes the enclosing class move-only and makes `const` shallow. `indirect<T>` and `polymorphic<T>`, in `<memory>`, fix both problems. Copying one copies the owned object. A `const` wrapper gives only `const` access to the owned object. Neither has a null state in normal use. The default constructor allocates and value-initializes a `T`, and the converting constructors are `explicit`.

```cpp
#include <cstdio>
#include <memory>
#include <string>

struct Node;                                   // incomplete is fine here
struct Tree { std::indirect<Node> child; };

struct Doc {
  std::indirect<std::string> text{std::string("draft")};
  void touch() const {
    // text->append("!");                      // error: *text is const here
  }
};

int main() {
  Doc a;
  Doc b = a;                                   // deep copy: a new string
  b.text->append(" v2");
  std::printf("%s / %s\n", a.text->c_str(), b.text->c_str()); // draft / draft v2
}
struct Node { int v = 0; };
```

`indirect<T>` always owns exactly a `T`. It compares and hashes by value: `==` and `<=>` compare the owned objects, and comparison with a plain `T` works too. `polymorphic<T>` may own any type `U` derived from `T`, which must be copy-constructible. Copying it copies the object as its dynamic type, so there is no slicing. It has no comparison operators and no hash.

Both types have a **valueless** state, reachable only by moving from the object. `valueless_after_move()` reports it. Dereferencing a valueless object is undefined behavior. You may assign to it or destroy it.

> **Pitfall.** After `auto q = std::move(p);`, an `indirect` is guaranteed valueless. A `polymorphic` is not. Its move constructor may either take ownership of the owned object, which leaves `p` valueless, or construct a new object from it as an rvalue, which leaves `p` holding a moved-from object. That latitude allows a small-buffer implementation. GCC 16's plain move constructor always takes ownership, but portable code must not rely on either result.

## Smaller changes: optional and span

**optional is a range** (P3168R2). `optional<T>` has `begin()` and `end()` with contiguous iterators, and `ranges::enable_view` is specialized as true, so an optional is a view of zero or one elements. A range-for over an empty optional does nothing, and an optional composes with views. Formatting optionals as ranges is explicitly disabled. Initializing or destroying the contained value invalidates the iterators.

```cpp
#include <cstdio>
#include <optional>
#include <ranges>

int main() {
  std::optional<int> o = 4;
  for (int x : o | std::views::transform([](int x) { return x * 10; }))
    std::printf("%d\n", x);                    // prints 40
  o.reset();
  for (int x : o) std::printf("%d\n", x);      // prints nothing
}
```

**optional<T&>** (P2988R12) is now a partial specialization. It holds a pointer, it is trivially copyable, and it is a borrowed range. Assignment **rebinds**: `r = b` makes `r` refer to `b`, and it never assigns through to the old referent. Construction that would bind to a temporary is deleted, so `std::optional<const int&> r = 42;` is ill-formed. `value_or` returns a value, not a reference. `optional<T&&>` is not allowed.

```cpp
#include <cstdio>
#include <optional>

int main() {
  int a = 1, b = 2;
  std::optional<int&> r = a;
  r = b;                                       // rebinds; a is untouched
  *r = 3;
  std::printf("%d %d\n", a, b);                // 1 3
}
```

**span::at** (P2821R5) throws `out_of_range` for a bad index, like the containers' `at`. `operator[]`, `front` and `back` instead have hardened preconditions, which are checked only in a hardened implementation.

P2447R6 had added a `span` constructor from `initializer_list` for C++26. In March 2026, P4144R1 removed it again, because it changed the meaning of existing code such as `span<const bool>{ptr, n}`, which picked the new constructor instead of the pointer-and-size one. It is not in N5050. GCC 16 does not provide it, but Clang 21's libc++ still does.

## What to remember

- `inplace_vector<T, N>` stores its elements inside the object and never allocates. Overflow throws `bad_alloc`, `try_push_back` returns `optional<T&>`, and `unchecked_push_back` makes overflow undefined behavior.
- `capacity`, `max_size` and `reserve` are static. Move and swap are linear, as for `array`.
- Triviality passes through from `T`, and `inplace_vector<T, 0>` is empty and trivially copyable. The draft makes everything constexpr; GCC 16 manages that only for trivial `T`.
- `hive` gives constant-time insert and erase with stable addresses. The container chooses where elements go, iterators are bidirectional, and there is no `==`. GCC 16 does not ship it.
- `indirect` and `polymorphic` are deep-copying, const-propagating owners. They become valueless only after a move. A moved-from `polymorphic` may or may not be valueless.
- `optional<T>` is a view of zero or one elements. `optional<T&>` rebinds on assignment and refuses temporaries.
- `span::at` throws. The `span` constructor from `initializer_list` was added and then removed before C++26 was finished.
