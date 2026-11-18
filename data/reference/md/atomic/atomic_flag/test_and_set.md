# std::atomic_flag::test_and_set

Source: https://en.cppreference.com/w/cpp/atomic/atomic_flag/test_and_set

```cpp
// Defined in header <atomic>

bool test_and_set( std::memory_order order =
                       std::memory_order_seq_cst ) volatile noexcept; // (1) (since C++11)

bool test_and_set( std::memory_order order =
                       std::memory_order_seq_cst ) noexcept; // (2) (since C++11)
```

Atomically changes the state of a `std::atomic_flag` to set (`true`) and returns the value it held before.

## Parameters

- `order` - the memory synchronization order

## See also

- [`clear`](https://en.cppreference.com/w/cpp/atomic/atomic_flag/clear): atomically sets flag to `false` (public member function)
- [`atomic_flag_test_and_set`](https://en.cppreference.com/w/cpp/atomic/atomic_flag_test_and_set) (C++11), [`atomic_flag_test_and_set_explicit`](https://en.cppreference.com/w/cpp/atomic/atomic_flag_test_and_set) (C++11): atomically sets the flag to `true` and returns its previous value (function)
- [`memory_order`](https://en.cppreference.com/w/cpp/atomic/memory_order) (C++11): defines memory ordering constraints for the given atomic operation (enum)
