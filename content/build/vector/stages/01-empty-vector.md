## Your task

This stage is a free pass. Its purpose is to prove that the submit loop works before the interesting stages begin, so the starter already contains the stage 1 code, commented out.

1. Open `include/my/vector.hpp` and uncomment the five lines marked `STAGE 1: uncomment` (three `return` statements and two data members).
2. Run `./cppatlas submit`.
3. Watch the `[tester::#1]` log pass. You are advanced to stage 2.

`./cppatlas submit` sends your header to the cppatlas grader, so you need no local compiler. If you have a C++23 compiler and CMake installed, `./cppatlas test` runs the same tests locally and is faster.

The placeholder `return` lines next to the marked ones become dead code once you uncomment; you can delete them.

This is the class you are completing:

```cpp
namespace my {

template <class T>
class vector {
public:
    vector() noexcept = default;

    std::size_t size() const noexcept;
    std::size_t capacity() const noexcept;
    bool empty() const noexcept;

private:
    std::size_t size_ = 0;
    std::size_t capacity_ = 0;
};

} // namespace my
```

A default-constructed vector has size 0, is empty, and does not own any memory.

## What the handed-over lines do

- `size_` and `capacity_` are default member initializers, so the defaulted constructor produces a vector with nothing stored and nothing allocated. `size()` returns `size_`, `capacity()` returns `capacity_`, and `empty()` is `size_ == 0`, so there is no separate flag to keep in sync.
- There are three observers because they answer three different questions: how many elements exist, how many fit before a reallocation, and whether there are any. Later stages keep `size() <= capacity()` true as the vector grows.
- The observers are `const` because tests call them through a `const my::vector<int>&`; a missing `const` is a compile error, not a runtime failure. They are `noexcept` because they only read members and cannot fail.
- The default constructor is `noexcept` and allocates nothing. The standard requires `vector() noexcept(noexcept(Allocator()))`, and the property feeds into whether containers of vectors can be moved cheaply.
- The buffer pointer (`T* data_`) is left as a commented suggestion for stage 2. In this stage nothing would read it, and the compiler would warn about an unused private field.

## What the tests check

- A default-constructed `my::vector<int>` has `size() == 0` and `empty() == true`.
- `capacity() >= size()` holds.
- The three observers are callable on a `const` vector.
- The observers and the default constructor are `noexcept` where the test asserts it.
- The class template can be instantiated with different element types.

## Gotchas

- Uncomment only the lines marked `STAGE 1: uncomment`. The `STAGE 2` stubs are meant to stay as they are until the next stage.
- An empty `std::vector` allocates nothing in any of the three major implementations, and later stages assume a null buffer pointer means an empty vector. Keep that in mind when you add `data_` in stage 2.

## Now read the real one

Open the class definition in each implementation and find the three data members.

- libstdc++: [`bits/stl_vector.h`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/stl_vector.h). The storage is held in a base class that stores three pointers (start, finish, end of storage); `size()` is a pointer difference and `capacity()` is another.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h). It also stores begin, end and the end of the allocation, and computes `size()` and `capacity()` as differences.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). The three pointers live in a `_Vector_val` base (`_Myfirst`, `_Mylast`, `_Myend`).

Note that all three use three pointers rather than a pointer and two integers; that makes `end()` a plain load and `push_back` a pointer comparison. You can adopt that representation now or later.

Standard: [vector.overview], [vector.cons] and [vector.capacity]. cppreference: [`std::vector`](https://en.cppreference.com/w/cpp/container/vector), [`size`](https://en.cppreference.com/w/cpp/container/vector/size), [`capacity`](https://en.cppreference.com/w/cpp/container/vector/capacity).
