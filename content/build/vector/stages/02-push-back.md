## Your task

Give the vector real storage. Add `push_back`, element access and a destructor.

```cpp
void push_back(const T& value);

T&       operator[](size_type i);
const T& operator[](size_type i) const;

~vector();
```

Elements live in raw, uninitialized storage that you allocate yourself. A `T` is constructed in that storage when it is pushed and destroyed when the vector dies; no `T` object ever exists for a slot that does not hold an element. For now, reallocate however you like when the buffer is full, for example by allocating room for one more element each time. Stage 3 replaces that with geometric growth.

Copying and moving a vector is not required yet. The compiler-generated copy constructor would copy the buffer pointer and cause a double free, so delete the copy operations until stage 4:

```cpp
vector(const vector&) = delete;
vector& operator=(const vector&) = delete;
```

## What the tests check

- Elements pushed are readable back through `operator[]` in insertion order, and `size()` tracks them.
- The element type may be non-default-constructible; `T` is never default-constructed.
- Every element is destroyed exactly once, and the live-instance count of the test type returns to zero when the vector is destroyed.
- `operator[]` returns a real reference: assigning through it changes the stored element.
- `capacity() >= size()` after every push.
- Over-aligned element types work: storage must honor `alignof(T)`. `std::allocator<T>` does; plain `::operator new(n * sizeof(T))` does not for an over-aligned `T`, so use the `std::align_val_t` overload.
- `operator[]` returns `T&` / `const T&`, not a value.
- Nothing leaks: every buffer you allocate with `operator new` or `std::allocator` must be released by the time the vector is destroyed. The tester replaces global `operator new` and `operator delete` and, for each test that otherwise passed, reports allocations that were never freed ("N allocation(s) ... never freed"), on all platforms. Element leaks are detected by the live-object count. LeakSanitizer under the `asan-ubsan` preset (Linux) is an additional net, and it also covers memory from plain `std::malloc`, which the tester's tracking does not see.

## Hints

- Allocate with `std::allocator<T>{}.allocate(n)` or `::operator new(n * sizeof(T))`. Both give uninitialized memory; neither constructs anything.
- Construct with `std::construct_at(p, value)` from `<memory>`, which is the C++20 spelling of placement new and is usable in constant evaluation. `::new (static_cast<void*>(p)) T(value)` is equivalent.
- Destroy with `std::destroy_at(p)` or `std::destroy(first, last)`.
- When you grow, allocate the new buffer first, construct the elements there, then destroy the old ones and free the old buffer. Think about the order: nothing here should leave a half-valid vector, even if you do not yet handle exceptions.
- Release storage with the matching deallocation function. If you used `std::allocator<T>::allocate`, call `deallocate(p, n)` with the same `n`.

## Gotchas

- `new T[n]` default-constructs `n` objects, so it fails to compile for a type without a default constructor and does the wrong thing for one with. It conflates storage with objects, which is the thing this stage exists to separate.
- `delete[] p` on a buffer obtained from `operator new` or `allocate` is undefined behavior. Deallocate the way you allocated. Destroying the elements and freeing the memory are two separate operations.
- Over-aligned types: `::operator new(n * sizeof(T))` only guarantees alignment up to `__STDCPP_DEFAULT_NEW_ALIGNMENT__`. `std::allocator<T>::allocate` selects the aligned overload automatically since C++17, which is one reason to prefer it.
- Do not read from `operator[]` past `size()`, even within capacity: that memory holds no object. The standard does not require a bounds check in `operator[]`.
- Relocating elements with `memcpy` or `memmove` is undefined behavior for types that are not trivially copyable. It happens to work for some types on some standard libraries and breaks for others: a short `std::string` on libstdc++ keeps its characters in an internal buffer and points at it from inside the object, so a bytewise copy leaves the new string pointing into the old, freed object. The tests include short-string and long-string elements. Even if you only grow one slot at a time in this stage, relocate by move-constructing each element and destroying the old one.
- Delete the copy operations now. The compiler-generated ones are not just wrong, they compile.

## Now read the real one

All three libraries funnel allocation through the allocator and keep construction separate from storage.

- libstdc++: [`bits/stl_vector.h`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/stl_vector.h) has the base class `_Vector_base` that owns allocation and deallocation (`_M_allocate`, `_M_deallocate`) so the derived `vector` only deals with constructed elements. Its `push_back` calls construct directly when there is room and otherwise goes to the reallocation path in [`bits/vector.tcc`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/vector.tcc).
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h). Look at the destructor and at how destroying elements (`clear`) and freeing storage are separate steps.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). `_Tidy` destroys elements and frees the buffer.

Standard: [vector.modifiers], [container.reqmts], [allocator.members], [specialized.algorithms]. cppreference: [`push_back`](https://en.cppreference.com/w/cpp/container/vector/push_back), [`std::construct_at`](https://en.cppreference.com/w/cpp/memory/construct_at), [`std::destroy_at`](https://en.cppreference.com/w/cpp/memory/destroy_at), [`std::allocator`](https://en.cppreference.com/w/cpp/memory/allocator).
