## Your task

Create the class template `my::vector<T>` in `include/my/vector.hpp` with a default constructor and three observers.

```cpp
namespace my {

template <class T>
class vector {
public:
    using value_type = T;          // recommended
    using size_type  = std::size_t; // recommended

    vector() noexcept;

    size_type size() const noexcept;
    size_type capacity() const noexcept;
    bool empty() const noexcept;
};

} // namespace my
```

A default-constructed vector has size 0, is empty, and does not need to own any memory. This stage is deliberately trivial: its purpose is to prove that your toolchain, the build and the `./cppatlas test` loop work before the interesting stages begin.

## What the tests check

- A default-constructed `my::vector<int>` has `size() == 0` and `empty() == true`.
- `capacity() >= size()` holds.
- The three observers are callable on a `const` vector.
- The observers and the default constructor are `noexcept` where the test asserts it.
- The class template can be instantiated with different element types.

## Hints

- Three members are enough for now: a pointer to the buffer, a size and a capacity. Initializing them with default member initializers makes the default constructor trivial to write.
- `empty()` is simply `size() == 0`; do not store a separate flag.
- Prefer `std::size_t` through `<cstddef>` and write the includes you use. The header should compile when included first in a translation unit.

## Gotchas

- Mark the observers `const`. A test calls them through a `const my::vector<int>&` and a missing `const` is a compile error, not a runtime failure.
- `noexcept` on the default constructor matters later: the standard requires `vector() noexcept(noexcept(Allocator()))`, and the same property feeds into whether containers of vectors can be moved cheaply. Starting with it costs nothing.
- Do not allocate in the default constructor. An empty `std::vector` allocates nothing in any of the three major implementations, and later stages assume a null buffer pointer means an empty vector.

## Now read the real one

Open the class definition in each implementation and find the three data members.

- libstdc++: [`bits/stl_vector.h`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/stl_vector.h). The storage is held in a base class that stores three pointers (start, finish, end of storage); `size()` is a pointer difference and `capacity()` is another.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h). It also stores begin, end and the end of the allocation, and computes `size()` and `capacity()` as differences.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). The three pointers live in a `_Vector_val` base (`_Myfirst`, `_Mylast`, `_Myend`).

Note that all three use three pointers rather than a pointer and two integers; that makes `end()` a plain load and `push_back` a pointer comparison. You can adopt that representation now or later.

Standard: [vector.overview], [vector.cons] and [vector.capacity]. cppreference: [`std::vector`](https://en.cppreference.com/w/cpp/container/vector), [`size`](https://en.cppreference.com/w/cpp/container/vector/size), [`capacity`](https://en.cppreference.com/w/cpp/container/vector/capacity).
