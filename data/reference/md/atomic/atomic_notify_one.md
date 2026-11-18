# std::atomic_notify_one

Source: https://en.cppreference.com/w/cpp/atomic/atomic_notify_one

```cpp
// Defined in header <atomic>

template< class T >
void atomic_notify_one( std::atomic<T>* object ); // (1) (since C++20)

template< class T >
void atomic_notify_one( volatile std::atomic<T>* object ); // (2) (since C++20)
```

Performs atomic notifying operations.

If there is a thread blocked in atomic waiting operation (i.e. `std::atomic_wait()`, `std::atomic_wait_explicit()`, or `std::atomic::wait()`) on `*object`, then unblocks *at least* one such thread; otherwise does nothing.

Equivalent to `object->notify_one()`.

## Parameters

- `object` - pointer to the atomic object to notify

## Return value

(none)

## Notes

This form of change-detection is often more efficient than simple polling or pure spinlocks.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`notify_one`](https://en.cppreference.com/w/cpp/atomic/atomic/notify_one) (C++20): notifies at least one thread waiting on the atomic object (public member function of `std::atomic<T>`)
- [`notify_all`](https://en.cppreference.com/w/cpp/atomic/atomic/notify_all) (C++20): notifies all threads blocked waiting on the atomic object (public member function of `std::atomic<T>`)
- [`atomic_notify_all`](https://en.cppreference.com/w/cpp/atomic/atomic_notify_all) (C++20): notifies all threads blocked in atomic_wait (function template)
- [`atomic_wait`](https://en.cppreference.com/w/cpp/atomic/atomic_wait) (C++20), [`atomic_wait_explicit`](https://en.cppreference.com/w/cpp/atomic/atomic_wait) (C++20): blocks the thread until notified and the atomic value changes (function template)
