---
title: "span and mdspan"
summary: "std::span is a non-owning pointer and length over contiguous elements, with the extent optionally fixed in the type. std::mdspan (C++23) extends the same borrowed view to several dimensions, with a layout policy for indexing and an accessor policy for element access."
track: "containers"
minutes: 12
standard:
  - "[views.span]"
  - "[span.cons]"
  - "[span.sub]"
  - "[span.objectrep]"
  - "[mdspan.mdspan]"
  - "[mdspan.extents]"
  - "[mdspan.layout]"
  - "[mdspan.accessor]"
cppreference:
  - title: "std::span"
    path: "container/span"
  - title: "std::span::subspan"
    path: "container/span/subspan"
  - title: "std::as_bytes"
    path: "container/span/as_bytes"
  - title: "std::mdspan"
    path: "container/mdspan"
  - title: "std::extents"
    path: "container/mdspan/extents"
  - title: "std::layout_stride"
    path: "container/mdspan/layout_stride"
  - title: "std::default_accessor"
    path: "container/mdspan/default_accessor"
prerequisites:
  - "sequence-containers"
  - "strings-and-string-view"
  - "reference-binding-and-temporaries"
---

## The one idea

A `std::span<T>` is a pointer and a count. It owns nothing, it never allocates, and it has no idea how long the memory behind it will live. What it adds over a bare pointer is that the count travels with it, and that it is a range, so it works with range-for and with the range algorithms. A `std::mdspan` is the same idea with a rank: a pointer plus a description of how a tuple of indices maps to an offset.

Both are views, which means the two questions to ask are always "what do I point at?" and "does that outlive me?"

> **Mental model.** A `span` is `string_view` for any contiguous element type, writable unless you say `const`. An `mdspan` is a `span` that has learned to count in two or more dimensions.

## Extent and size of the object

The second template argument, the **extent**, is either a number or `std::dynamic_extent`. A dynamic extent stores the length at run time, and a static extent bakes it into the type, so `span<int, 4>` needs no stored length. In the implementations tested here that makes `span<int>` the size of two pointers and `span<int, 4>` the size of one. The standard does not specify those sizes, but a static extent is allowed to be smaller, and every mainstream library takes advantage.

Static extent is a promise that the compiler can use. It also changes which conversions are implicit. The rule of thumb is that anything that loses nothing is implicit, and anything that asserts a length is explicit.

```cpp
#include <array>
#include <span>
#include <vector>

void conversions(std::vector<int>& v, int (&arr)[4], std::array<int, 4>& a4) {
  std::span<int> d1 = v;                // implicit: dynamic extent from any range
  std::span<int, 4> s1 = arr;           // implicit: array bound checked at compile time
  std::span<int, 4> s2 = a4;            // implicit: std::array size checked at compile time
  std::span<int> d2 = s1;               // implicit: dropping the static extent
  std::span<int, 4> s3(v);              // explicit: asserts v.size() == 4
  std::span<int, 2> s4(d2.first(2));    // explicit: static from dynamic
  // std::span<int, 4> bad = v;         // ill-formed: copy-initialization of a static extent
  // std::span<int, 2> bad2(s1);        // ill-formed: 4 and 2 never match
  (void)d1; (void)s2; (void)s3; (void)s4;
}
```

The explicit cases carry a precondition. `std::span<int, 4> s3(v)` is undefined behavior if `v.size() != 4`, because a range cannot be checked at compile time. Passing a `std::array<int, 3>` is a compile error instead, since its size is part of its type.

Class template argument deduction follows the source: `std::span s(arr)` for `int arr[4]` gives `span<int, 4>`, while `std::span s(vec)` gives `span<int>`.

## Constness is shallow

`const std::span<int>` is a constant view, not a view of constants. Like a `T* const`, it cannot be rebound to different elements, but the elements are still writable. To forbid writes you change the element type.

```cpp
#include <span>
#include <vector>

void shallow(std::vector<int>& v) {
  const std::span<int> cs = v;
  cs[0] = 42;                      // OK: the elements are int
  std::span<const int> ro = v;     // read-only view of the same data
  // ro[0] = 1;                    // ill-formed
  std::span<const int> from_mutable = cs;   // OK: adding const is implicit
}
```

The same logic governs construction from a range. A `span<int>` cannot be built from a `const vector<int>`, because that would drop `const`. A `span<const int>` can be built from either.

A span also makes a good function parameter. A function taking `std::span<const int>` accepts a `vector<int>`, an `std::array<int, N>` and a built-in array alike, with no template and no copy, and it states in the signature that the function reads but does not own the data. Passing a braced list needs C++26, which added an `initializer_list` constructor.

## Slicing, preconditions and the C++26 change

`first(n)`, `last(n)` and `subspan(offset, count)` return spans over the same memory, and each has a precondition. `first(n)` and `last(n)` need `n <= size()`. `subspan` needs `offset <= size()` and, if `count` is given, `count <= size() - offset`. Equality is allowed, so `s.subspan(s.size())` is a valid empty span, while `s.subspan(s.size() + 1)` is undefined behavior. The same goes for `operator[]`, `front` and `back` on an empty span.

The template forms `first<N>()`, `last<N>()` and `subspan<Offset, Count>()` always return a static extent, even from a dynamic span. On a static-extent source the compiler checks the numbers, so `span<int, 4>::first<5>()` does not compile, but with a dynamic source the precondition is still yours.

C++26 adds hardened preconditions to the standard library, including the span accessors and slicing operations, so that an implementation in hardened mode checks them instead of reading out of bounds. What it does on violation depends on the implementation and its configuration. In a plain build the behavior is still undefined, and the checked code path is not what you get by default. On the machines used for this article, libstdc++ 16 aborted with an assertion on `s.subspan(5)` for a 3-element span, while libc++ 21 in its default mode returned a span of nonsense size. C++26 also adds `span::at`, which throws `std::out_of_range`.

