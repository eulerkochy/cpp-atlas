# std::atomic_flag::clear

Source: https://en.cppreference.com/w/cpp/atomic/atomic_flag/clear

```cpp
// Defined in header <atomic>

void clear( std::memory_order order =
                std::memory_order_seq_cst ) volatile noexcept; // (1) (since C++11)

void clear( std::memory_order order =
                std::memory_order_seq_cst ) noexcept; // (2) (since C++11)
```

Atomically changes the state of a `std::atomic_flag` to clear (`false`).

If `order` is one of `std::memory_order_consume`, `std::memory_order_acquire` and `std::memory_order_acq_rel`, the behavior is undefined.

## Parameters

- `order` - the memory synchronization ordering

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 2138 | C++11 | `order` could be `std::memory_order_consume` | the behavior is undefined in this case |

## See also

- [`test_and_set`](https://en.cppreference.com/w/cpp/atomic/atomic_flag/test_and_set): atomically sets the flag to `true` and obtains its previous value (public member function)
- [`atomic_flag_clear`](https://en.cppreference.com/w/cpp/atomic/atomic_flag_clear) (C++11), [`atomic_flag_clear_explicit`](https://en.cppreference.com/w/cpp/atomic/atomic_flag_clear) (C++11): atomically sets the value of the flag to `false` (function)
- [`memory_order`](https://en.cppreference.com/w/cpp/atomic/memory_order) (C++11): defines memory ordering constraints for the given atomic operation (enum)
