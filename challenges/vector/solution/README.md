# Reference solution (private)

`include/my/vector.hpp` is the canonical answer to all 8 stages: the learner's
starter header, completed. CI builds the stage tests against it with
`-DCPPATLAS_SOLUTION=ON` to prove every stage is passable. It is not shipped
in the learner template.

## Design notes

- **Representation**: `T* data_`, `size_`, `capacity_`; storage from
  `std::allocator<T>` (handles over-aligned `T`). Default constructor is
  `noexcept` and allocates nothing.
- **Growth**: `max(2 * capacity(), size() + 1)`, capped at `max_size()`
  (`PTRDIFF_MAX / sizeof(T)`, the libstdc++/libc++ bound). `reserve(n)` and
  growth past `max_size()` throw `std::length_error`.
- **One reallocation path**: `realloc_emplace(index, new_cap, args...)` serves
  `emplace_back`, `push_back`, `insert` and `emplace`; `reserve` uses
  `realloc_relocate_only`. Phase one (may throw): allocate, construct the new
  element at `index` first (so arguments aliasing the old buffer are still
  intact), relocate the prefix, relocate the suffix. On throw, destroy exactly
  the constructed range and free the buffer. Phase two (`commit`, noexcept):
  destroy old elements, free old buffer, adopt the new one.
- **Relocation**: move if `T` is nothrow-move-constructible or not copyable,
  otherwise copy (`std::move_if_noexcept` rule), via `std::uninitialized_move`
  / `std::uninitialized_copy` (both roll back on throw). Strong guarantee for
  reallocation whenever `T` is nothrow-movable or copyable; basic guarantee for
  move-only `T` with a throwing move. No memcpy fast path.
- **Copy constructor**: allocates exactly `size()`, `size()` copy
  constructions.
- **Copy assignment**: reuses capacity like libstdc++/libc++ (assign over live
  elements, construct the rest into raw storage, or destroy the surplus);
  allocates only when `other.size() > capacity()` (then copy-into-temporary +
  swap, strong in that branch). Basic guarantee overall. Self-assignment is a
  no-op.
- **Move constructor / move assignment**: pointer steal, `noexcept`, zero
  element operations, source left empty. Move assignment is
  `vector tmp(std::move(other)); swap(tmp);`, so self-move leaves the vector
  unchanged.
- **insert/emplace**: at `end()` with spare capacity, construct in place
  (strong). In the middle with spare capacity, an lvalue/emplace argument is
  first materialized into a local `T` (it may alias an element that the shift
  moves), then: move-construct the last element into the raw slot at `end()`,
  `std::move_backward` the rest, move-assign the new value into the hole
  (libstdc++'s observable sequence; libc++ instead copy-assigns from the
  pointer-adjusted original, so `insert(pos, const T&)` counts differ between
  the two libraries by one copy-construct+move-assign vs one copy-assign). An
  rvalue argument is moved in directly (no temporary).
- **erase**: `std::move` the tail left, destroy the moved-from tail: exactly
  `(end - last)` move assignments and `(last - first)` destructions, never
  reallocates.
- Extras beyond the stages: `max_size`, `at`, `front`, `back`, reverse
  iterators, `emplace`, member/friend `swap`, `operator==`.

## Extra tests

`tests/fuzz.cpp` is a differential fuzzer against `std::vector` with random
exception injection (`cppatlas::ThrowOn`), lifetime/leak checks, op-count
comparison, an over-aligned type and a `std::string` run. Build from
`challenges/vector`:

```sh
g++-16 -std=c++23 -Wall -Wextra -g -O1 -fsanitize=address,undefined \
  -isysroot "$(xcrun --show-sdk-path)" \
  -I solution/include -I tests/support solution/tests/fuzz.cpp -o /tmp/fuzz
/tmp/fuzz 2000 400 99     # sequences-per-type steps-per-sequence seed
```
