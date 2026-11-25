## Your task

Make `push_back` amortized constant time and add `reserve`.

```cpp
void reserve(size_type n);
```

When `push_back` finds the buffer full, it allocates a larger buffer whose capacity grows geometrically, relocates the existing elements and releases the old buffer. `reserve(n)` raises `capacity()` to at least `n`; it never shrinks and has no effect if `capacity() >= n`. Elements are preserved across reallocation.

No particular growth factor is required. libstdc++ and libc++ double; MSVC grows by 1.5. A geometric factor gives amortized O(1) `push_back`: `N` pushes cost O(log N) reallocations and O(N) total element relocations. The tests bound the total number of reallocations and element relocations for `N` `push_back` calls, so any factor of about 1.5 or more passes; `+1` or `+constant` growth, or a factor very close to 1, fails.

## What the tests check

- After `N` `push_back` calls, the number of reallocations is O(log N), and the total number of element relocations is O(N) (bounded by a constant multiple of `N`).
- `reserve(n)` makes `capacity() >= n`, does not decrease capacity, and preserves size and element values.
- `reserve(n)` with `n <= capacity()` does nothing: no element operations at all.
- After `reserve(n)`, pushes that keep `size() <= n` do not reallocate: element addresses stay stable.
- Each reallocation relocates each element exactly once and destroys the old one exactly once: no leaks, no double destruction.
- `v.push_back(v[0])` and `v.push_back(v[size - 1])` work when the vector is full, so the argument may alias an element of the vector.

Throwing `std::length_error` when `n > max_size()` is part of the standard but optional here and not tested.

## Hints

- Compute the new capacity as `max(1, 2 * capacity())` or similar, and write the reallocation as one function you will reuse in stages 5 to 8.
- The order for a growing `push_back` is: allocate the new buffer; construct the new element in it first (so `v.push_back(v[0])` still reads a live object); move-construct the old elements across (`std::uninitialized_move`, or a `std::construct_at(dst, std::move(*src))` loop); destroy the old elements; free the old buffer. Keep relocation a separate step from allocation. `reserve` has no new element, so it skips the second step. Stage 6 refines the move to `std::move_if_noexcept`, and a vector of a move-only type (stage 4) can only grow if relocation moves.
- For `reserve`, use the same relocation function with a requested capacity instead of a growth rule.
- For the aliasing case, construct the new element in the new buffer first, before touching the old one, and only then relocate the old elements (this is the order above). Taking a copy of the argument up front also works but costs an extra element.

## Gotchas

- Aliasing: if you destroy or move out of the old buffer first, `value` in `push_back(const T& value)` may dangle, because it can refer into that buffer. This is why `std::vector::push_back(v[0])` is well defined and a careless implementation is not.
- Growth by a constant additive step makes `push_back` O(N) amortized and the tests will catch it. Grow multiplicatively.
- Why 1.5 versus 2? With factor 2 the new block is always larger than the sum of all previously freed blocks, so a first-fit allocator can never reuse them. A factor below the golden ratio (about 1.618) lets freed blocks eventually coalesce into one big enough. Implementations that choose 2 trade that for fewer reallocations. Real allocators are not first-fit, so treat this as a heuristic.
- `reserve` must not change `size()`, and it must not shrink; the shrinking operation is `shrink_to_fit`, a non-binding request that is not part of this challenge.
- References, pointers and iterators to elements are invalidated by any reallocation. That is the observable contract the "no reallocation after `reserve`" test relies on.

## Now read the real one

- libstdc++: the growth policy is `_M_check_len` in [`bits/stl_vector.h`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/stl_vector.h), which computes the new length as the old size plus the larger of the old size and the requested extra, and throws `length_error` past `max_size()`. The reallocation itself is `_M_realloc_append` (formerly `_M_realloc_insert` for the end case) in [`bits/vector.tcc`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/vector.tcc). Note how it constructs the new element in the new storage before relocating the old ones, which is the aliasing rule in code. Relocation of trivially relocatable-enough types goes through `std::__relocate_a`.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h). `__recommend` computes the new capacity, and the slow path (`__emplace_back_slow_path` in current sources) builds a `__split_buffer` (see [`__split_buffer`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__split_buffer)) with the new storage, constructs the new element in it, and swaps the buffers.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). `_Calculate_growth` implements the 1.5 factor and `_Emplace_reallocate` performs the reallocation, again constructing the new element first.

Standard: [vector.capacity], [container.reqmts]. cppreference: [`reserve`](https://en.cppreference.com/w/cpp/container/vector/reserve), [`capacity`](https://en.cppreference.com/w/cpp/container/vector/capacity).
