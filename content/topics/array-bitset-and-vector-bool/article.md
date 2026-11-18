---
title: "array, bitset and vector<bool>"
summary: "std::array is a plain aggregate wrapping a C array, std::bitset is a fixed-size bit set with a proxy for single bits, and vector<bool> is a packed specialization whose proxy references make it behave unlike every other vector."
track: "containers"
minutes: 12
standard:
  - "[array.overview]"
  - "[array.zero]"
  - "[array.creation]"
  - "[dcl.init.aggr]"
  - "[bitset]"
  - "[bitset.members]"
  - "[vector.bool]"
  - "[container.requirements.dataraces]"
cppreference:
  - title: "std::array"
    path: "container/array"
  - title: "std::to_array"
    path: "container/array/to_array"
  - title: "std::bitset"
    path: "utility/bitset"
  - title: "std::bitset::operator[]"
    path: "utility/bitset/operator_at"
  - title: "std::vector<bool>"
    path: "container/vector_bool"
  - title: "std::vector<bool>::reference"
    path: "container/vector_bool/reference"
prerequisites:
  - "sequence-containers"
  - "aggregates-and-designated-initializers"
  - "iterator-invalidation"
---

## The one idea

These three types answer one question, "what if the size is known, or the elements are single bits?", and each gives a different cost. `std::array<T, N>` costs nothing over a C array and behaves like a value. `std::bitset<N>` stores N bits in whatever words the library likes. `std::vector<bool>` stores a dynamic number of bits and pays for the packing by not being a real container of `bool`.

> **Mental model.** `std::array` is a struct that holds `T[N]`. `std::bitset` is an integer with more than 64 bits. `std::vector<bool>` is a bitset that can grow, and its elements are not objects you can point at.

## `std::array` is an aggregate

An aggregate has no user-declared constructors, so `std::array` is initialized by aggregate initialization, with the same rules as a struct whose only member is a built-in array. Elements without an initializer are value-initialized, and the array is zero-filled where a built-in array would be. With no initializer at all, as in a local `std::array<int, 4> a;`, the ints are indeterminate.

```cpp
#include <array>

struct P { int x, y; };

void init() {
  std::array<int, 4> a{1, 2};            // a is {1, 2, 0, 0}
  std::array<int, 4> b;                  // indeterminate contents
  std::array<int, 4> c{};                // all zero
  std::array<std::array<int, 2>, 2> g{1, 2, 3, 4};  // brace elision, since C++14
  std::array<P, 2> ps{{{1, 2}, {3, 4}}};            // explicit braces also work
  // std::array<int, 3> bad{1, 2, 3, 4};            // ill-formed: too many initializers
  (void)a; (void)b; (void)c; (void)g; (void)ps;
}
```

Brace elision lets you omit the inner braces for the member array, which is why `std::array<int, 3> a{1, 2, 3}` works. Compilers may warn about missing braces for nested aggregates, but the code is valid. CTAD deduces both parameters, so `std::array a{1, 2, 3}` is `std::array<int, 3>`.

Because it is a wrapper and not a pointer, copying, assigning and comparing work on the elements, and `swap` is linear in `N`, not a pointer exchange. It is also a structural type with public data, so it works as a non-type template parameter, and it supports structured bindings through the tuple-like protocol.

### Element access, comparison and constant evaluation

`operator[]` on an `std::array` is unchecked, like a built-in array, while `at` throws `std::out_of_range`. `std::get<I>(a)` checks the index at compile time and is the form that works in templates. An `std::array` can be returned by value, compared with `==` and the ordering operators, and used freely in `constexpr` code, which is the main reason to prefer it over a built-in array. It never decays to a pointer, so to hand it to a C API you call `data()` and `size()` explicitly. The size is part of the type, so an `std::array<int, 3>` and an `std::array<int, 4>` are unrelated types, and a function that must accept any length is a template, or takes a `std::span`.

### Zero size and `to_array`

`N` may be zero. Then `begin() == end()`, `size()` is 0, and `front()` and `back()` are undefined behavior. `data()` may or may not be null, and the object itself still has a nonzero size in practice. That makes a zero-size array safe as a template edge case, and unsafe to treat as "memory you can point at".

C++20 added `std::to_array`, which turns a built-in array or braced list into an `std::array`, deducing the size. It exists because CTAD cannot convert elements to a chosen type, and cannot turn a string literal into an array of `char` that includes the terminator.

```cpp
#include <array>

void creation() {
  auto a = std::to_array({1, 2, 3});         // std::array<int, 3>
  auto b = std::to_array("ab");              // std::array<char, 3>, includes the null
  auto c = std::to_array<long>({1, 2});      // std::array<long, 2>, converts each element
  (void)a; (void)b; (void)c;
}
```

## `std::bitset`

`std::bitset<N>` has a size fixed at compile time and no iterators. Bit 0 is the least significant, and conversions follow that convention in both directions: the string `"0110"` has bits 1 and 2 set, and `to_string` prints the highest bit first.

```cpp
#include <bitset>
#include <iostream>

void bits() {
  std::bitset<4> b("0110");
  std::cout << b[1] << b[0] << ' ' << b.to_ulong() << ' ' << b.to_string() << '\n';
  // prints: 10 6 0110
  std::bitset<8> t(0x1FF);   // integer constructor truncates: 11111111
  (void)t;
}
```