> **Pitfall.** Preconditions on slicing are undefined behavior, not exceptions. A span that has been sliced past its end looks fine until it is used, and in constant evaluation the compiler is allowed to reject the program, which is a useful test harness.

## Dangling and borrowed ranges

A span does not own its elements, so it dangles when the owner dies or reallocates. The constructors reflect this. A `span<const T>` can be built from an rvalue range, because a read-only parameter is the main use case, while a `span<T>` cannot, because writing into a temporary is almost always a mistake.

```cpp
#include <span>
#include <vector>

std::span<const int> bad() {
  return std::vector<int>{1, 2, 3};   // compiles; the vector dies at the return
}

void invalidated(std::vector<int>& v) {
  std::span<int> s = v;
  v.push_back(0);      // may reallocate: s now dangles
}
```

A `span` is a **borrowed range**: its iterators stay valid even after the span object is gone, because they point at the elements, not at the span. That is why the range algorithms can return iterators into a temporary span, while they refuse to do so for a temporary `std::vector`. The topic on borrowed ranges covers this in depth.

`std::as_bytes(s)` returns a `span<const std::byte>` over the same memory, and `std::as_writable_bytes(s)` a writable one, which requires a non-const element type. The result has `s.size_bytes()` elements. These are views of the object representation, so they carry the usual aliasing rules but need no cast.

## `std::mdspan`: extents, layouts and accessors

`std::mdspan<T, Extents, Layout, Accessor>` was added in C++23. The `Extents` parameter plays the role of the span's extent, once per dimension: `std::extents<std::size_t, 3, 4>` is a fully static 3 by 4 shape, and `std::dextents<std::size_t, 2>` is two dynamic dimensions. Mixed shapes such as `extents<size_t, 3, dynamic_extent>` are allowed, and only the dynamic ones occupy storage. The first template argument is the index type.

Construction deduces the shape from the arguments, and indexing takes a comma-separated list, thanks to the C++23 multidimensional `operator[]`.

```cpp
#include <mdspan>
#include <vector>

int main() {
  std::vector<int> v(12);
  for (int i = 0; i < 12; ++i) v[i] = i;

  std::mdspan m(v.data(), 3, 4);   // dextents<size_t, 2>, layout_right
  int a = m[1, 2];                 // 6: row-major, 1 * 4 + 2
  // m[1][2];                      // ill-formed: one index for a rank-2 mdspan
  return a == 6 ? 0 : 1;
}
```

The **layout policy** maps an index tuple to an offset. The default `layout_right` is row-major, as in C arrays. `layout_left` is column-major, as in Fortran. `layout_stride` stores a stride per dimension, which lets an `mdspan` view a column, or every second row, of existing data. C++26 adds padded layouts for rows with alignment padding.

```cpp
#include <array>
#include <mdspan>

void strided(const int* data) {
  using Ext = std::dextents<std::size_t, 1>;
  std::layout_stride::mapping<Ext> col(Ext{3}, std::array<std::size_t, 1>{4});
  std::mdspan column(data + 1, col);   // elements 1, 5, 9 of a 3 by 4 row-major matrix
  (void)column;
}
```

The **accessor policy** controls how an offset turns into an element. The default accessor returns `T&` for `data_handle[i]`. A custom accessor can wrap atomics, apply a scale, or work with a handle that is not a raw pointer, which is how GPU and memory-mapped data are exposed through the same interface. An `mdspan<T>` converts implicitly to an `mdspan<const T>`.

## Sub-views and library support

Slicing an `mdspan` into a row, column or block is `std::submdspan`, which is C++26, not C++23. Each index argument is an integer, which removes that dimension, a pair or `strided_slice` range, or `std::full_extent`. The result's layout is whatever keeps the mapping exact: a row of a row-major matrix stays `layout_right`, and a column becomes `layout_stride`.

```cpp
#include <mdspan>
#include <vector>
#include <version>

#ifdef __cpp_lib_submdspan   // C++26, and only in libraries that provide it
void rows(std::vector<int>& v) {
  std::mdspan m(v.data(), 3, 4);
  auto row1 = std::submdspan(m, 1, std::full_extent);          // rank 1, layout_right
  auto col2 = std::submdspan(m, std::full_extent, 2);          // rank 1, layout_stride
  (void)row1; (void)col2;
}
#endif
```

Library support, as tested for this site: `<span>` and `<mdspan>` work in `-std=c++23` with both g++-16 (libstdc++) and Homebrew clang 21 (libc++ 21). `std::submdspan` was available only in g++-16 with `-std=c++26`, where `__cpp_lib_submdspan` is defined; the libc++ bundled with clang 21 did not define it. `mdspan` operations on out-of-range indices have a precondition, like `span`, and are covered by the same C++26 hardening.

## What to remember

- A `span` is a pointer plus a length; it owns nothing and dangles like any view.
- A static extent lives in the type, so it need not be stored, but converting a runtime size into one is explicit and carries a precondition.
- `const span<T>` is shallow: elements stay writable. Use `span<const T>` for read-only.
- `span<const T>` accepts rvalue ranges, which is convenient for parameters and dangerous for locals.
- `first`, `last`, `subspan` and `operator[]` have preconditions; violations are undefined behavior until C++26 hardened implementations check them.
- `as_bytes` and `as_writable_bytes` give a byte view of any span.
- An `mdspan` has extents, a layout policy (`layout_right` by default) and an accessor policy, and is indexed by `m[i, j]` in C++23.
- `submdspan` is C++26; an `m[i][j]` chain is not how an `mdspan` is indexed.
