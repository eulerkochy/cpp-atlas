# atomic_flag_test_and_set, atomic_flag_test_and_set_explicit

Source: https://en.cppreference.com/w/c/atomic/atomic_flag_test_and_set

```cpp
// Defined in header <stdatomic.h>
_Bool atomic_flag_test_and_set( volatile atomic_flag* obj ); // (1) (since C11)
_Bool atomic_flag_test_and_set_explicit( volatile atomic_flag* obj, memory_order order ); // (2) (since C11)
```

Atomically changes the state of a `atomic_flag` pointed to by `obj` to set (`true`) and returns the previous value. The first version orders memory accesses according to `memory_order_seq_cst`, the second version orders memory accesses according to `order`.

The argument is pointer to a volatile atomic flag to accept addresses of both non-volatile and volatile (e.g. memory-mapped I/O) atomic flags.

## Parameters

- `obj` - pointer to the atomic flag object to modify
- `order` - the memory synchronization ordering for this operation: all values are permitted

## Return value

The previous value held by the atomic flag pointed to by `obj`.

## References

- C17 standard (ISO/IEC 9899:2018):

  - 7.17.8.1 The atomic_flag_test_and_set functions (p: 209)

- C11 standard (ISO/IEC 9899:2011):

  - 7.17.8.1 The atomic_flag_test_and_set functions (p: 285-286)

## See also

- [`atomic_flag_clear`](https://en.cppreference.com/w/c/atomic/atomic_flag_clear) (C11), [`atomic_flag_clear_explicit`](https://en.cppreference.com/w/c/atomic/atomic_flag_clear): sets an atomic_flag to false (function)
- [C++ documentation for `atomic_flag_test_and_set, atomic_flag_test_and_set_explicit`](https://en.cppreference.com/w/cpp/atomic/atomic_flag_test_and_set)
