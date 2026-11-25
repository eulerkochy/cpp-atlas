## Your task

Make `push_back`, `emplace_back` and `reserve` provide the strong exception guarantee when they reallocate: if an exception escapes, the vector is observably unchanged.

No new members are added. You are changing the relocation path so that it builds the new buffer completely before it modifies the old one, and chooses move or copy per the element type.

```cpp
// Sketch of the decision, not a full solution.
template <class T>
constexpr bool relocate_by_move = std::is_nothrow_move_constructible_v<T>
                               || !std::is_copy_constructible_v<T>;
```

If `T` is nothrow move constructible, relocate by moving. If it is not, but is copy constructible, relocate by copying so the old buffer is untouched. If it is movable but not copyable, move anyway; only the basic guarantee is possible. This is what `std::move_if_noexcept` computes.

## What the tests check

- If a copy constructor throws partway through reallocation, the vector is unchanged: same size, same elements, same capacity, no leaks, and every element is still alive exactly once.
- If constructing the new element throws, the vector is likewise unchanged.
- A type whose move constructor is not `noexcept` (and which is copyable) is copied during reallocation. A type with a `noexcept` move constructor is moved.
- Move-only types whose move constructor may throw are still moved; the tests only expect the basic guarantee there.
- A throwing constructor of the new element leaves the vector unchanged also for types with a `noexcept` move. So construct the new element in the new buffer before relocating the old ones; once you have moved them, you cannot roll back.
- The no-reallocation path: when there is spare capacity and the copy or constructor throws, `size()` must not have been incremented before construction succeeded.
- A may-throw move constructor is never invoked during relocation of a copyable type.
- Repeated failed reallocations do not leak. Every reallocation path, including `reserve()`, must destroy what it built in the new buffer and free the new buffer when relocation throws. The tester reports a forgotten deallocation as "allocation(s) never freed".

## Hints

- Two-phase structure. Phase one may throw: allocate the new buffer, construct the new element, relocate the old elements into the new buffer. Phase two must not throw: swap in the new pointers and capacity, destroy the old elements, free the old buffer.
- Wrap phase one so that failure rolls back: destroy whatever you have constructed so far in the new buffer, deallocate it, rethrow. A `try`/`catch(...)` with `throw;` is the simplest form; a small guard object whose destructor does the cleanup unless released is the RAII form.
- Track how many objects you have constructed in the new buffer. The new element, constructed at index `size()`, counts as constructed, and on a later throw it needs destroying too.
- For the move-or-copy choice, use `std::move_if_noexcept(x)`, which yields `T&&` when `T`'s move is `noexcept` or `T` cannot be copied, otherwise `const T&`.
- The standard library provides `std::uninitialized_copy` and `std::uninitialized_move`, both with rollback on exception. There is no `std::uninitialized_move_if_noexcept` in the standard (libstdc++ has an internal one), so write the small loop yourself or choose between the two algorithms with `if constexpr`.

## Gotchas

- Why move is not safe when it can throw. Suppose you move the first four of ten elements into the new buffer and the fifth move throws. The first four old elements are now moved-from. You cannot move them back, because moving back may throw too. There is no way to restore the old state, so the strong guarantee is unreachable. Copying leaves the old buffer intact: throw anywhere and you simply destroy the partial new buffer.
- The standard words this precisely: if `T` is neither copy insertable nor nothrow move insertable, the effects of reallocation are unspecified (basic guarantee at best).
- Forgetting `noexcept` on your own move constructor makes `std::vector<YourType>` silently copy on reallocation. Nothing fails; it is just slow. A `static_assert(std::is_nothrow_move_constructible_v<YourType>)` is cheap insurance.
- Forgetting the deallocation in `reserve`'s error path is the most common leak in this stage: `push_back` gets the rollback right and `reserve` gets a copy of it without the `deallocate`. Share one relocation function so both paths have the same cleanup.
- The rollback must not destroy elements it never constructed, and must not leak the new buffer when a throw happens before any element is constructed.
- Do not destroy the old elements until the new buffer is fully built. Destructors are the one thing you can rely on not throwing.
- The rollback paths are unreachable in normal tests. Run them under the sanitizers: `./cppatlas submit --sanitize` (or locally, `./cppatlas test --preset asan-ubsan`).

## Now read the real one

- libstdc++: in [`bits/vector.tcc`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/vector.tcc), the reallocation member (`_M_realloc_append`) constructs the new element and then relocates the old ones, with a `try`/`catch` that destroys the partially built range and deallocates. The move-or-copy choice appears as `std::__relocate_a` for types whose move is nothrow and `std::__uninitialized_move_if_noexcept_a` otherwise; see `bits/stl_uninitialized.h` and `bits/stl_construct.h` alongside it.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h) builds a `__split_buffer` ([`__split_buffer`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__split_buffer)), constructs into it, and then calls `__swap_out_circular_buffer` to commit. The split buffer's destructor is the rollback.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). `_Emplace_reallocate` constructs the new element first, then relocates with `_Umove_if_noexcept`, and uses a guard (`_Uninitialized_backout`-style) to undo partial construction.

Standard: [container.reqmts], [vector.modifiers] (the guarantee for `push_back` and `emplace_back`), [vector.capacity] (`reserve`). cppreference: [`std::move_if_noexcept`](https://en.cppreference.com/w/cpp/utility/move_if_noexcept), [`std::uninitialized_move`](https://en.cppreference.com/w/cpp/memory/uninitialized_move), [`std::uninitialized_copy`](https://en.cppreference.com/w/cpp/memory/uninitialized_copy), [`std::is_nothrow_move_constructible`](https://en.cppreference.com/w/cpp/types/is_move_constructible).
