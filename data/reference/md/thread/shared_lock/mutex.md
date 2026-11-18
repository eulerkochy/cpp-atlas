# std::shared_lock<Mutex>::mutex

Source: https://en.cppreference.com/w/cpp/thread/shared_lock/mutex

```cpp
mutex_type* mutex() const noexcept; // (since C++14)
```

Returns a pointer to the associated mutex, or a null pointer if there is no associated mutex.

## Parameters

(none)

## Return value

Pointer to the associated mutex or a null pointer if there is no associated mutex.

## Example

> Note: This section is incomplete Reason: no example
