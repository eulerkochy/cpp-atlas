# std::shared_lock<Mutex>::swap

Source: https://en.cppreference.com/w/cpp/thread/shared_lock/swap

```cpp
template< class Mutex >
void swap( shared_lock<Mutex>& other ) noexcept; // (since C++14)
```

Exchanges the internal states of the lock objects.

## Parameters

- `other` - the lock to swap the state with

## Return value

(none)

## Example

> Note: This section is incomplete Reason: no example

## See also

- [`std::swap(std::shared_lock)`](https://en.cppreference.com/w/cpp/thread/shared_lock/swap2) (C++14): specializes the `std::swap` algorithm (function template)