A bitset supports the bitwise operators `&`, `|`, `^`, `~`, and the shifts, which shift in zeros and give an all-zero result when the count is at least `N`. `count()` reports the number of set bits, and `any()`, `all()` and `none()` answer the usual questions. It has `std::hash` and stream operators, so it works as a compact set of flags. The integer constructor keeps the low bits and drops the rest. The string constructor throws `std::invalid_argument` on any character other than `0` and `1`. `to_ulong` and `to_ullong` throw `std::overflow_error` when the value does not fit, so a wide bitset with only low bits set converts fine. They check the value, not the width.

Bounds checking is split. `test(pos)` and `set(pos)` throw `std::out_of_range` if `pos >= N`, while `operator[]` does not check, and an out-of-range subscript is undefined behavior. The non-const `operator[]` returns a small proxy, `bitset<N>::reference`, because a bit has no address. The standard says the const version returns `bool`. The libc++ 21 tested here returns a proxy type for the const one as well, so avoid depending on `auto x = cb[i]` giving a `bool`.

## `vector<bool>` is not a container of `bool`

For `std::vector<bool>` the standard provides a specialization intended to use one bit per element. Packing is the motivation, not a guarantee, but every mainstream implementation does it. A bit has no address, so `operator[]` on a non-const vector cannot return `bool&`. It returns a proxy object of class type `std::vector<bool>::reference`, which converts to `bool`, can be assigned a `bool`, and has a `flip()` member.

That makes several habitual forms break:

```cpp
#include <vector>

void proxies(std::vector<bool>& v) {
  auto x = v[0];            // x is a proxy, not a bool: it aliases element 0
  // bool& r = v[0];        // ill-formed: cannot bind a bool& to a prvalue proxy
  // bool* p = &v[0];       // ill-formed: address of a temporary proxy
  // for (auto& b : v) {}   // ill-formed: auto& cannot bind a prvalue
  for (auto&& b : v) b = true;   // OK: the forwarding reference holds the proxy
  for (bool b : v) { (void)b; }  // OK: copies the value
  bool y = v[0];            // a real copy of the value
  (void)x; (void)y;
}
```

> **Pitfall.** `auto x = v[0];` captures the proxy, not the value. If the vector later changes the element, or is reallocated or destroyed, `x` reads the new bit or dangles. Write `bool x = v[0];` when you want a snapshot.

The proxy assigns like a value and does not rebind. Given `auto a = v[0]; auto b = v[1]; a = b;`, the assignment copies the bit of element 1 into element 0. There is no `data()`, because there is no array of `bool` to point at. `v.flip()` flips every bit, and `v[i].flip()` flips one. The iterator is a random access iterator for the C++20 concepts, but its `reference` is not a real reference, so it does not meet the older Cpp17 forward iterator requirements.

### Thread safety

For every standard container except `vector<bool>`, two threads may modify different elements concurrently without a data race. `vector<bool>` is the stated exception. Setting one bit reads and writes a word that also holds neighbouring bits, so two threads writing adjacent elements race even though they touch different "elements".

> **Standardese.** [container.requirements.dataraces] requires implementations to avoid data races when different elements of the same container, excepting `vector<bool>`, are modified concurrently. [vector.bool] declares the `reference` class, with its conversion to `bool`, its assignment from `bool` and its `flip` member, as the type that `operator[]` returns.

### Alternatives

If you need real references, per-element threading, or a pointer to the elements, use `std::vector<char>`, `std::vector<std::uint8_t>` or, for a dynamic bit set, `std::deque<bool>`. For a fixed width, `std::bitset<N>` is the simpler choice, and it can be larger than any integer. For dynamic bits without the proxy trap, use a third-party `dynamic_bitset`, or keep `vector<bool>` and treat it as what it is: a bit set with a vector interface. The three types line up by what is fixed. If the length is known at compile time and you want real references, `std::array<bool, N>` spends a byte per element and behaves like any array. If the length is known and you want density, use `std::bitset<N>`, whose bit proxy is a documented part of its interface and which makes no claim to be a container. If the length changes at run time, you choose between the proxy of `vector<bool>` and the wasted bytes of `vector<char>`, and it pays to decide once, behind a type alias, instead of letting `vector<bool>` leak into generic code. Never write generic code that assumes `std::vector<T>::reference` is `T&`; it is the single exception to that rule.

## What to remember

- `std::array` is an aggregate with no constructors; missing initializers are zero, and a default-initialized local is not.
- Brace elision lets `std::array<int, 3> a{1, 2, 3}` skip the inner braces; too many initializers is ill-formed.
- A zero-size array has `begin() == end()`, undefined `front()` and `back()`, and an unspecified `data()`.
- `std::to_array` (C++20) deduces the size and can convert elements; CTAD does not.
- A `bitset` string reads the rightmost character as bit 0; `to_ulong` throws `overflow_error` if the value does not fit.
- `bitset::operator[]` is unchecked and returns a proxy; `test` and `set` throw `out_of_range`.
- `vector<bool>::operator[]` returns a proxy class, so `auto x = v[0]` aliases, `&v[0]` and `auto&` loops do not compile, and there is no `data()`.
- Adjacent elements of a `vector<bool>` race when written from different threads; other vectors do not.
- Use `vector<char>` or `vector<uint8_t>` for real references and thread-safe elements, and `bitset<N>` for a fixed width.
