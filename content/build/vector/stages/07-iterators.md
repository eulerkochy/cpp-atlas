## Your task

Expose iterators and the standard member types so that range-for, the standard algorithms and the standard range concepts work with `my::vector<T>`.

```cpp
using value_type      = T;
using size_type       = std::size_t;
using difference_type = std::ptrdiff_t;
using reference       = T&;
using const_reference = const T&;
using pointer         = T*;
using const_pointer   = const T*;
using iterator        = T*;
using const_iterator  = const T*;

iterator       begin() noexcept;
const_iterator begin() const noexcept;
iterator       end() noexcept;
const_iterator end() const noexcept;
const_iterator cbegin() const noexcept;
const_iterator cend() const noexcept;

T*       data() noexcept;
const T* data() const noexcept;
```

A raw pointer is a perfectly valid iterator here, and in fact is a contiguous iterator. You do not need a class.

## What the tests check

- Range-based `for` visits elements in order, on both const and non-const vectors.
- `std::sort`, `std::find`, `std::accumulate` and `std::ranges` algorithms work on a `my::vector`.
- `std::contiguous_iterator<my::vector<T>::iterator>` holds, as do `std::ranges::contiguous_range<my::vector<T>>` and `std::ranges::sized_range<my::vector<T>>`.
- A `const` vector gives const access: assigning through a `const_iterator` or through `begin()` of a const vector does not compile (checked at compile time).
- `begin() == end()` for an empty vector.
- When non-empty, `data() == &v[0]`.

Reverse iterators (`rbegin`, `rend`) are not tested. If you want them, `std::reverse_iterator<iterator>` is all you need.
- The exact member types: `value_type`, `reference`, `const_reference`, `pointer`, `const_pointer`, an unsigned `size_type` and a signed `difference_type`, and the return types of `begin`, `end`, `cbegin`, `cend` and `data`.
- `std::ranges::common_range<my::vector<T>>` holds.
- `iterator` converts to `const_iterator` but not the reverse.
- `cbegin()` works on a non-const vector.
- The const overload of `data()` returns `const T*`.
- Iterators stay valid across `push_back` while capacity suffices.

## Hints

- Most of this stage is typedefs and one-line functions. `end()` is `data_ + size_`.
- `std::ranges::sized_range` requires `std::ranges::size` to work, which is satisfied by a `size()` member returning an integer-like type. You already have it.
- The `data()` and `begin()` pairs differ only in constness. Write the const overload first and think about whether the non-const one can reuse it safely.
- C++23 option: explicit object parameters ("deducing this", P0847) can collapse a const/non-const pair into one member template. Be careful with constness: a `T*` member stays `T*` inside a const object, so the result must be forwarded with `std::forward_like`. This form returns `T&` for a non-const vector, `const T&` for a const one, and `T&&` for an rvalue vector.

  ```cpp
  template <class Self>
  auto&& operator[](this Self&& self, size_type i) {
      return std::forward_like<Self>(self.data_[i]);
  }
  ```

  The classic two-overload form is equally fine, and the standard libraries still use it. The same trick works for `begin`, `end` and `data`, but it is optional.
- The real `std::vector` has C++23 range-aware members (a `std::from_range` constructor, `append_range`, `insert_range`) and works with `std::ranges::to<std::vector>()`. They are not part of this challenge.
- `data()` on an empty vector may return null or a valid pointer; the standard does not say which, only that `[data(), data() + size())` is a valid range.

## Gotchas

- If `iterator` is `T*`, then `iterator` and `T*` are the same type, so code can accidentally pass a vector iterator where a raw pointer is expected and an overload on `T*` also accepts it. Portable code must not depend on `std::vector<T>::iterator` being a pointer or not; a wrapper class keeps the types distinct if you want that protection.
- Forgetting the const overloads gives you a non-const-only `begin()`. The range-for test over `const my::vector<int>&` then fails to compile.
- `const_iterator` must not be `T* const`. That is a const pointer, not a pointer to const; you can still write through it. Use `const T*`.
- Why pointers suffice, and what real implementations add. A pointer satisfies every contiguous iterator requirement without extra code, which is why C++20's `contiguous_iterator` concept exists. Real libraries often wrap it anyway: libstdc++ uses `__normal_iterator<pointer, vector>` so that `iterator` and `const_iterator` are distinct types and overloads cannot confuse them with `T*`. Debug modes go further. `_GLIBCXX_DEBUG` builds a safe-iterator that tracks its container and aborts on use of an invalidated iterator; MSVC has `_ITERATOR_DEBUG_LEVEL`; libc++ uses `__wrap_iter` and, in its hardening modes, adds bounds assertions to `operator[]` and the other element accessors. A pointer-only iterator gives up that diagnosability.

## Now read the real one

- libstdc++: [`bits/stl_vector.h`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/stl_vector.h) defines `iterator` as `__gnu_cxx::__normal_iterator<pointer, vector>`; the wrapper is in `bits/stl_iterator.h`.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h) wraps the element pointer in `__wrap_iter` for its iterators (the exact selection has varied between versions, so check the version you read).
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector) uses `_Vector_iterator` and `_Vector_const_iterator`, which carry debug checks when `_ITERATOR_DEBUG_LEVEL` is nonzero.

Standard: [vector.overview], [container.reqmts], [iterator.concept.contiguous], [range.refinements]. cppreference: [`begin`](https://en.cppreference.com/w/cpp/container/vector/begin), [`data`](https://en.cppreference.com/w/cpp/container/vector/data), [`std::contiguous_iterator`](https://en.cppreference.com/w/cpp/iterator/contiguous_iterator), [`std::ranges::contiguous_range`](https://en.cppreference.com/w/cpp/ranges/contiguous_range).
