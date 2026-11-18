# std::atomic_ref<T>::notify_all

Source: https://en.cppreference.com/w/cpp/atomic/atomic_ref/notify_all

```cpp
void notify_all() const noexcept; // (constexpr since C++26)
```

Performs atomic notifying operations.

Unblocks all threads blocked in atomic waiting operations (i.e. `wait()`) on `*ptr`, if there are any; otherwise does nothing. This overload participates in overload resolution only if `std::is_const_v<T>` is `false`.

## Notes

This form of change-detection is often more efficient than simple polling or pure spinlocks.

## Example

> Note: This section is incomplete Reason: no example

## Defect reports

The following behavior-changing defect reports were applied retroactively to previously published C++ standards.

| DR | Applied to | Behavior as published | Correct behavior |
| --- | --- | --- | --- |
| LWG 3508 (P3323R1) | C++20 | `notify_all` was meaningless for `const T` | constrained to accept only non-const `T` |

## See also

- [`wait`](https://en.cppreference.com/w/cpp/atomic/atomic_ref/wait): blocks the thread until notified and the atomic value changes (public member function)
- [`atomic_wait`](https://en.cppreference.com/w/cpp/atomic/atomic_wait) (C++20), [`atomic_wait_explicit`](https://en.cppreference.com/w/cpp/atomic/atomic_wait) (C++20): blocks the thread until notified and the atomic value changes (function template)
- [`atomic_notify_one`](https://en.cppreference.com/w/cpp/atomic/atomic_notify_one) (C++20): notifies a thread blocked in atomic_wait (function template)
