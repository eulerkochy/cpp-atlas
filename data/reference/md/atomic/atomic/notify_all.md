# std::atomic<T>::notify_all

Source: https://en.cppreference.com/w/cpp/atomic/atomic/notify_all

```cpp
void notify_all() noexcept; // (1) (since C++20) (constexpr since C++26)
void notify_all() volatile noexcept; // (2) (since C++20)
```

Performs atomic notifying operations.

Unblocks all threads blocked in atomic waiting operations (i.e. `wait()`) on `*this`, if there are any; otherwise does nothing.

## Notes

This form of change-detection is often more efficient than simple polling or pure spinlocks.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`wait`](https://en.cppreference.com/w/cpp/atomic/atomic/wait) (C++20): blocks the thread until notified and the atomic value changes (public member function)
- [`atomic_wait`](https://en.cppreference.com/w/cpp/atomic/atomic_wait) (C++20), [`atomic_wait_explicit`](https://en.cppreference.com/w/cpp/atomic/atomic_wait) (C++20): blocks the thread until notified and the atomic value changes (function template)
- [`atomic_notify_one`](https://en.cppreference.com/w/cpp/atomic/atomic_notify_one) (C++20): notifies a thread blocked in atomic_wait (function template)
