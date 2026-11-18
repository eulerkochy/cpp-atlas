# std::timed_mutex::unlock

Source: https://en.cppreference.com/w/cpp/thread/timed_mutex/unlock

```cpp
void unlock(); // (since C++11)
```

Unlocks the mutex.

The mutex must be locked by the current thread of execution, otherwise, the behavior is undefined.

This operation *synchronizes-with* (as defined in `std::memory_order`) any subsequent lock operation that obtains ownership of the same mutex.

## Parameters

(none)

## Return value

(none)

## Exceptions

Throws nothing.

## Notes

`unlock()` is usually not called directly: `std::unique_lock` and `std::lock_guard` are used to manage exclusive locking.

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`lock`](https://en.cppreference.com/w/cpp/thread/timed_mutex/lock): locks the mutex, blocks if the mutex is not available (public member function)
- [`try_lock`](https://en.cppreference.com/w/cpp/thread/timed_mutex/try_lock): tries to lock the mutex, returns if the mutex is not available (public member function)
- [`try_lock_for`](https://en.cppreference.com/w/cpp/thread/timed_mutex/try_lock_for): tries to lock the mutex, returns if the mutex has been unavailable for the specified timeout duration (public member function)
- [`try_lock_until`](https://en.cppreference.com/w/cpp/thread/timed_mutex/try_lock_until): tries to lock the mutex, returns if the mutex has been unavailable until specified time point has been reached (public member function)
- [C documentation for `mtx_unlock`](https://en.cppreference.com/w/c/thread/mtx_unlock)
