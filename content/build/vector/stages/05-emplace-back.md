## Your task

Add in-place construction and two ways to remove elements.

```cpp
template <class... Args>
reference emplace_back(Args&&... args);

void pop_back();
void clear() noexcept;
```

`emplace_back` constructs a `T` directly in the next free slot from the forwarded arguments and returns a reference to it. `pop_back` destroys the last element. `clear` destroys all elements and sets the size to zero. Neither `pop_back` nor `clear` changes the capacity.

`reference` is `T&`; declare it as `using reference = T&;` if you have not already.

Re-implement both `push_back` overloads on top of `emplace_back`. That leaves one growth path to get right instead of three.

## What the tests check

- When no reallocation is needed, `emplace_back` performs exactly one constructor call and no copies or moves.
- Value categories are forwarded: lvalue arguments are copied into the constructor's parameters, rvalue arguments are moved.
- It works with constructors taking several arguments and with `explicit` constructors.
- The return value refers to the newly constructed element, which is the last one.
- `pop_back` destroys exactly the last element and leaves `capacity()` unchanged.
- `clear` destroys every element, leaves `size() == 0` and `capacity()` unchanged.
- `emplace_back()` with no arguments performs one default construction.
- Move-only arguments such as `std::unique_ptr` are forwarded correctly.
- Parentheses, not braces: `std::vector<std::vector<int>>::emplace_back(3, 7)` yields a vector of three 7s.
- `emplace_back(v[0])` works when the vector is full.
- The returned reference is valid after a reallocating `emplace_back`.
- `clear()` is `noexcept`.
- `pop_back` leaves the other elements' addresses unchanged.

## Hints

- Use `std::construct_at(ptr, std::forward<Args>(args)...)`. It forwards the pack into a parenthesized initialization.
- Because the slow path must also construct from `args...`, the reallocation helper from stage 3 has to be a template over `Args` too. Split it as "allocate new buffer", "construct the new element in it", "relocate old elements", "swap buffers and free the old one".
- `pop_back` is `--size_; std::destroy_at(data_ + size_);` in whichever order your representation requires. `clear` is `std::destroy(begin, end)` plus resetting the size.
- After construction and incrementing the size, return `*(data_ + size_ - 1)`. (No stage asks you to implement `back()`.)

## Gotchas

- Parentheses versus braces. `std::vector::emplace_back` constructs with `T(std::forward<Args>(args)...)`, via `construct_at`. If you write `T{std::forward<Args>(args)...}` you change behavior: braces prefer `std::initializer_list` constructors and forbid narrowing. `emplace_back(3, 'x')` on a `std::vector<std::string>` must call `string(3, 'x')`, not build a list.
- The `explicit` test is why you must not go through an implicit conversion such as `push_back(T(args...))`: that costs an extra move and requires the argument to be convertible.
- Aliasing again: `v.emplace_back(v[0])` when the vector is full. `args` refers into the old buffer, so construct the new element in the new storage before relocating or destroying the old one. This is the same rule as in stage 3, now with a forwarding reference.
- `pop_back` on an empty vector is undefined behavior; you do not have to check.
- `clear` is `noexcept` because destructors are. Do not implement it by `pop_back` in a loop unless you accept the extra bookkeeping.

## Now read the real one

- libstdc++: `emplace_back` in [`bits/vector.tcc`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/vector.tcc) constructs in place when `finish != end_of_storage` and otherwise calls the reallocation member (`_M_realloc_append` in current sources; `_M_realloc_insert` in older ones), forwarding the arguments. `push_back` in [`bits/stl_vector.h`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/stl_vector.h) has a fast path that constructs directly.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h) implements `emplace_back` with an inline fast path and an out-of-line slow path (`__emplace_back_slow_path`) that uses a `__split_buffer`.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). `emplace_back` calls `_Emplace_one_at_back`, which either constructs in place or calls `_Emplace_reallocate`.

Standard: [vector.modifiers], [container.reqmts] (EmplaceConstructible). cppreference: [`emplace_back`](https://en.cppreference.com/w/cpp/container/vector/emplace_back), [`pop_back`](https://en.cppreference.com/w/cpp/container/vector/pop_back), [`clear`](https://en.cppreference.com/w/cpp/container/vector/clear), [`std::forward`](https://en.cppreference.com/w/cpp/utility/forward).
