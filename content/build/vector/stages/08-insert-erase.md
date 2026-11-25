## Your task

Add positional insertion and erasure.

```cpp
iterator insert(const_iterator pos, const T& value);
iterator insert(const_iterator pos, T&& value);
iterator erase(const_iterator pos);
iterator erase(const_iterator first, const_iterator last);
```

`insert` places a new element before `pos` and returns an iterator to it. `erase` removes the element or range and returns an iterator to the element that followed the erased range (or `end()`). Elements after the gap shift by move operations. `insert` may reallocate; `erase` never does and never changes capacity.

## What the tests check

- Order of the remaining elements is preserved after every operation.
- `insert` returns an iterator to the inserted element; `erase` returns an iterator to the element after the erased range.
- Insertion at the beginning, in the middle and at the end, each with and without reallocation.
- Erasing an empty range (`first == last`) does nothing and returns `first`.
- `erase` has exact counts: the number of destructor calls equals the number of elements erased, and the number of move assignments equals the number of elements after the erased range. There are no copies and no reallocation, and elements before the erase point keep their addresses.
- For a type with a `noexcept` move, shifted elements are moved, not copied.
- Aliasing: `v.insert(v.begin(), v[v.size() - 1])` and `v.insert(v.begin(), v[1])` work, with and without spare capacity.
- A move-only `T` works with `insert(pos, T&&)` and `erase`.
- An lvalue `insert` performs one copy of the value; the tests bound the count rather than fixing it (see below).
- Moves during `insert` are only bounded linearly in the number of shifted elements, not fixed: both the shift-by-one approach and `emplace_back` followed by `std::rotate` pass.
- `back()` is not required; the tests do not call it.
- No leaks and no double destruction.

## Hints

- Convert first: `iterator p = begin() + (pos - cbegin());`. Do that before any reallocation and remember the index, not the pointer, because a reallocation invalidates `p`.
- Simple insert without reallocation, in order: if `p == end()`, just construct at the end. Otherwise move-construct the last element into the uninitialized slot at `end()`, then `std::move_backward` the range `[p, end() - 1)` to end at `end() - 1`, then move-assign the new value into `*p`.
- Erase is the mirror image: `std::move(last, end(), first)` to close the gap, then `std::destroy(first + (end() - last), end())` and shrink the size.
- Aliasing: if `value` refers into the vector, shifting may overwrite or move it before you read it. Make a local copy of the value (or construct a temporary `T`) before shifting. A simpler-to-write alternative is `emplace_back` followed by `std::rotate`, which also handles aliasing, because the new element is constructed before anything moves. It is correct and passes the tests, although it may spend up to roughly three moves per shifted element instead of one, so the shifting approach above is what libstdc++ and libc++ use.
- For the reallocating path, build the new buffer in three parts: elements before `p`, the new element, elements after `p`. Reuse the stage 6 rollback structure.

## Gotchas

- Shifting right must run backward, otherwise you overwrite elements you have not moved yet. `std::move_backward` is the algorithm that is safe for overlapping ranges when the destination is after the source; `std::move` is the one for shifting left.
- The slot at `end()` is uninitialized, so the last element must be move-constructed into it. The slots inside the old range hold live objects and must be move-assigned. Using assignment on the uninitialized slot, or construction on a live slot, is undefined behavior or a leak.
- `const_iterator` to `iterator` conversion: a `const T*` does not convert to `T*`. Use `begin() + (pos - cbegin())`, which stays within the standard's rules and works for any iterator type.
- Exception guarantees. Inserting a single element at the end behaves like `push_back` and has the strong guarantee. In the middle, if a copy or move constructor or assignment of `T` throws, the vector is left valid but in an unspecified state: only the basic guarantee, as the standard says. If no operation on `T` throws, neither does `insert` or `erase` (apart from allocation).
- When erasing the last elements, `erase(last_it)` returns `end()`. Never dereference it.
- Invalidation: `erase` invalidates iterators and references at or after the first erased element, including `end()`. `insert` without reallocation invalidates those at or after the insertion point; with reallocation it invalidates all of them. That is why the iterator you return is the only valid handle afterwards.

## Now read the real one

Copy counts for lvalue `insert` are only bounded by the tests because the libraries differ: libstdc++ copies the value into a temporary and then moves it into place, while libc++ adjusts the pointer if the argument lies inside the shifted range and copy-assigns it.

- libstdc++: [`bits/vector.tcc`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/vector.tcc) has `_M_insert_aux` for the non-reallocating single-element insert (a move-construct of the last element, then `std::move_backward`) and `_M_realloc_insert` for the reallocating one. `_M_erase` in the same file uses `std::move` to close the gap and `_Destroy` for the tail. The aliasing-sensitive path takes a copy of the argument before shifting.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h). `insert` handles the in-place case by shifting with a private helper (`__move_range`) and the reallocating case through a `__split_buffer` and `__swap_out_circular_buffer` ([`__split_buffer`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__split_buffer)); it also adjusts the pointer if the argument aliases the shifted range.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). read `emplace` and `insert` to see how a middle insertion is handled; MSVC's approach differs from the shift-then-assign form in libstdc++ and libc++, and appending followed by `std::rotate` is a legitimate strategy for your own implementation.

Standard: [vector.modifiers] (complexity and exception behavior of `insert` and `erase`), [container.reqmts], [sequence.reqmts]. cppreference: [`insert`](https://en.cppreference.com/w/cpp/container/vector/insert), [`erase`](https://en.cppreference.com/w/cpp/container/vector/erase), [`std::move_backward`](https://en.cppreference.com/w/cpp/algorithm/move_backward), [`std::rotate`](https://en.cppreference.com/w/cpp/algorithm/rotate), [Iterator invalidation](https://en.cppreference.com/w/cpp/container#Iterator_invalidation).
