## Your task

Complete the rule of five and add the rvalue overload of `push_back`. Remove the `= delete` declarations from stage 2.

```cpp
void push_back(T&& value);

vector(const vector& other);
vector(vector&& other) noexcept;
vector& operator=(const vector& other);
vector& operator=(vector&& other) noexcept;
```

- `push_back(T&&)` moves the argument into the new element; `push_back(const T&)` copies it.
- The copy constructor makes a deep, independent copy: exactly `size()` copy constructions, no more.
- The move constructor steals the buffer pointer, size and capacity, and leaves `other` empty. It performs no element operations at all.
- Copy assignment must be correct when `this == &other`. Self-move-assignment is not tested, but leaving the object valid is still good practice.
- A vector of a move-only type must be able to grow via `push_back(T&&)`, so reallocation must relocate by move. If you copied during relocation in stage 3, switch now; otherwise the compiler error appears deep inside `std::construct_at`.

## What the tests check

- `push_back` of an rvalue invokes the element's move constructor; of an lvalue, the copy constructor.
- Move construction performs no element operations at all: the buffer is stolen, so `&dst[0]` is the old `&src[0]`.
- Move assignment performs no element copies or moves, and destroys exactly the target's old elements during the assignment.
- A moved-from vector remains usable: it can be pushed to, assigned to and destroyed. The standard only guarantees "valid but unspecified" for the source; in practice an empty vector is what you want.
- A copy is deep and independent: modifying one does not affect the other. The copy constructor performs exactly `size()` copy constructions and `capacity() >= size()`.
- `std::is_nothrow_move_constructible_v<my::vector<T>>` and `std::is_nothrow_move_assignable_v<my::vector<T>>` are true.
- Copy assignment works in both directions (smaller from larger, larger from smaller, into and from an empty vector), returns `*this`, and leaves no leaks. This includes the case where the source fits in the target's spare capacity: elements past the target's old size must be copy-constructed, not assigned into raw storage.
- Self-copy-assignment (`v = v`) leaves the vector unchanged.
- A move-only `T` works with `push_back(T&&)` and with moving the vector. Copying a vector of a move-only type does not need to compile.

## Hints

- Implement the move operations first; they are short. A move constructor can initialize its members to the empty state and then `std::exchange` the three members from `other`.
- Move assignment: destroy your elements and free your buffer, then steal `other`'s pointers and leave `other` empty (guard `this != &other`). Equivalently, `vector tmp(std::move(other));` followed by swapping the members of `*this` and `tmp` (a private helper; a public `swap` is not required) works, because `tmp`'s destructor releases the old contents before the assignment returns. The standard ([container.reqmts], `a = rv`) requires that all existing elements of `a` are either move assigned to or destroyed.
- For copy assignment there are two designs. Copy-and-swap (`vector tmp(other);` then swap the members of `*this` and `tmp`; a public `swap` member is not part of this challenge) gives the strong guarantee and handles self-assignment for free, but always allocates. Reusing existing capacity when `other.size() <= capacity()` avoids the allocation, at the cost of a more careful assign-then-construct-then-destroy sequence. Both pass the tests.
- Reuse stage 3's relocation function. `push_back(const T&)` and `push_back(T&&)` differ only in whether they construct from an lvalue or an rvalue; write a shared private helper for the common growth logic.

## Gotchas

- Marking the move operations `noexcept` is not decoration. Containers of your vector, and `std::vector<my::vector<T>>`, use `std::move_if_noexcept` when reallocating; without `noexcept` they copy your whole buffer. Pointer-stealing cannot throw, so the specification is free.
- Self-assignment: `v = v` with a naive "free then copy from other" frees the data it is about to copy. Self-move-assignment is not tested, but keep the object valid; the standard does not require it to be unchanged.
- In move assignment, if you steal without releasing your old buffer first, you leak.
- A bare `swap(other)` as the whole move assignment is a common shortcut, but it leaves your old elements alive inside `other` for an unbounded time. The tests reject it.
- Reallocation must relocate by move, or a vector of a move-only type cannot grow through `push_back(T&&)`. Copying in stage 3 is the usual cause of a confusing error inside `std::construct_at`.
- If `other` is left with a non-null pointer after the move, both destructors free the same buffer. Reset the source.
- Rule of five: once you write one of destructor, copy constructor, copy assignment, move constructor, move assignment, you should consider all five. Declaring a destructor or a copy operation suppresses the implicit move operations.

## Now read the real one

- libstdc++: [`bits/stl_vector.h`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/stl_vector.h). The move constructor is essentially a swap of the three pointers in the base class. Copy assignment lives in [`bits/vector.tcc`](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/bits/vector.tcc) and takes the reuse-capacity route: it allocates only when the source is larger than the current capacity.
- libc++: [`__vector/vector.h`](https://github.com/llvm/llvm-project/blob/main/libcxx/include/__vector/vector.h). Read the move constructor and how the move assignment distinguishes allocators that propagate or compare equal; with `std::allocator` it reduces to stealing.
- MSVC STL: [`stl/inc/vector`](https://github.com/microsoft/STL/blob/main/stl/inc/vector). The move operations transfer the `_Myfirst`, `_Mylast`, `_Myend` triple.

Standard: [container.reqmts] (container move and copy requirements), [vector.cons], [vector.modifiers]. cppreference: [`vector` constructors](https://en.cppreference.com/w/cpp/container/vector/vector), [`operator=`](https://en.cppreference.com/w/cpp/container/vector/operator%3D), [`std::move`](https://en.cppreference.com/w/cpp/utility/move).
